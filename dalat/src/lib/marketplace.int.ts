// Test tích hợp chợ kết nối + hồ sơ uy tín CTV (spec 9). Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { listDirectory, getDirectoryItem } from "./directory";
import { LinkError, cancelRequest, requestCollab, respondRequest } from "./links";
import { brokerTrust } from "./broker-trust";

const tag = `mk${Date.now()}`;
let host: string, broker: string, other: string, pubId: string, hiddenId: string, extId: string;
let n = 0;

before(async () => {
  const u = (x: string) => prisma.user.create({ data: { email: `${tag}-${x}@t.local`, fullName: x } });
  host = (await u("host")).id; broker = (await u("broker")).id; other = (await u("other")).id;
  const p = (name: string, extra: Record<string, unknown>) => prisma.property.create({
    data: { sourceType: "HOST_MANAGED", hostId: host, name: `${tag}-${name}`, area: "TUYEN_LAM", baseWeekdayNet: 1_234_000, baseWeekendNet: 1_500_000, caretakerPhone: "0900000001", address: "Hẻm bí mật 12", publicPriceRange: "2.000k - 3.500k/đêm", ...extra },
  });
  pubId = (await p("pub", {})).id;
  hiddenId = (await p("hidden", { isPublicDirectory: false })).id;
  extId = (await prisma.property.create({ data: { sourceType: "BROKER_EXTERNAL", createdByBrokerId: other, name: `${tag}-ext` } })).id;
});

after(async () => {
  await prisma.transaction.deleteMany({ where: { booking: { property: { name: { startsWith: tag } } } } });
  await prisma.booking.deleteMany({ where: { property: { name: { startsWith: tag } } } });
  await prisma.property.deleteMany({ where: { name: { startsWith: tag } } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId: host } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("Chợ: chỉ căn HOST_MANAGED đang mở; không lộ giá Net, SĐT, địa chỉ", async () => {
  const ids = (await listDirectory(broker)).map((p) => p.id);
  assert.ok(ids.includes(pubId));
  assert.ok(!ids.includes(hiddenId)); // chủ nhà đã tắt
  assert.ok(!ids.includes(extId)); // căn ngoài không lên chợ
  const item = await getDirectoryItem(broker, pubId);
  assert.equal(item?.priceRange, "2.000k - 3.500k/đêm");
  const json = JSON.stringify(item);
  for (const secret of ["1234000", "1500000", "0900000001", "Hẻm bí mật", "caretaker", "baseWeekdayNet", "googleMaps"]) assert.ok(!json.includes(secret), secret);
  assert.equal(await getDirectoryItem(broker, hiddenId), null);
  // chủ nhà không thấy căn của chính mình trong chợ
  assert.ok(!(await listDirectory(host)).some((p) => p.id === pubId));
});

test("Xin cộng tác: PENDING kèm lời nhắn, xin lại không ghi đè, huỷ được", async () => {
  assert.equal((await getDirectoryItem(broker, pubId))?.link, "NONE");
  const l = await requestCollab(broker, host, "  Em chạy ads villa  ");
  assert.equal(l.status, "PENDING"); assert.equal(l.requestNote, "Em chạy ads villa");
  await requestCollab(broker, host, "đổi lời nhắn"); // đang PENDING → giữ nguyên
  assert.equal((await prisma.hostBrokerLink.findUniqueOrThrow({ where: { id: l.id } })).requestNote, "Em chạy ads villa");
  assert.equal((await getDirectoryItem(broker, pubId))?.link, "PENDING");
  await cancelRequest(broker, host);
  assert.equal(await prisma.hostBrokerLink.count({ where: { hostId: host, brokerId: broker } }), 0);
  await assert.rejects(cancelRequest(broker, host), LinkError);
  await assert.rejects(requestCollab(host, host), LinkError);
});

test("Duyệt 2 chiều: từ chối rồi xin lại, duyệt kèm hạng, không xử lý hai lần", async () => {
  const l = await requestCollab(broker, host, "lần 1");
  await respondRequest(host, l.id, { decision: "REJECT" });
  let row = await prisma.hostBrokerLink.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(row.status, "REJECTED"); assert.ok(row.respondedAt);
  assert.equal((await getDirectoryItem(broker, pubId))?.link, "REJECTED");

  await requestCollab(broker, host, "lần 2"); // được xin lại
  row = await prisma.hostBrokerLink.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(row.status, "PENDING"); assert.equal(row.requestNote, "lần 2"); assert.equal(row.respondedAt, null);

  await assert.rejects(respondRequest(other, l.id, { decision: "APPROVE", tier: "VIP" }), LinkError); // sai chủ nhà
  await respondRequest(host, l.id, { decision: "APPROVE", tier: "VIP" });
  row = await prisma.hostBrokerLink.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(row.status, "APPROVED"); assert.equal(row.tier, "VIP");
  await assert.rejects(respondRequest(host, l.id, { decision: "REJECT" }), LinkError); // đã xử lý
});

test("Bị chặn thì không xin lại được", async () => {
  await prisma.hostBrokerLink.updateMany({ where: { hostId: host, brokerId: broker }, data: { status: "BLOCKED" } });
  await requestCollab(broker, host, "xin lại");
  assert.equal((await prisma.hostBrokerLink.findFirstOrThrow({ where: { hostId: host, brokerId: broker } })).status, "BLOCKED");
});

test("Hồ sơ uy tín: chỉ đơn HOST_MANAGED CHECKED_OUT; đơn tự nhập không tính; hủy sau cọc bị trừ", async () => {
  const mk = (propertyId: string, status: string, nights: number, guests: number) => {
    const ci = new Date("2040-01-01T00:00:00Z");
    return prisma.booking.create({
      data: {
        bookingCode: `MK-${tag.slice(-6)}-${++n}`, propertyId, hostId: propertyId === extId ? null : host, brokerId: other, bookingType: "WHOLE_UNIT",
        checkIn: ci, checkOut: new Date(ci.getTime() + nights * 86_400_000), guestName: "K", guestCount: guests, guestTotalPrice: 1000, hostNetPrice: 800, commissionAmount: 200, status,
      } as never,
    });
  };
  const before = await brokerTrust(other);
  assert.equal(before.orders, 0); assert.equal(before.badge, "NEW"); assert.equal(before.completionRate, null);
  await mk(pubId, "CHECKED_OUT", 2, 3);
  await mk(pubId, "CHECKED_OUT", 1, 2);
  await mk(extId, "CHECKED_OUT", 9, 9); // tự nhập: bỏ qua
  const t = await brokerTrust(other);
  assert.deepEqual([t.orders, t.guests, t.nights, t.cancelledAfterConfirm], [2, 5, 3, 0]);
  assert.equal(t.score, 2 * 10 + 3 * 2); assert.equal(t.completionRate, 1);

  const c = await mk(pubId, "CANCELLED", 1, 1);
  await mk(pubId, "CANCELLED", 1, 1); // hold hết hạn, chưa có giao dịch → không tính
  await prisma.transaction.create({ data: { bookingId: c.id, payerRole: "GUEST", receiverRole: "HOST", amount: 100, txType: "DEPOSIT", status: "CONFIRMED" } });
  const t2 = await brokerTrust(other);
  assert.equal(t2.cancelledAfterConfirm, 1); assert.equal(t2.score, 26 - 15); assert.equal(t2.completionRate, 2 / 3);
});
