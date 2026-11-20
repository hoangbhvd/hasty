// Test tích hợp Co-host / Quản gia / Instant Book / Lịch trống tổng quan. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { BookingError, createBooking, markCleaned, transitionBooking } from "./bookings";
import { availabilityMatrix } from "./availability-matrix";
import { addDays, parseDateOnly, todayVn } from "./format";

const tag = `st${Date.now()}`;
const D = (n: number) => parseDateOnly(addDays(todayVn(), n))!;
let host: string, plain: string, instant: string, coHost: string, care: string, outsider: string;
let pA: string, pB: string, roomA: string;

const book = (as: { actor: string }, over: Record<string, unknown> = {}) => createBooking({
  actorId: as.actor, as: "BROKER", propertyId: pA, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
  checkIn: D(10), checkOut: D(12), guestName: "Khách", guestCount: 2, guestTotalPrice: 3_000_000, ...over,
} as never);
const rejects = (p: Promise<unknown>) => assert.rejects(p, BookingError);

before(async () => {
  const u = (x: string) => prisma.user.create({ data: { email: `${tag}-${x}@t.local`, fullName: x } });
  [host, plain, instant, coHost, care, outsider] = (await Promise.all(["host", "plain", "instant", "cohost", "care", "out"].map(u))).map((x) => x.id);
  const prop = (name: string) => prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId: host, name: `${tag}-${name}`, area: "TUYEN_LAM_PRENN_MIMOSA", baseWeekdayNet: 1_000_000, baseWeekendNet: 1_000_000, allowIndividualRooms: true } });
  pA = (await prop("A")).id; pB = (await prop("B")).id;
  roomA = (await prisma.room.create({ data: { propertyId: pA, name: "P1", maxGuests: 4 } })).id;
  const link = (brokerId: string, data: Record<string, unknown> = {}) => prisma.hostBrokerLink.create({ data: { hostId: host, brokerId, status: "APPROVED", ...data } as never });
  await link(plain); // mặc định: phải giữ phòng 30p
  await link(instant, { allowInstantBook: true });
  await link(coHost, { accessRole: "CO_HOST", assignedPropertyIds: [pA] }); // chỉ căn A
  await link(care, { accessRole: "CARETAKER", assignedPropertyIds: [pA] });
});
after(async () => {
  await prisma.message.deleteMany({ where: { conversation: { booking: { property: { name: { startsWith: tag } } } } } });
  await prisma.conversation.deleteMany({ where: { booking: { property: { name: { startsWith: tag } } } } });
  await prisma.transaction.deleteMany({ where: { booking: { property: { name: { startsWith: tag } } } } });
  await prisma.booking.deleteMany({ where: { property: { name: { startsWith: tag } } } });
  await prisma.room.deleteMany({ where: { property: { name: { startsWith: tag } } } });
  await prisma.property.deleteMany({ where: { name: { startsWith: tag } } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId: host } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("Đặt ngay: CTV thường chỉ được giữ 30p; CTV bật đặt ngay và Co-host chốt được; quản gia không đặt", async () => {
  await rejects(book({ actor: plain }));                                   // CONFIRM bị chặn
  const hold = await book({ actor: plain }, { mode: "HOLD", checkIn: D(20), checkOut: D(21) });
  assert.equal(hold.status, "HOLDING");
  const b1 = await book({ actor: instant }, { checkIn: D(30), checkOut: D(31) });
  assert.equal(b1.status, "CONFIRMED");
  const b2 = await book({ actor: coHost }, { checkIn: D(40), checkOut: D(41) });
  assert.equal(b2.status, "CONFIRMED");
  await rejects(book({ actor: care }, { mode: "HOLD", checkIn: D(50), checkOut: D(51) }));
  await rejects(book({ actor: care }, { checkIn: D(50), checkOut: D(51) }));
  // Co-host ở căn B (ngoài phạm vi được giao) chỉ là CTV thường
  await rejects(book({ actor: coHost }, { propertyId: pB, checkIn: D(60), checkOut: D(61) }));
  assert.equal((await book({ actor: coHost }, { propertyId: pB, mode: "HOLD", checkIn: D(60), checkOut: D(61) })).status, "HOLDING");
});

test("Co-host vẫn bị khoá chống trùng lịch", async () => {
  await book({ actor: coHost }, { checkIn: D(70), checkOut: D(72) });
  await rejects(book({ actor: coHost }, { checkIn: D(71), checkOut: D(73) }));
});

test("Quản gia/Co-host làm trạng thái trong phạm vi: check-in/out, dọn phòng; quản gia không chốt/huỷ", async () => {
  const b = await book({ actor: instant }, { checkIn: D(80), checkOut: D(82) });
  await rejects(transitionBooking(outsider, b.id, "CHECK_IN"));            // người lạ
  await rejects(transitionBooking(plain, b.id, "CHECK_IN"));               // CTV khác
  await rejects(transitionBooking(care, b.id, "CANCEL"));                  // quản gia không huỷ
  assert.equal((await transitionBooking(care, b.id, "CHECK_IN")).status, "CHECKED_IN");
  await rejects(markCleaned(care, b.id));                                   // chưa check-out
  assert.equal((await transitionBooking(care, b.id, "CHECK_OUT")).status, "CHECKED_OUT");
  assert.ok((await markCleaned(care, b.id)).cleanedAt);
  await rejects(markCleaned(plain, b.id));
  const c = await book({ actor: instant }, { checkIn: D(90), checkOut: D(91) });
  assert.equal((await transitionBooking(coHost, c.id, "CANCEL")).status, "CANCELLED"); // Co-host huỷ được
  // quản gia ngoài phạm vi (căn B) không có quyền
  const bb = await prisma.booking.create({ data: { bookingCode: `ST-${tag.slice(-6)}-B`, propertyId: pB, hostId: host, brokerId: instant, bookingType: "WHOLE_UNIT", checkIn: D(95), checkOut: D(96), guestName: "X", guestCount: 1, status: "CONFIRMED", guestTotalPrice: 1000, hostNetPrice: 800, commissionAmount: 200 } });
  await rejects(transitionBooking(care, bb.id, "CHECK_IN"));
});

test("Lịch trống: CTV thường chỉ thấy trạng thái người khác, không quá khứ; đơn của mình có tên", async () => {
  const x = await availabilityMatrix(plain, addDays(todayVn(), -30), 60);
  assert.equal(x.from, todayVn()); // bị ép về hôm nay
  const a = x.properties.find((p) => p.id === pA)!;
  const others = a.row.blocks.filter((b) => b.status !== "MINE");
  const json = JSON.stringify(others);
  assert.ok(others.length >= 2); assert.ok(others.every((b) => b.detail === undefined));
  for (const secret of ["Khách", "3000000", "guestTotal", "remaining"]) assert.ok(!json.includes(secret), secret);
  assert.ok(a.row.blocks.some((b) => b.status === "MINE" && b.detail?.guestName === "Khách")); // hold của chính plain
});

test("Lịch trống: đơn của mình hiện MINE kèm tên; phòng lẻ bị đơn nguyên căn khoá chéo", async () => {
  const x = await availabilityMatrix(instant, todayVn(), 60);
  const a = x.properties.find((p) => p.id === pA)!;
  const mine = a.row.blocks.filter((b) => b.status === "MINE");
  assert.ok(mine.length >= 1 && mine.every((b) => b.detail?.guestName === "Khách" && b.detail.remaining === undefined && b.detail.total === undefined));
  const room = a.rooms.find((r) => r.roomId === roomA)!;
  assert.ok(room.blocks.length > 0 && room.blocks.every((b) => b.status === "CROSS_LOCKED" || b.status === "MINE" || b.status === "BUSY"));
  assert.ok(room.blocks.filter((b) => b.status === "CROSS_LOCKED").every((b) => b.detail === undefined));
});

test("Lịch trống: Co-host thấy đủ đơn (kể cả tổng tiền, còn lại); quản gia thấy khách + còn lại nhưng không có tổng giá; 7 ngày gần nhất", async () => {
  const co = (await availabilityMatrix(coHost, todayVn(), 60)).properties;
  assert.deepEqual(co.map((p) => [p.name.slice(-1), p.role]), [["A", "CO_HOST"], ["B", "BROKER"]]); // B: chỉ là CTV
  const ca = co.find((p) => p.id === pA)!;
  const d = ca.row.blocks.find((b) => b.detail?.guestName === "Khách")!.detail!;
  assert.equal(d.total, 3_000_000); assert.equal(d.remaining, 3_000_000);
  const bBlocks = co.find((p) => p.id === pB)!.row.blocks;
  assert.ok(bBlocks.every((b) => !b.detail || b.status === "MINE")); // căn B: như CTV thường

  const cm = (await availabilityMatrix(care, addDays(todayVn(), -30), 30)).properties;
  assert.deepEqual(cm.map((p) => p.id), [pA]); // căn B ngoài phạm vi: không thấy
  assert.equal(cm[0].role, "CARETAKER");
  const cx = (await availabilityMatrix(care, addDays(todayVn(), -30), 30));
  assert.equal(cx.from, addDays(todayVn(), -7));
  const cd = cm[0].row.blocks.find((b) => b.detail)!.detail!;
  assert.equal(cd.total, undefined); assert.equal(typeof cd.remaining, "number");
  assert.ok(!JSON.stringify(cm).match(/hostNetPrice|commission|guestTotalPrice/));
});

test("Lịch trống: bộ lọc khu vực / hình thức", async () => {
  assert.equal((await availabilityMatrix(instant, undefined, 30, { area: "TRUNG_TAM" })).properties.length, 0);
  assert.equal((await availabilityMatrix(instant, undefined, 30, { area: "TUYEN_LAM_PRENN_MIMOSA" })).properties.length, 2);
  assert.equal((await availabilityMatrix(outsider, undefined, 30)).properties.length, 0); // chưa liên kết
});

test("Co-host chỉ thấy giá Net khi chủ nhà bật; quản gia và Co-host mặc định không bao giờ thấy", async () => {
  const net = (m: Awaited<ReturnType<typeof availabilityMatrix>>) => JSON.stringify(m);
  const off = await availabilityMatrix(coHost, todayVn(), 60);
  assert.ok(!net(off).includes("hostNet") && !net(off).includes("2000000"));
  await prisma.hostBrokerLink.updateMany({ where: { hostId: host, brokerId: coHost }, data: { coHostSeesNet: true } });
  const on = (await availabilityMatrix(coHost, todayVn(), 60)).properties.find((p) => p.id === pA)!;
  const d = on.row.blocks.map((b) => b.detail).filter(Boolean);
  assert.ok(d.length > 0 && d.every((x) => typeof x!.hostNet === "number" && x!.hostNet > 0));
  // chỉ ở căn Co-host được giao; căn B (chỉ là CTV thường) vẫn ẩn
  const b = (await availabilityMatrix(coHost, todayVn(), 60)).properties.find((p) => p.id === pB)!;
  assert.ok(!JSON.stringify(b).includes("hostNet"));
  // quản gia: dù bật cờ cũng không thấy
  await prisma.hostBrokerLink.updateMany({ where: { hostId: host, brokerId: care }, data: { coHostSeesNet: true } });
  assert.ok(!JSON.stringify(await availabilityMatrix(care, todayVn(), 60)).includes("hostNet"));
  // CTV thường thì không
  assert.ok(!JSON.stringify(await availabilityMatrix(plain, todayVn(), 60)).includes("hostNet"));
});
