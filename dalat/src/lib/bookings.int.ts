// Test tích hợp trên DB thật (DATABASE_URL). Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { BookingError, createBooking, transitionBooking, type CreateInput } from "./bookings";
import { expireHold, sendCheckinReminder, sweepExpiredHolds } from "./booking-jobs";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const tag = `it${Date.now()}`;
let hostId: string, brokerId: string, otherBrokerId: string, propId: string, extId: string;
let roomA: string, roomB: string;

const base = (over: Partial<CreateInput>): CreateInput => ({
  actorId: brokerId, as: "BROKER", propertyId: propId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
  checkIn: d("2030-03-01"), checkOut: d("2030-03-03"), guestName: "Khách", guestCount: 2, ...over,
});
const attempt = (i: CreateInput) => createBooking(i).then(() => "ok", (e) => (e instanceof BookingError ? "blocked" : `ERR ${e}`));

before(async () => {
  const mk = (n: string) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n, phone: null } });
  hostId = (await mk("host")).id; brokerId = (await mk("broker")).id; otherBrokerId = (await mk("other")).id;
  await prisma.hostBrokerLink.create({ data: { hostId, brokerId, status: "APPROVED", tier: "VIP" } });
  const p = await prisma.property.create({
    data: { sourceType: "HOST_MANAGED", hostId, name: tag, allowWholeUnit: true, allowIndividualRooms: true, baseWeekdayNet: 1000, baseWeekendNet: 2000 },
  });
  propId = p.id;
  roomA = (await prisma.room.create({ data: { propertyId: propId, name: "A", maxGuests: 2, baseWeekdayNet: 300, baseWeekendNet: 400 } })).id;
  roomB = (await prisma.room.create({ data: { propertyId: propId, name: "B", maxGuests: 2, baseWeekdayNet: 300, baseWeekendNet: 400 } })).id;
  extId = (await prisma.property.create({ data: { sourceType: "BROKER_EXTERNAL", createdByBrokerId: brokerId, name: `${tag}-ext` } })).id;
});

after(async () => {
  const ids = [propId, extId];
  await prisma.message.deleteMany({ where: { conversation: { booking: { propertyId: { in: ids } } } } });
  await prisma.conversation.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { propertyId: { in: ids } } });
  await prisma.property.deleteMany({ where: { id: { in: ids } } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("10 parallel whole-unit bookings on same dates → exactly one wins", async () => {
  const res = await Promise.all(Array.from({ length: 10 }, () => attempt(base({}))));
  assert.equal(res.filter((r) => r === "ok").length, 1, JSON.stringify(res));
  assert.ok(res.every((r) => r === "ok" || r === "blocked"), JSON.stringify(res));
});

test("whole unit vs rooms racing → cross-lock keeps exactly one group", async () => {
  const dates = { checkIn: d("2030-04-01"), checkOut: d("2030-04-03") };
  const res = await Promise.all([
    attempt(base({ ...dates, bookingType: "WHOLE_UNIT" })),
    attempt(base({ ...dates, bookingType: "ROOMS", roomIds: [roomA] })),
    attempt(base({ ...dates, bookingType: "ROOMS", roomIds: [roomB] })),
    attempt(base({ ...dates, bookingType: "ROOMS", roomIds: [roomA, roomB], guestCount: 4 })),
  ]);
  assert.ok(res.every((r) => r === "ok" || r === "blocked"), JSON.stringify(res));
  const rows = await prisma.booking.findMany({ where: { propertyId: propId, checkIn: dates.checkIn }, include: { rooms: true } });
  const whole = rows.filter((r) => r.bookingType === "WHOLE_UNIT");
  const roomIdsUsed = rows.flatMap((r) => r.rooms.map((x) => x.roomId));
  // hoặc đúng 1 nguyên căn và 0 phòng, hoặc 0 nguyên căn và các phòng không trùng nhau
  assert.ok((whole.length === 1 && roomIdsUsed.length === 0) || (whole.length === 0 && new Set(roomIdsUsed).size === roomIdsUsed.length && roomIdsUsed.length > 0));
});

test("rooms: different rooms OK, same room blocked, whole unit blocked", async () => {
  const dates = { checkIn: d("2030-05-01"), checkOut: d("2030-05-03") };
  await createBooking(base({ ...dates, bookingType: "ROOMS", roomIds: [roomA] }));
  await createBooking(base({ ...dates, bookingType: "ROOMS", roomIds: [roomB] }));
  assert.equal(await attempt(base({ ...dates, bookingType: "ROOMS", roomIds: [roomA] })), "blocked");
  assert.equal(await attempt(base({ ...dates, bookingType: "WHOLE_UNIT" })), "blocked");
});

test("back-to-back stays allowed (check-out day == next check-in)", async () => {
  await createBooking(base({ checkIn: d("2030-06-01"), checkOut: d("2030-06-03") }));
  assert.equal(await attempt(base({ checkIn: d("2030-06-03"), checkOut: d("2030-06-05") })), "ok");
  assert.equal(await attempt(base({ checkIn: d("2030-06-02"), checkOut: d("2030-06-04") })), "blocked");
});

test("pricing + commission; price below net rejected; weekend nights", async () => {
  // 2030-07-05 là Thứ Sáu → đêm 5 (T6) + đêm 6 (T7) = 2000 + 2000
  const b = await createBooking(base({ checkIn: d("2030-07-05"), checkOut: d("2030-07-07"), guestTotalPrice: 5000 }));
  assert.equal(Number(b.hostNetPrice), 4000);
  assert.equal(Number(b.commissionAmount), 1000);
  assert.match(b.bookingCode, /^DL-\d{4}-\d{3}$/);
  assert.equal(await attempt(base({ checkIn: d("2030-08-01"), checkOut: d("2030-08-02"), guestTotalPrice: 1 })), "blocked");
});

test("host cannot be impersonated: unlinked broker and wrong owner are rejected", async () => {
  assert.equal(await attempt(base({ actorId: otherBrokerId, checkIn: d("2030-09-01"), checkOut: d("2030-09-02") })), "blocked");
  assert.equal(await attempt(base({ actorId: brokerId, as: "HOST", checkIn: d("2030-09-01"), checkOut: d("2030-09-02") })), "blocked");
});

test("hold blocks, expired hold does not, expireHold cancels + system message", async () => {
  const dates = { checkIn: d("2030-10-01"), checkOut: d("2030-10-03") };
  const h = await createBooking(base({ ...dates, mode: "HOLD" }));
  assert.equal(h.status, "HOLDING");
  assert.equal(await attempt(base({ ...dates, actorId: brokerId })), "blocked");

  await prisma.booking.update({ where: { id: h.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await attempt(base({ ...dates, checkIn: d("2030-10-01"), checkOut: d("2030-10-03") })), "ok"); // hold hết hạn không chiếm lịch

  assert.equal(await expireHold(h.id), true);
  assert.equal(await expireHold(h.id), false); // idempotent
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: h.id } })).status, "CANCELLED");
  const msgs = await prisma.message.findMany({ where: { conversation: { bookingId: h.id } } });
  assert.ok(msgs.some((m) => m.senderId === null && /tự động huỷ/.test(m.content ?? "")));
});

test("confirm: valid hold confirms; expired hold cannot; sweep cancels leftovers", async () => {
  const a = await createBooking(base({ checkIn: d("2030-11-01"), checkOut: d("2030-11-02"), mode: "HOLD" }));
  const ok = await transitionBooking(brokerId, a.id, "CONFIRM");
  assert.equal(ok.status, "CONFIRMED");

  const b = await createBooking(base({ checkIn: d("2030-11-10"), checkOut: d("2030-11-11"), mode: "HOLD" }));
  await prisma.booking.update({ where: { id: b.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(transitionBooking(hostId, b.id, "CONFIRM"), BookingError);
  assert.ok((await sweepExpiredHolds()) >= 1);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "CANCELLED");
  await assert.rejects(transitionBooking(otherBrokerId, a.id, "CANCEL"), BookingError); // người ngoài
});

test("external homestay: no overlap check, confirmed immediately, own broker only", async () => {
  const mkExt = (over: Partial<CreateInput> = {}) =>
    createBooking(base({ propertyId: extId, checkIn: d("2030-12-01"), checkOut: d("2030-12-03"), hostNetPrice: 800, guestTotalPrice: 1000, manualRoomInfo: "Phòng 2", ...over }));
  const a = await mkExt();
  const b = await mkExt(); // trùng ngày vẫn được
  assert.equal(a.status, "CONFIRMED");
  assert.equal(a.bookingType, "EXTERNAL_MANUAL");
  assert.equal(b.hostId, null);
  await assert.rejects(mkExt({ actorId: otherBrokerId }), BookingError);
  await assert.rejects(mkExt({ mode: "HOLD" }), BookingError);
});

test("check-in reminder only for confirmed bookings", async () => {
  const c = await createBooking(base({ checkIn: d("2031-01-10"), checkOut: d("2031-01-11") }));
  assert.equal(await sendCheckinReminder(c.id), true);
  await transitionBooking(brokerId, c.id, "CANCEL");
  assert.equal(await sendCheckinReminder(c.id), false);
});
