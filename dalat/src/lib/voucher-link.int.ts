// Test tích hợp link voucher: tạo lại token, hạn dùng. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { createBooking } from "./bookings";
import { getVoucherData, getVoucherQrUrl, getVoucherResult } from "./voucher";
import { VoucherLinkError, regenerateVoucherToken, setVoucherExpiry } from "./voucher-link";

const tag = `vl${Date.now()}`;
let hostId: string, otherId: string, propId: string, bookingId: string, token: string;

before(async () => {
  const u = (n: string) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n } });
  hostId = (await u("host")).id; otherId = (await u("other")).id;
  propId = (await prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId, name: `${tag}-p`, baseWeekdayNet: 1_000_000, baseWeekendNet: 1_000_000 } })).id;
  const b = await createBooking({
    actorId: hostId, as: "HOST", propertyId: propId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
    checkIn: new Date("2037-03-02T00:00:00Z"), checkOut: new Date("2037-03-03T00:00:00Z"), guestName: "K", guestCount: 2, guestTotalPrice: 1_000_000,
  });
  bookingId = b.id; token = b.voucherToken;
});
after(async () => {
  await prisma.booking.deleteMany({ where: { propertyId: propId } });
  await prisma.property.deleteMany({ where: { id: propId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("tạo lại link: link cũ chết, link mới dùng được", async () => {
  assert.equal((await getVoucherResult(token)).kind, "ok");
  const fresh = await regenerateVoucherToken(hostId, bookingId);
  assert.notEqual(fresh, token);
  assert.equal((await getVoucherResult(token)).kind, "missing");
  assert.equal((await getVoucherData(token)), null);
  assert.equal((await getVoucherResult(fresh)).kind, "ok");
  token = fresh;
});

test("hết hạn: trang trả 'expired', QR không còn; bỏ hạn thì dùng lại được", async () => {
  await setVoucherExpiry(hostId, bookingId, 1);
  assert.equal((await getVoucherResult(token)).kind, "ok");
  await prisma.booking.update({ where: { id: bookingId }, data: { voucherExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await getVoucherResult(token)).kind, "expired");
  assert.equal(await getVoucherData(token), null);
  assert.equal(await getVoucherQrUrl(token), null);
  assert.equal(await setVoucherExpiry(hostId, bookingId, null), null);
  assert.equal((await getVoucherResult(token)).kind, "ok");
});

test("người ngoài không đổi được link/hạn; số ngày sai bị từ chối", async () => {
  await assert.rejects(regenerateVoucherToken(otherId, bookingId), VoucherLinkError);
  await assert.rejects(setVoucherExpiry(otherId, bookingId, 7), VoucherLinkError);
  await assert.rejects(setVoucherExpiry(hostId, bookingId, 0), VoucherLinkError);
  await assert.rejects(setVoucherExpiry(hostId, bookingId, 400), VoucherLinkError);
});
