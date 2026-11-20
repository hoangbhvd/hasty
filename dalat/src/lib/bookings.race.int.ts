// Test tích hợp "trái tim hệ thống": khoá chéo Phòng lẻ ⇄ Nguyên căn và đặt đồng thời.
// Cần PostgreSQL thật (DATABASE_URL). Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { BookingError, createBooking, type CreateInput } from "./bookings";
import { occupyingWhere } from "./availability";

const DAY = 86_400_000;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const plus = (s: string, n: number) => new Date(d(s).getTime() + n * DAY);
const tag = `race${Date.now()}`;

let hostId: string, brokerId: string;
let propId: string, otherPropId: string;
let roomA: string, roomB: string;

// Mỗi test dùng 1 cửa sổ ngày riêng, không đụng nhau
let cursor = 0;
const window_ = (nights = 3) => {
  const start = plus("2032-01-01", cursor);
  cursor += nights + 5;
  return { checkIn: start, checkOut: new Date(start.getTime() + nights * DAY), start };
};

const input = (over: Partial<CreateInput>): CreateInput => ({
  actorId: brokerId, as: "BROKER", propertyId: propId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
  checkIn: d("2032-01-01"), checkOut: d("2032-01-02"), guestName: "Khách", guestCount: 2, ...over,
});

type Outcome = "ok" | "blocked";
const attempt = (i: CreateInput): Promise<Outcome> =>
  createBooking(i).then(
    () => "ok" as const,
    (e) => {
      if (e instanceof BookingError) return "blocked" as const;
      throw e; // lỗi lạ (deadlock, timeout...) phải làm test fail, không được nuốt
    },
  );
const count = (r: Outcome[], o: Outcome) => r.filter((x) => x === o).length;

/** Bất biến cốt lõi: không có 2 booking đang chiếm lịch nào xung đột trên cùng căn. */
async function assertNoConflicts(propertyId: string) {
  const rows = await prisma.booking.findMany({
    where: { propertyId, ...occupyingWhere(d("2000-01-01"), d("2100-01-01"), new Date()) },
    include: { rooms: true },
  });
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const overlap = a.checkIn < b.checkOut && b.checkIn < a.checkOut;
      if (!overlap) continue;
      const aRooms = new Set(a.rooms.map((r) => r.roomId));
      const conflict =
        a.bookingType === "WHOLE_UNIT" || b.bookingType === "WHOLE_UNIT" || b.rooms.some((r) => aRooms.has(r.roomId));
      assert.equal(conflict, false, `Overbooking! ${a.bookingCode} (${a.bookingType}) xung đột ${b.bookingCode} (${b.bookingType})`);
    }
  }
}

before(async () => {
  const mk = (n: string) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n } });
  hostId = (await mk("host")).id;
  brokerId = (await mk("broker")).id;
  await prisma.hostBrokerLink.create({ data: { hostId, brokerId, status: "APPROVED", allowInstantBook: true } });
  const mkProp = (name: string) =>
    prisma.property.create({
      data: { sourceType: "HOST_MANAGED", hostId, name: `${tag}-${name}`, allowWholeUnit: true, allowIndividualRooms: true, baseWeekdayNet: 1000, baseWeekendNet: 1000 },
    });
  propId = (await mkProp("main")).id;
  otherPropId = (await mkProp("other")).id;
  const mkRoom = (name: string) =>
    prisma.room.create({ data: { propertyId: propId, name, maxGuests: 2, baseWeekdayNet: 300, baseWeekendNet: 300 } });
  roomA = (await mkRoom("A")).id;
  roomB = (await mkRoom("B")).id;
});

after(async () => {
  const ids = [propId, otherPropId];
  await prisma.message.deleteMany({ where: { conversation: { booking: { propertyId: { in: ids } } } } });
  await prisma.conversation.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { propertyId: { in: ids } } });
  await prisma.property.deleteMany({ where: { id: { in: ids } } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

// ───────────────────── Tuần tự: phòng lẻ rồi nguyên căn ─────────────────────

test("đặt 1 phòng lẻ → đặt nguyên căn CÙNG ngày bị chặn", async () => {
  const w = window_();
  await createBooking(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] }));
  assert.equal(await attempt(input({ ...w, bookingType: "WHOLE_UNIT" })), "blocked");
  await assertNoConflicts(propId);
});

test("đặt 1 phòng lẻ → nguyên căn trùng MỘT PHẦN ngày (gối đầu 2 phía, nằm trọn bên trong, bao trùm) đều bị chặn", async () => {
  const w = window_(4); // phòng A ở [s, s+4)
  await createBooking(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] }));
  const cases: [string, number, number][] = [
    ["gối đầu phía trước", -2, 1],
    ["gối đầu phía sau", 3, 6],
    ["nằm trọn bên trong", 1, 2],
    ["bao trùm", -1, 5],
    ["trùng đúng 1 đêm đầu", 0, 1],
    ["trùng đúng 1 đêm cuối", 3, 4],
  ];
  for (const [label, from, to] of cases) {
    const r = await attempt(input({ bookingType: "WHOLE_UNIT", checkIn: plus(w.start.toISOString().slice(0, 10), from), checkOut: plus(w.start.toISOString().slice(0, 10), to) }));
    assert.equal(r, "blocked", label);
  }
  await assertNoConflicts(propId);
});

test("đặt 1 phòng lẻ → nguyên căn KHÔNG trùng đêm (liền kề) vẫn được", async () => {
  const w = window_(2);
  await createBooking(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] }));
  const s = w.start.toISOString().slice(0, 10);
  // check-in đúng ngày phòng check-out → hợp lệ
  assert.equal(await attempt(input({ bookingType: "WHOLE_UNIT", checkIn: plus(s, 2), checkOut: plus(s, 3) })), "ok");
  // check-out đúng ngày phòng check-in → hợp lệ
  assert.equal(await attempt(input({ bookingType: "WHOLE_UNIT", checkIn: plus(s, -1), checkOut: plus(s, 0) })), "ok");
  await assertNoConflicts(propId);
});

test("chiều ngược lại: nguyên căn trước → mọi phòng lẻ cùng ngày bị chặn", async () => {
  const w = window_();
  await createBooking(input({ ...w, bookingType: "WHOLE_UNIT" }));
  assert.equal(await attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] })), "blocked");
  assert.equal(await attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomB] })), "blocked");
  assert.equal(await attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomA, roomB], guestCount: 4 })), "blocked");
  await assertNoConflicts(propId);
});

test("booking nguyên căn đã HUỶ hoặc đã CHECKED_OUT không còn khoá phòng lẻ", async () => {
  const w = window_();
  const whole = await createBooking(input({ ...w, bookingType: "WHOLE_UNIT" }));
  assert.equal(await attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] })), "blocked");
  await prisma.booking.update({ where: { id: whole.id }, data: { status: "CANCELLED" } });
  assert.equal(await attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] })), "ok");
});

test("phòng lẻ đang HOLDING chặn nguyên căn; hold đã hết hạn thì không chặn nữa", async () => {
  const w = window_();
  const hold = await createBooking(input({ ...w, bookingType: "ROOMS", roomIds: [roomB], mode: "HOLD" }));
  assert.equal(hold.status, "HOLDING");
  assert.equal(await attempt(input({ ...w, bookingType: "WHOLE_UNIT" })), "blocked");
  await prisma.booking.update({ where: { id: hold.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await attempt(input({ ...w, bookingType: "WHOLE_UNIT" })), "ok");
});

test("khoá chéo chỉ áp dụng trong CÙNG căn: căn khác cùng ngày không bị ảnh hưởng", async () => {
  const w = window_();
  await createBooking(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] }));
  assert.equal(await attempt(input({ ...w, propertyId: otherPropId, bookingType: "WHOLE_UNIT" })), "ok");
});

// ───────────────────── Đồng thời: 2 request cùng lúc ─────────────────────

const ROUNDS = 25;

test(`2 request đồng thời: 1 phòng lẻ vs nguyên căn → đúng 1 thắng (${ROUNDS} vòng, cả 2 thứ tự gửi)`, async () => {
  for (let i = 0; i < ROUNDS; i++) {
    const w = window_(2);
    const room = () => attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] }));
    const whole = () => attempt(input({ ...w, bookingType: "WHOLE_UNIT" }));
    const res = i % 2 === 0 ? await Promise.all([room(), whole()]) : (await Promise.all([whole(), room()])).reverse();
    assert.equal(count(res, "ok"), 1, `vòng ${i}: ${JSON.stringify(res)}`);
    assert.equal(count(res, "blocked"), 1, `vòng ${i}: ${JSON.stringify(res)}`);
  }
  await assertNoConflicts(propId);
});

test(`2 request đồng thời: cùng nguyên căn → đúng 1 thắng (${ROUNDS} vòng)`, async () => {
  for (let i = 0; i < ROUNDS; i++) {
    const w = window_(2);
    const res = await Promise.all([attempt(input({ ...w })), attempt(input({ ...w }))]);
    assert.equal(count(res, "ok"), 1, `vòng ${i}: ${JSON.stringify(res)}`);
  }
  await assertNoConflicts(propId);
});

test(`2 request đồng thời: cùng 1 phòng lẻ → đúng 1 thắng (${ROUNDS} vòng)`, async () => {
  for (let i = 0; i < ROUNDS; i++) {
    const w = window_(2);
    const mk = () => attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] }));
    const res = await Promise.all([mk(), mk()]);
    assert.equal(count(res, "ok"), 1, `vòng ${i}: ${JSON.stringify(res)}`);
  }
  await assertNoConflicts(propId);
});

test("2 request đồng thời: 2 phòng lẻ KHÁC nhau → cả hai đều thành công (khoá không quá tay)", async () => {
  for (let i = 0; i < 10; i++) {
    const w = window_(2);
    const res = await Promise.all([
      attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomA] })),
      attempt(input({ ...w, bookingType: "ROOMS", roomIds: [roomB] })),
    ]);
    assert.deepEqual(res, ["ok", "ok"], `vòng ${i}`);
  }
  await assertNoConflicts(propId);
});

test("2 request đồng thời trên 2 căn KHÁC nhau cùng ngày → cả hai thành công", async () => {
  const w = window_(2);
  const res = await Promise.all([
    attempt(input({ ...w, propertyId: propId })),
    attempt(input({ ...w, propertyId: otherPropId })),
  ]);
  assert.deepEqual(res, ["ok", "ok"]);
});

test("2 request đồng thời: trùng MỘT PHẦN ngày (gối đầu) → đúng 1 thắng", async () => {
  for (let i = 0; i < 10; i++) {
    const w = window_(4);
    const s = w.start.toISOString().slice(0, 10);
    const res = await Promise.all([
      attempt(input({ bookingType: "WHOLE_UNIT", checkIn: plus(s, 0), checkOut: plus(s, 3) })),
      attempt(input({ bookingType: "ROOMS", roomIds: [roomA], checkIn: plus(s, 2), checkOut: plus(s, 4) })),
    ]);
    assert.equal(count(res, "ok"), 1, `vòng ${i}: ${JSON.stringify(res)}`);
  }
  await assertNoConflicts(propId);
});

test("tải nặng: 20 request hỗn hợp (nguyên căn + phòng lẻ) cùng lúc → không overbooking, không lỗi lạ", async () => {
  const w = window_(2);
  const reqs = Array.from({ length: 20 }, (_, i) =>
    i % 5 === 0
      ? attempt(input({ ...w, bookingType: "WHOLE_UNIT" }))
      : attempt(input({ ...w, bookingType: "ROOMS", roomIds: [i % 2 ? roomA : roomB] })),
  );
  const res = await Promise.all(reqs);
  assert.ok(count(res, "ok") >= 1);
  // Kết quả hợp lệ duy nhất: hoặc 1 nguyên căn thắng, hoặc tối đa 2 phòng (A, B) thắng
  const rows = await prisma.booking.findMany({ where: { propertyId: propId, checkIn: w.checkIn }, include: { rooms: true } });
  const wholeWins = rows.filter((r) => r.bookingType === "WHOLE_UNIT").length;
  const roomWins = rows.filter((r) => r.bookingType === "ROOMS").length;
  assert.ok((wholeWins === 1 && roomWins === 0) || (wholeWins === 0 && roomWins >= 1 && roomWins <= 2), `whole=${wholeWins} rooms=${roomWins}`);
  await assertNoConflicts(propId);
});

test("HOLD và CONFIRM đồng thời trên cùng ngày → đúng 1 thắng", async () => {
  for (let i = 0; i < 10; i++) {
    const w = window_(2);
    const res = await Promise.all([
      attempt(input({ ...w, mode: "HOLD" })),
      attempt(input({ ...w, mode: "CONFIRM" })),
    ]);
    assert.equal(count(res, "ok"), 1, `vòng ${i}: ${JSON.stringify(res)}`);
  }
  await assertNoConflicts(propId);
});
