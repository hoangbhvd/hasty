// Người tạo sửa thông tin booking. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { addDays, parseDateOnly, todayVn } from "./format";
import { BookingError, editBooking } from "./bookings";

const tag = `be${Date.now()}`;
let host: string, broker: string, other: string, prop: string, byBroker: string, byHost: string;
const D = (n: number) => parseDateOnly(addDays(todayVn(), n))!;

before(async () => {
  const u = (x: string) => prisma.user.create({ data: { email: `${tag}-${x}@t.local`, fullName: x } });
  host = (await u("host")).id; broker = (await u("broker")).id; other = (await u("other")).id;
  prop = (await prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId: host, name: `${tag}-A`, area: "TRUNG_TAM", baseWeekdayNet: 1, baseWeekendNet: 1 } })).id;
  const mk = (n: number, brokerId: string | null) => prisma.booking.create({
    data: { bookingCode: `BE-${tag.slice(-6)}-${n}`, propertyId: prop, hostId: host, brokerId, bookingType: "WHOLE_UNIT", checkIn: D(10 + n * 3), checkOut: D(12 + n * 3), guestName: "Cũ", guestCount: 2, status: "CONFIRMED", guestTotalPrice: 100, hostNetPrice: 80, commissionAmount: 20 },
  });
  byBroker = (await mk(1, broker)).id; byHost = (await mk(2, null)).id;
});

after(async () => {
  await prisma.message.deleteMany({ where: { conversation: { hostId: host } } });
  await prisma.conversation.deleteMany({ where: { hostId: host } });
  await prisma.booking.deleteMany({ where: { propertyId: prop } });
  await prisma.property.deleteMany({ where: { id: prop } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

const input = { guestName: "Mới", guestPhone: "0900000000", guestCount: 3, childCount: 2, guestNote: "ghi chú" };

test("CTV tạo booking sửa được; chủ nhà và người lạ thì không", async () => {
  const b = await editBooking(broker, byBroker, input);
  assert.equal(b.guestName, "Mới"); assert.equal(b.guestCount, 3); assert.equal(b.childCount, 2);
  await assert.rejects(editBooking(host, byBroker, input), BookingError);
  await assert.rejects(editBooking(other, byBroker, input), BookingError);
});

test("Chủ nhà tự tạo thì chủ nhà sửa được; booking đã huỷ thì không", async () => {
  assert.equal((await editBooking(host, byHost, input)).guestNote, "ghi chú");
  await prisma.booking.update({ where: { id: byHost }, data: { status: "CANCELLED" } });
  await assert.rejects(editBooking(host, byHost, input), BookingError);
});

test("sửa giá: CTV không bán thấp hơn Net, đổi tổng → hoa hồng đổi, lưu giá từng đêm; chủ nhà tự tạo thì Net = tổng", async () => {
  const mk = (n: number, brokerId: string | null) => prisma.booking.create({
    data: { bookingCode: `BE-${tag.slice(-6)}-p${n}`, propertyId: prop, hostId: host, brokerId, bookingType: "WHOLE_UNIT", checkIn: D(40 + n * 3), checkOut: D(42 + n * 3), guestName: "G", guestCount: 2, status: "CONFIRMED", guestTotalPrice: 100, hostNetPrice: 80, commissionAmount: 20 },
  });
  const bb = (await mk(1, broker)).id, hb = (await mk(2, null)).id;
  await assert.rejects(editBooking(broker, bb, { ...input, guestTotalPrice: 70 }), BookingError);
  const b = await editBooking(broker, bb, { ...input, guestTotalPrice: 150, nightlyPrices: [60, 90] });
  assert.equal(Number(b.guestTotalPrice), 150); assert.equal(Number(b.hostNetPrice), 80); assert.equal(Number(b.commissionAmount), 70);
  assert.deepEqual((b.nightlyPrices as { amount: number }[]).map((n) => n.amount), [60, 90]);
  // tổng không khớp giá từng đêm → bỏ chi tiết từng đêm
  assert.equal((await editBooking(broker, bb, { ...input, guestTotalPrice: 160, nightlyPrices: [60, 90] })).nightlyPrices, null);
  const h = await editBooking(host, hb, { ...input, guestTotalPrice: 120 });
  assert.equal(Number(h.guestTotalPrice), 120); assert.equal(Number(h.hostNetPrice), 120); assert.equal(Number(h.commissionAmount), 0);
  // không gửi giá → giữ nguyên
  assert.equal(Number((await editBooking(host, hb, input)).guestTotalPrice), 120);
});

test("sửa giờ nhận/trả phòng của booking", async () => {
  const b = await editBooking(broker, byBroker, { ...input, checkInTime: "10:30", checkOutTime: "15:00" });
  assert.equal(b.checkInTime, "10:30"); assert.equal(b.checkOutTime, "15:00");
  assert.equal((await editBooking(broker, byBroker, input)).checkInTime, "10:30"); // không gửi → giữ nguyên
});
