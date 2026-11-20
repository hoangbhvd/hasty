// Test tích hợp: mặc cả giá Net (mục 4.6). Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { NetNegotiationError, pendingNetCard, proposeNetPrice, respondNetPrice } from "./net-negotiation";
import { bookingLedger } from "./booking-finance";

const tag = `neg${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
let host: string, broker: string, stranger: string, prop: string, ext: string, n = 0;
const rejects = (p: Promise<unknown>, re?: RegExp) => assert.rejects(p, (e) => e instanceof NetNegotiationError && (!re || re.test(e.message)));

async function mkBooking(over: Record<string, unknown> = {}, propertyId = prop) {
  n++;
  return prisma.booking.create({
    data: {
      bookingCode: `${tag}-${n}`, propertyId, hostId: host, brokerId: broker, bookingType: "WHOLE_UNIT",
      checkIn: d("2035-01-10"), checkOut: d("2035-01-12"), guestName: "Khach", guestCount: 2, status: "CONFIRMED",
      guestTotalPrice: 6_000_000, hostNetPrice: 5_000_000, commissionAmount: 1_000_000, ...over,
    } as never,
  });
}
const reload = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id }, include: { addons: true, transactions: true } });

before(async () => {
  const u = (x: string) => prisma.user.create({ data: { email: `${tag}-${x}@t.local`, fullName: x } });
  host = (await u("host")).id; broker = (await u("broker")).id; stranger = (await u("stranger")).id;
  prop = (await prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId: host, name: `${tag}-p` } })).id;
  ext = (await prisma.property.create({ data: { sourceType: "BROKER_EXTERNAL", createdByBrokerId: broker, name: `${tag}-ext` } })).id;
});
after(async () => {
  await prisma.message.deleteMany({ where: { conversation: { hostId: host } } });
  await prisma.conversation.deleteMany({ where: { hostId: host } });
  await prisma.booking.deleteMany({ where: { bookingCode: { startsWith: tag } } });
  await prisma.property.deleteMany({ where: { name: { startsWith: tag } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("CTV đề xuất → booking chờ, có thẻ trong chat; không đề xuất chồng; ràng buộc đầu vào", async () => {
  const b = await mkBooking();
  await rejects(proposeNetPrice(host, b.id, 4_600_000, "giảm giá"), /Chỉ CTV/);
  await rejects(proposeNetPrice(stranger, b.id, 4_600_000, "giảm giá"), /Không tìm thấy/);
  await rejects(proposeNetPrice(broker, b.id, 4_600_000, ""), /lý do/);
  await rejects(proposeNetPrice(broker, b.id, 6_500_000, "giá cao"), /cao hơn giá bán/);
  await rejects(proposeNetPrice(broker, b.id, 5_000_000, "giá trùng"), /trùng/);
  await rejects(proposeNetPrice(broker, b.id, -1, "giá âm"), /không hợp lệ/);

  await proposeNetPrice(broker, b.id, 4_600_000, "Khách ở 2 đêm ngày thường");
  const cur = await reload(b.id);
  assert.equal(cur.netPriceNegotiationStatus, "PENDING");
  assert.equal(Number(cur.pendingNetPrice), 4_600_000);
  assert.equal(Number(cur.hostNetPrice), 5_000_000); // chưa có hiệu lực
  const card = await pendingNetCard(b.id);
  assert.equal(card?.meta.proposedBy, "BROKER");
  assert.equal(card?.meta.old_net_price, 5_000_000);
  await rejects(proposeNetPrice(broker, b.id, 4_500_000, "lần 2"), /chờ phản hồi/);
  // CTV không tự duyệt đề xuất của mình
  await rejects(respondNetPrice(broker, card!.id, { kind: "ACCEPT" }), /Chỉ chủ nhà/);
  await rejects(respondNetPrice(stranger, card!.id, { kind: "ACCEPT" }), /Không tìm thấy/);
});

test("Host đồng ý: áp giá Net, tính lại hoa hồng & công nợ, giá bán khách không đổi; không duyệt lần 2", async () => {
  const b = await mkBooking();
  await proposeNetPrice(broker, b.id, 4_600_000, "giảm 400k");
  const card = (await pendingNetCard(b.id))!;
  const before = bookingLedger(await reload(b.id));
  assert.equal(before.commission, 1_000_000);
  await respondNetPrice(host, card.id, { kind: "ACCEPT" });
  const after = await reload(b.id);
  assert.equal(Number(after.hostNetPrice), 4_600_000);
  assert.equal(Number(after.commissionAmount), 1_400_000);
  assert.equal(Number(after.guestTotalPrice), 6_000_000);
  assert.equal(after.pendingNetPrice, null);
  assert.equal(after.netPriceNegotiationStatus, "APPROVED");
  const l = bookingLedger(after);
  assert.equal(l.hostEntitled, 4_600_000);
  assert.equal(l.commission, 1_400_000);
  assert.equal(l.guestPayable, 6_000_000);
  assert.equal(await pendingNetCard(b.id), null);
  await rejects(respondNetPrice(host, card.id, { kind: "ACCEPT" }), /đã được xử lý/);
  // đề xuất mới sau khi đã chốt vẫn được (giá hiện tại là 4.6tr)
  await proposeNetPrice(broker, b.id, 4_400_000, "thêm đêm");
  assert.equal((await pendingNetCard(b.id))!.meta.old_net_price, 4_600_000);
});

test("Host từ chối: giữ nguyên Net, xoá giá chờ", async () => {
  const b = await mkBooking();
  await proposeNetPrice(broker, b.id, 4_000_000, "xin giảm");
  await respondNetPrice(host, (await pendingNetCard(b.id))!.id, { kind: "REJECT" });
  const after = await reload(b.id);
  assert.equal(Number(after.hostNetPrice), 5_000_000);
  assert.equal(after.pendingNetPrice, null);
  assert.equal(after.netPriceNegotiationStatus, "REJECTED");
});

test("Host đề xuất giá khác (counter) → CTV chấp nhận mới có hiệu lực; Host không tự chấp nhận giá của mình", async () => {
  const b = await mkBooking();
  await proposeNetPrice(broker, b.id, 4_600_000, "giảm 400k");
  const first = (await pendingNetCard(b.id))!;
  await rejects(respondNetPrice(host, first.id, { kind: "COUNTER", price: 7_000_000 }), /cao hơn giá bán/);
  await rejects(respondNetPrice(host, first.id, { kind: "COUNTER", price: 5_000_000 }), /trùng giá Net hiện tại/);
  await rejects(respondNetPrice(host, first.id, { kind: "COUNTER", price: 4_600_000 }), /trùng đề xuất/);
  await respondNetPrice(host, first.id, { kind: "COUNTER", price: 4_800_000 });

  const mid = await reload(b.id);
  assert.equal(Number(mid.hostNetPrice), 5_000_000); // chưa đổi
  assert.equal(Number(mid.pendingNetPrice), 4_800_000);
  assert.equal(mid.netPriceNegotiationStatus, "PENDING");
  const oldCard = await prisma.message.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal((oldCard.metadata as { status: string }).status, "COUNTERED");
  const counter = (await pendingNetCard(b.id))!;
  assert.equal(counter.meta.proposedBy, "HOST");
  assert.equal(counter.meta.proposed_net_price, 4_800_000);
  await rejects(respondNetPrice(host, counter.id, { kind: "ACCEPT" }), /Chỉ CTV/);
  await rejects(respondNetPrice(broker, counter.id, { kind: "COUNTER", price: 4_700_000 }), /Chỉ chủ nhà/);

  await respondNetPrice(broker, counter.id, { kind: "ACCEPT" });
  const done = await reload(b.id);
  assert.equal(Number(done.hostNetPrice), 4_800_000);
  assert.equal(Number(done.commissionAmount), 1_200_000);
  assert.equal(done.netPriceNegotiationStatus, "APPROVED");
});

test("2 lần bấm Đồng ý đồng thời: chỉ 1 lần thắng", async () => {
  const b = await mkBooking();
  await proposeNetPrice(broker, b.id, 4_500_000, "giảm");
  const card = (await pendingNetCard(b.id))!;
  const r = await Promise.allSettled([respondNetPrice(host, card.id, { kind: "ACCEPT" }), respondNetPrice(host, card.id, { kind: "ACCEPT" })]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(Number((await reload(b.id)).hostNetPrice), 4_500_000);
});

test("không áp dụng: booking đã huỷ/check-out, căn ngoài app; huỷ giữa chừng thì đồng ý thất bại gọn", async () => {
  await rejects(proposeNetPrice(broker, (await mkBooking({ status: "CANCELLED" })).id, 4_000_000, "x y z"), /không còn sửa/);
  await rejects(proposeNetPrice(broker, (await mkBooking({ status: "CHECKED_OUT" })).id, 4_000_000, "x y z"), /không còn sửa/);
  await rejects(proposeNetPrice(broker, (await mkBooking({ hostId: null }, ext)).id, 4_000_000, "x y z"), /Chỉ áp dụng/);

  const b = await mkBooking();
  await proposeNetPrice(broker, b.id, 4_000_000, "xin giảm");
  const card = (await pendingNetCard(b.id))!;
  await prisma.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
  await rejects(respondNetPrice(host, card.id, { kind: "ACCEPT" }), /không còn sửa/);
  const after = await reload(b.id);
  assert.equal(Number(after.hostNetPrice), 5_000_000);
  assert.equal(after.pendingNetPrice, null);
  assert.equal(after.netPriceNegotiationStatus, "NONE");
});
