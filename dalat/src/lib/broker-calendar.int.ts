// Lịch CTV: Co-host thấy tên + SĐT mọi booking, CTV thường chỉ thấy booking của mình. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { addDays, parseDateOnly, todayVn } from "./format";
import { calendarBlocks } from "./broker-calendar";

const tag = `bc${Date.now()}`;
let host: string, co: string, ctv: string, pCo: string, pNorm: string;
const D = (n: number) => parseDateOnly(addDays(todayVn(), n))!;

before(async () => {
  const u = (x: string) => prisma.user.create({ data: { email: `${tag}-${x}@t.local`, fullName: x } });
  host = (await u("host")).id; co = (await u("co")).id; ctv = (await u("ctv")).id;
  await prisma.hostBrokerLink.create({ data: { hostId: host, brokerId: co, status: "APPROVED", accessRole: "CO_HOST", assignedPropertyIds: [] } });
  await prisma.hostBrokerLink.create({ data: { hostId: host, brokerId: ctv, status: "APPROVED" } });
  const p = (n: string) => prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId: host, name: `${tag}-${n}`, area: "TRUNG_TAM", baseWeekdayNet: 1, baseWeekendNet: 1 } });
  pCo = (await p("co")).id; pNorm = (await p("norm")).id;
  await prisma.hostBrokerLink.update({ where: { hostId_brokerId: { hostId: host, brokerId: co } }, data: { assignedPropertyIds: [pCo] } });
  const mk = (n: number, propertyId: string, brokerId: string | null) => prisma.booking.create({
    data: { bookingCode: `BC-${tag.slice(-6)}-${n}`, propertyId, hostId: host, brokerId, bookingType: "WHOLE_UNIT", checkIn: D(5 + n * 3), checkOut: D(7 + n * 3), guestName: `K${n}`, guestPhone: `090000000${n}`, guestCount: 2, status: "CONFIRMED", guestTotalPrice: 100, hostNetPrice: 80, commissionAmount: 20 },
  });
  await mk(1, pCo, ctv); await mk(2, pNorm, null); await mk(3, pNorm, co);
});

after(async () => {
  await prisma.booking.deleteMany({ where: { propertyId: { in: [pCo, pNorm] } } });
  await prisma.property.deleteMany({ where: { id: { in: [pCo, pNorm] } } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId: host } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

const range = [D(0), D(60), new Date()] as const;

test("Co-host: thấy tên + SĐT mọi booking ở căn được giao; căn khác chỉ booking của mình", async () => {
  const b = await calendarBlocks(co, [pCo, pNorm], ...range);
  const inCo = b.filter((x) => x.propertyId === pCo);
  assert.equal(inCo[0].guestName, "K1"); assert.equal(inCo[0].guestPhone, "0900000001");
  const norm = b.filter((x) => x.propertyId === pNorm);
  assert.equal(norm.find((x) => x.bookingId)?.guestName, "K3");
  assert.equal(norm.find((x) => !x.bookingId)?.guestName, null); // booking K2 của người khác: kín
});

test("CTV thường: chỉ thấy booking của mình, còn lại kín", async () => {
  const b = await calendarBlocks(ctv, [pCo, pNorm], ...range);
  const mine = b.find((x) => x.propertyId === pCo)!;
  assert.equal(mine.guestPhone, "0900000001"); assert.ok(mine.bookingId);
  for (const x of b.filter((x) => x.propertyId === pNorm)) { assert.equal(x.guestName, null); assert.equal(x.guestPhone, null); assert.equal(x.status, "BUSY"); }
});
