// Test tích hợp hoàn tiền cho khách. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { createBooking } from "./bookings";
import { FinanceError, bookingLedger, createTransaction, decideTransaction, getBookingForParty } from "./booking-finance";
import { getVoucherData } from "./voucher";
import { brokerOverview, hostOverview } from "./overview";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const tag = `rf${Date.now()}`;
let hostId: string, brokerId: string, strangerId: string, propId: string, extId: string;
let seq = 0;
const rejects = (p: Promise<unknown>, re?: RegExp) => assert.rejects(p, (e) => e instanceof FinanceError && (!re || re.test(e.message)));

async function newBooking(paid = 2_000_000) {
  const day = 1 + (seq++ % 27);
  const b = await createBooking({
    actorId: brokerId, as: "BROKER", propertyId: propId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
    checkIn: d(`2036-${String(1 + Math.floor(seq / 27)).padStart(2, "0")}-${String(day).padStart(2, "0")}`),
    checkOut: d(`2036-${String(1 + Math.floor(seq / 27)).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`),
    guestName: "K", guestCount: 2, guestTotalPrice: 5_000_000,
  });
  if (paid) await createTransaction(brokerId, b.id, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount: paid });
  return b;
}
const ledgerOf = async (id: string) => bookingLedger((await getBookingForParty(hostId, id))!.booking);

before(async () => {
  const u = (n: string) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n } });
  hostId = (await u("host")).id; brokerId = (await u("broker")).id; strangerId = (await u("stranger")).id;
  await prisma.hostBrokerLink.create({ data: { hostId, brokerId, status: "APPROVED" } });
  propId = (await prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId, name: `${tag}-v`, baseWeekdayNet: 1_000_000, baseWeekendNet: 1_000_000 } })).id;
  extId = (await prisma.property.create({ data: { sourceType: "BROKER_EXTERNAL", createdByBrokerId: brokerId, name: `${tag}-e` } })).id;
});
after(async () => {
  const ids = [propId, extId];
  await prisma.transaction.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.message.deleteMany({ where: { conversation: { booking: { propertyId: { in: ids } } } } });
  await prisma.conversation.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { propertyId: { in: ids } } });
  await prisma.property.deleteMany({ where: { id: { in: ids } } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("bên TRẢ tiền hoàn tự ghi → có hiệu lực ngay; sổ cái trừ đúng", async () => {
  const b = await newBooking(2_000_000);
  const t = await createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 500_000 });
  assert.equal(t.status, "CONFIRMED");
  assert.equal(t.receiverRole, "GUEST");
  const l = await ledgerOf(b.id);
  assert.equal(l.guestPaid, 1_500_000);
  assert.equal(l.guestRefunded, 500_000);
  assert.equal(l.brokerCash, 1_500_000);
});

test("bên khác ghi hộ → chờ bên TRẢ xác nhận; người nhận 'khách' không có ai khác xác nhận được", async () => {
  const b = await newBooking(2_000_000);
  const t = await createTransaction(hostId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 300_000 }); // Host ghi: CTV mới là bên chi
  assert.equal(t.status, "PENDING_CONFIRM");
  assert.equal((await ledgerOf(b.id)).guestRefunded, 0); // chưa tính

  await rejects(decideTransaction(hostId, t.id, "CONFIRM"), /bên chi tiền hoàn/); // Host không phải bên chi
  await rejects(decideTransaction(strangerId, t.id, "CONFIRM"));
  await decideTransaction(brokerId, t.id, "CONFIRM");
  assert.equal((await ledgerOf(b.id)).guestRefunded, 300_000);
  await rejects(decideTransaction(brokerId, t.id, "REJECT"), /đã được xử lý/);
});

test("không hoàn quá số khách đã trả (tính cả khoản đang chờ); đúng bằng phần còn lại thì được", async () => {
  const b = await newBooking(2_000_000);
  await createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 500_000 });
  await createTransaction(hostId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 300_000 }); // đang chờ
  await rejects(createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 1_300_000 }), /tối đa 1\.200\.000/);
  const ok = await createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 1_200_000 });
  assert.equal(ok.status, "CONFIRMED");
  await rejects(createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 1 }), /chưa có khoản|tối đa/);
});

test("khách chưa trả gì (hoặc chỉ có khoản chờ duyệt) thì không hoàn được", async () => {
  const none = await newBooking(0);
  await rejects(createTransaction(brokerId, none.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 1000 }), /chưa có khoản/);
  const pending = await newBooking(0);
  await createTransaction(hostId, pending.id, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount: 900_000 }); // Host ghi hộ → chờ CTV
  await rejects(createTransaction(brokerId, pending.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 1000 }), /chưa có khoản/);
});

test("2 yêu cầu hoàn tiền ĐỒNG THỜI cùng vượt tổng → chỉ 1 thắng (khoá booking)", async () => {
  const b = await newBooking(1_000_000);
  const res = await Promise.all([1, 2, 3, 4].map(() =>
    createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 600_000 }).then(() => "ok", (e) => (e instanceof FinanceError ? "blocked" : `ERR ${e}`))));
  assert.equal(res.filter((r) => r === "ok").length, 1, JSON.stringify(res));
  assert.ok(res.every((r) => r === "ok" || r === "blocked"));
  assert.ok((await ledgerOf(b.id)).guestPaid >= 0);
});

test("chỉ loại REFUND mới được trả cho khách; người ngoài không ghi được", async () => {
  const b = await newBooking(1_000_000);
  for (const txType of ["DEPOSIT", "BALANCE", "COMMISSION_SETTLEMENT"] as const) {
    await rejects(createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType, amount: 1000 }), /không khớp/);
  }
  await rejects(createTransaction(strangerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 1000 }), /Không tìm thấy/);
  // Host bán trực tiếp (không CTV): không có hướng BROKER>GUEST
  const own = await createBooking({ actorId: hostId, as: "HOST", propertyId: propId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2037-05-01"), checkOut: d("2037-05-02"), guestName: "OTA", guestCount: 1, guestTotalPrice: 1_000_000 });
  await createTransaction(hostId, own.id, { direction: "GUEST>HOST", txType: "DEPOSIT", amount: 400_000 });
  await rejects(createTransaction(hostId, own.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 1000 }), /không có bên/);
  assert.equal((await createTransaction(hostId, own.id, { direction: "HOST>GUEST", txType: "REFUND", amount: 400_000 })).status, "CONFIRMED");
});

test("căn ngoài app: CTV hoàn tiền cho khách có hiệu lực ngay", async () => {
  const b = await createBooking({ actorId: brokerId, as: "BROKER", propertyId: extId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2037-06-01"), checkOut: d("2037-06-02"), guestName: "E", guestCount: 1, hostNetPrice: 800_000, guestTotalPrice: 1_000_000 });
  await createTransaction(brokerId, b.id, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount: 1_000_000 });
  assert.equal((await createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 200_000 })).status, "CONFIRMED");
  assert.equal(bookingLedger((await getBookingForParty(brokerId, b.id))!.booking).guestPaid, 800_000);
});

test("voucher công khai: số 'đã thanh toán' đã trừ hoàn tiền; hoàn tiền đang chờ chưa tính", async () => {
  const b = await newBooking(2_000_000);
  const before = await getVoucherData(b.voucherToken);
  assert.equal(before!.paid, 2_000_000);
  await createTransaction(brokerId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 700_000 });
  await createTransaction(hostId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 100_000 }); // chờ
  const after = await getVoucherData(b.voucherToken);
  assert.equal(after!.paid, 1_300_000);
  assert.equal(after!.remaining, before!.remaining + 700_000);
  assert.ok(!JSON.stringify(after).includes("receiverRole"));
});

test("Tổng quan: hoàn tiền chờ xác nhận hiện đúng cho bên phải xác nhận, không hiện cho bên kia", async () => {
  const b = await newBooking(2_000_000);
  const base = { h: (await hostOverview(hostId)).todo.pendingTx, b: (await brokerOverview(brokerId)).todo.pendingTx };
  await createTransaction(hostId, b.id, { direction: "BROKER>GUEST", txType: "REFUND", amount: 100_000 }); // CTV phải xác nhận
  assert.equal((await brokerOverview(brokerId)).todo.pendingTx, base.b + 1);
  assert.equal((await hostOverview(hostId)).todo.pendingTx, base.h); // Host không phải bên xác nhận
});
