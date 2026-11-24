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
