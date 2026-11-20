// Test tích hợp số liệu trang Tổng quan. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { addDays, parseDateOnly, todayVn } from "./format";
import { brokerOverview, hostOverview } from "./overview";
import { createOffer, createRoomRequest } from "./requests";

const tag = `ov${Date.now()}`;
const D = (offset: number) => parseDateOnly(addDays(todayVn(), offset))!;
let host: string, host2: string, broker: string, broker2: string, prop: string, prop2: string;
let n = 0;

async function mk(over: Record<string, unknown> & { propertyId?: string; checkIn: Date; checkOut: Date; status: string }) {
  const { propertyId, ...rest } = over;
  const isOther = propertyId === prop2;
  return prisma.booking.create({
    data: {
      bookingCode: `OV-${tag.slice(-6)}-${++n}`, propertyId: propertyId ?? prop, hostId: isOther ? host2 : host, brokerId: broker,
      bookingType: "WHOLE_UNIT", guestName: `K${n}`, guestCount: 2, guestTotalPrice: 1000, hostNetPrice: 800, commissionAmount: 200,
      ...rest,
    } as never,
  });
}

before(async () => {
  const u = (x: string) => prisma.user.create({ data: { email: `${tag}-${x}@t.local`, fullName: x } });
  host = (await u("host")).id; host2 = (await u("host2")).id; broker = (await u("broker")).id; broker2 = (await u("broker2")).id;
  await prisma.hostBrokerLink.create({ data: { hostId: host, brokerId: broker, status: "APPROVED", allowInstantBook: true } });
  await prisma.hostBrokerLink.create({ data: { hostId: host, brokerId: broker2, status: "PENDING" } });
  const p = (hostId: string, name: string) => prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId, name: `${tag}-${name}`, area: "TUYEN_LAM_PRENN_MIMOSA", baseWeekdayNet: 1_000_000, baseWeekendNet: 1_000_000 } });
  prop = (await p(host, "A")).id; prop2 = (await p(host2, "B")).id;
});

after(async () => {
  const ids = [prop, prop2];
  await prisma.roomRequestOffer.deleteMany({ where: { propertyId: { in: ids } } });
  await prisma.roomRequest.deleteMany({ where: { brokerId: { in: [broker, broker2] } } });
  await prisma.transaction.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.message.deleteMany({ where: { conversation: { OR: [{ hostId: { in: [host, host2] } }] } } });
  await prisma.conversation.deleteMany({ where: { hostId: { in: [host, host2] } } });
  await prisma.booking.deleteMany({ where: { propertyId: { in: ids } } });
  await prisma.property.deleteMany({ where: { id: { in: ids } } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId: { in: [host, host2] } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("Host: check-in hôm nay / ngày mai, loại bỏ ngày kia, đã huỷ, đang giữ và căn của Host khác", async () => {
  const t = await mk({ checkIn: D(0), checkOut: D(2), status: "CONFIRMED" });
  const m = await mk({ checkIn: D(1), checkOut: D(3), status: "CONFIRMED" });
  await mk({ checkIn: D(2), checkOut: D(4), status: "CONFIRMED" }); // ngày kia
  await mk({ checkIn: D(0), checkOut: D(1), status: "CANCELLED" });
  await mk({ checkIn: D(0), checkOut: D(1), status: "HOLDING", holdExpiresAt: new Date(Date.now() + 600_000) });
  await mk({ propertyId: prop2, checkIn: D(0), checkOut: D(1), status: "CONFIRMED" }); // Host khác

  const o = await hostOverview(host);
  assert.deepEqual(o.arrivalsToday.map((b) => b.id), [t.id]);
  assert.deepEqual(o.arrivalsTomorrow.map((b) => b.id), [m.id]);
  assert.equal(o.today, todayVn());
});

test("Host: đang ở + check-out hôm nay", async () => {
  const stay = await mk({ checkIn: D(-2), checkOut: D(0), status: "CHECKED_IN" });
  const later = await mk({ checkIn: D(-1), checkOut: D(3), status: "CHECKED_IN" });
  const o = await hostOverview(host);
  assert.ok(o.staying.map((b) => b.id).includes(stay.id) && o.staying.map((b) => b.id).includes(later.id));
  assert.deepEqual(o.departuresToday.map((b) => b.id).filter((id) => [stay.id, later.id].includes(id)), [stay.id]);
});

test("Giữ phòng: chỉ còn hiệu lực, sắp hết hạn xếp trước, có số phút còn lại; hết hạn bị loại", async () => {
  const soon = await mk({ checkIn: D(10), checkOut: D(11), status: "HOLDING", holdExpiresAt: new Date(Date.now() + 5 * 60_000) });
  const later = await mk({ checkIn: D(12), checkOut: D(13), status: "HOLDING", holdExpiresAt: new Date(Date.now() + 25 * 60_000) });
  const dead = await mk({ checkIn: D(14), checkOut: D(15), status: "HOLDING", holdExpiresAt: new Date(Date.now() - 60_000) });
  const o = await hostOverview(host);
  const ids = o.holds.map((b) => b.id);
  assert.ok(ids.indexOf(soon.id) >= 0 && ids.indexOf(soon.id) < ids.indexOf(later.id));
  assert.ok(!ids.includes(dead.id));
  const s = o.holds.find((b) => b.id === soon.id)!;
  assert.ok(s.minutesLeft! >= 4 && s.minutesLeft! <= 5, String(s.minutesLeft));
  // CTV chỉ thấy giữ phòng của mình
  assert.ok((await brokerOverview(broker2)).holds.length === 0);
  assert.ok((await brokerOverview(broker)).holds.map((b) => b.id).includes(soon.id));
  assert.equal((await brokerOverview(broker)).todo.expiringHolds >= 1, true); // soon còn ≤ 10 phút
});

test("Việc cần xử lý của Host: giao dịch, CTV chờ duyệt, yêu cầu giữ phòng, tin chưa đọc", async () => {
  const b = await mk({ checkIn: D(20), checkOut: D(21), status: "CONFIRMED" });
  const other = await mk({ propertyId: prop2, checkIn: D(20), checkOut: D(21), status: "CONFIRMED" });
  const tx = (bookingId: string, receiverRole: "HOST" | "BROKER", status: "PENDING_CONFIRM" | "CONFIRMED") =>
    prisma.transaction.create({ data: { bookingId, payerRole: "GUEST", receiverRole, amount: 1000, txType: "DEPOSIT", status } });
  await tx(b.id, "HOST", "PENDING_CONFIRM");   // đếm
  await tx(b.id, "HOST", "CONFIRMED");         // không đếm
  await tx(b.id, "BROKER", "PENDING_CONFIRM"); // chờ CTV, không phải Host
  await tx(other.id, "HOST", "PENDING_CONFIRM"); // Host khác

  const conv = await prisma.conversation.create({ data: { hostId: host, brokerId: broker } });
  const msg = (status: string) => prisma.message.create({ data: { conversationId: conv.id, senderId: broker, msgType: "ACTION_HOLD_REQ", content: "x", metadata: { status } } });
  await msg("PENDING"); await msg("ACCEPTED");
  await prisma.message.create({ data: { conversationId: conv.id, senderId: broker, msgType: "TEXT", content: "chào" } });

  const o = await hostOverview(host);
  assert.equal(o.todo.pendingTx, 1);
  assert.equal(o.todo.pendingTxBookingId, b.id); // 1 booking duy nhất → dẫn thẳng tới đó
  assert.equal(o.todo.pendingLinks, 1); // broker2 đang PENDING
  assert.equal(o.todo.holdRequests, 1);
  assert.equal(o.todo.unread, 3);
  // Host khác không bị ảnh hưởng
  const o2 = await hostOverview(host2);
  assert.equal(o2.todo.pendingTx, 1); assert.equal(o2.todo.holdRequests, 0); assert.equal(o2.todo.unread, 0); assert.equal(o2.todo.pendingLinks, 0);

  // CTV: giao dịch chờ CTV xác nhận = 1; tin chưa đọc của CTV = 3 (tin do chính CTV gửi không tính)
  const ob = await brokerOverview(broker);
  assert.equal(ob.todo.pendingTx, 1);
  assert.equal(ob.todo.unread, 0);
});

test("Tìm gấp: Host thấy yêu cầu phù hợp; CTV thấy yêu cầu mở và số đề xuất", async () => {
  const r = await createRoomRequest(broker, { checkIn: addDays(todayVn(), 40), checkOut: addDays(todayVn(), 42), guestCount: 2, hoursValid: 24 });
  assert.equal((await hostOverview(host)).todo.urgentRequests, 1);
  assert.equal((await hostOverview(host2)).todo.urgentRequests, 0); // chưa liên kết

  let ob = await brokerOverview(broker);
  assert.equal(ob.todo.openRequests, 1); assert.equal(ob.todo.newOffers, 0);
  await createOffer(host, r.request.id, prop, 900_000);
  ob = await brokerOverview(broker);
  assert.equal(ob.todo.newOffers, 1);
});

test("Tóm tắt tháng: doanh thu Host, hoa hồng CTV khớp sổ", async () => {
  const base = parseDateOnly(todayVn().slice(0, 7) + "-01")!;
  const fin = await prisma.booking.create({
    data: {
      bookingCode: `OV-${tag.slice(-6)}-fin`, propertyId: prop, hostId: host, brokerId: broker, bookingType: "WHOLE_UNIT",
      checkIn: base, checkOut: new Date(base.getTime() + 86_400_000), guestName: "Fin", guestCount: 1, status: "CONFIRMED",
      guestTotalPrice: 5_000_000, hostNetPrice: 4_000_000, commissionAmount: 1_000_000,
    },
  });
  const before = await hostOverview(host);
  assert.ok(before.month.revenue >= 4_000_000);
  // Chưa có giao dịch nào → KHÁCH nợ chủ, CTV chưa nợ gì
  await prisma.transaction.create({ data: { bookingId: fin.id, payerRole: "GUEST", receiverRole: "BROKER", amount: 2_000_000, txType: "DEPOSIT", status: "CONFIRMED", confirmedAt: new Date() } });
  const h = await hostOverview(host);
  // Khách cọc 2tr cho CTV, hoa hồng 1tr → CTV nợ chủ 1tr
  assert.ok(h.month.brokerOwesYou > before.month.brokerOwesYou); // (DB dùng chung: không so số tuyệt đối)
  const b = await brokerOverview(broker);
  assert.ok(b.month.commission >= 1_000_000);
  assert.ok(b.month.youOwe >= 1_000_000);
});
