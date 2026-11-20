// Test tích hợp chat + thẻ hành động trên DB thật. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import {
  ChatError, createHoldRequest, decideHoldRequest, getConversation, getMessages, listConversations,
  markRead, openDirectConversation, sendText, shareMediaPack, totalUnread,
} from "./chat";
import { createBooking } from "./bookings";
import { createTransaction, decideTransaction } from "./booking-finance";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const tag = `chat${Date.now()}`;
let hostId: string, brokerId: string, strangerId: string, pendingBrokerId: string;
let propId: string, convId: string;

const rejects = (p: Promise<unknown>) => assert.rejects(p, ChatError);

before(async () => {
  const mk = (n: string) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n } });
  hostId = (await mk("host")).id; brokerId = (await mk("broker")).id; strangerId = (await mk("stranger")).id; pendingBrokerId = (await mk("pending")).id;
  await prisma.hostBrokerLink.create({ data: { hostId, brokerId, status: "APPROVED" } });
  await prisma.hostBrokerLink.create({ data: { hostId, brokerId: pendingBrokerId, status: "PENDING" } });
  propId = (await prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId, name: `${tag}-villa`, baseWeekdayNet: 1000, baseWeekendNet: 1000 } })).id;
  convId = (await openDirectConversation(hostId, brokerId)).id;
});

after(async () => {
  await prisma.transaction.deleteMany({ where: { booking: { propertyId: propId } } });
  await prisma.message.deleteMany({ where: { conversation: { OR: [{ hostId }, { booking: { propertyId: propId } }] } } });
  await prisma.conversation.deleteMany({ where: { OR: [{ hostId }, { booking: { propertyId: propId } }] } });
  await prisma.booking.deleteMany({ where: { propertyId: propId } });
  await prisma.propertyMedia.deleteMany({ where: { propertyId: propId } });
  await prisma.property.deleteMany({ where: { id: propId } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("mở chat trực tiếp: cần liên kết APPROVED, mở 2 chiều đều ra cùng 1 cuộc trò chuyện", async () => {
  assert.equal((await openDirectConversation(brokerId, hostId)).id, convId);
  assert.equal((await openDirectConversation(hostId, brokerId)).id, convId);
  await rejects(openDirectConversation(hostId, pendingBrokerId)); // mới PENDING
  await rejects(openDirectConversation(hostId, strangerId));
  await rejects(openDirectConversation(hostId, hostId));
  await rejects(openDirectConversation(hostId, brokerId, "BROKER")); // không có liên kết chiều ngược (broker làm host)
});

test("gửi tin: 2 bên nhận được, người ngoài không đọc/gửi được", async () => {
  await sendText(hostId, convId, "  Chào CTV  ");
  await sendText(brokerId, convId, "Dạ em chào anh");
  const msgs = await getMessages(brokerId, convId);
  assert.deepEqual(msgs.map((m) => m.content), ["Chào CTV", "Dạ em chào anh"]); // đã trim, đúng thứ tự
  assert.equal(msgs[0].senderName, "host");

  await rejects(getMessages(strangerId, convId));
  await rejects(sendText(strangerId, convId, "hack"));
  await rejects(markRead(strangerId, convId));
  assert.equal(await getConversation(strangerId, convId), null);
});

test("tin nhắn: rỗng / quá dài bị từ chối", async () => {
  await rejects(sendText(hostId, convId, "   "));
  await rejects(sendText(hostId, convId, "x".repeat(2001)));
  await sendText(hostId, convId, "x".repeat(2000));
});

test("chưa đọc: đếm tin của người kia, đọc xong về 0, tin của mình không tính", async () => {
  await markRead(hostId, convId);
  await markRead(brokerId, convId);
  assert.equal(await totalUnread(brokerId), 0);
  await sendText(hostId, convId, "tin 1");
  await sendText(hostId, convId, "tin 2");
  assert.equal(await totalUnread(brokerId), 2);
  assert.equal(await totalUnread(hostId), 0); // tin của chính mình
  const list = await listConversations(brokerId);
  assert.equal(list.find((c) => c.id === convId)!.unread, 2);
  assert.equal(list.find((c) => c.id === convId)!.title, "host");
  await markRead(brokerId, convId);
  assert.equal(await totalUnread(brokerId), 0);
});

// ───────── Thẻ xin giữ phòng ─────────
const holdInput = (over = {}) => ({ propertyId: propId, checkIn: "2034-02-01", checkOut: "2034-02-03", bookingType: "WHOLE_UNIT" as const, roomIds: [], guestName: "Khách A", guestCount: 2, ...over });

test("xin giữ phòng: chỉ CTV gửi; căn phải của chủ nhà này; CTV phải được duyệt", async () => {
  await rejects(createHoldRequest(hostId, convId, holdInput())); // Host không gửi được
  await rejects(createHoldRequest(brokerId, convId, holdInput({ propertyId: "00000000-0000-4000-8000-000000000000" })));
  await rejects(createHoldRequest(brokerId, convId, holdInput({ checkOut: "2034-01-31" })));
  await rejects(createHoldRequest(brokerId, convId, holdInput({ guestName: "A" })));
  await rejects(createHoldRequest(brokerId, convId, holdInput({ bookingType: "ROOMS", roomIds: [] })));
  const card = await createHoldRequest(brokerId, convId, holdInput());
  assert.equal(card.msgType, "ACTION_HOLD_REQ");
  assert.equal(card.metadata!.status, "PENDING");
  assert.equal(await prisma.booking.count({ where: { propertyId: propId } }), 0); // chưa có booking
});

test("Host đồng ý → tạo booking HOLDING 30 phút, thẻ chuyển ACCEPTED; không xử lý lại được", async () => {
  const card = await createHoldRequest(brokerId, convId, holdInput({ checkIn: "2034-03-01", checkOut: "2034-03-02" }));
  await rejects(decideHoldRequest(brokerId, card.id, true)); // CTV không tự duyệt
  await rejects(decideHoldRequest(strangerId, card.id, true));
  const r = await decideHoldRequest(hostId, card.id, true);
  assert.equal(r.status, "ACCEPTED");
  const b = await prisma.booking.findFirstOrThrow({ where: { propertyId: propId, checkIn: d("2034-03-01") } });
  assert.equal(b.status, "HOLDING");
  assert.equal(b.brokerId, brokerId);
  assert.ok(b.holdExpiresAt! > new Date());
  const after = (await getMessages(hostId, convId)).find((m) => m.id === card.id)!;
  assert.equal(after.metadata!.status, "ACCEPTED");
  assert.equal(after.metadata!.bookingId, b.id);
  await rejects(decideHoldRequest(hostId, card.id, false)); // đã xử lý
});

test("Host từ chối → không tạo booking", async () => {
  const card = await createHoldRequest(brokerId, convId, holdInput({ checkIn: "2034-04-01", checkOut: "2034-04-02" }));
  assert.equal((await decideHoldRequest(hostId, card.id, false)).status, "REJECTED");
  assert.equal(await prisma.booking.count({ where: { propertyId: propId, checkIn: d("2034-04-01") } }), 0);
  await rejects(decideHoldRequest(hostId, card.id, true));
});

test("duyệt ĐỒNG THỜI 5 lần cùng 1 yêu cầu → đúng 1 booking, không trùng", async () => {
  const card = await createHoldRequest(brokerId, convId, holdInput({ checkIn: "2034-05-01", checkOut: "2034-05-02" }));
  const res = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    decideHoldRequest(hostId, card.id, i !== 4).then((r) => r.status, () => "error")));
  assert.equal(await prisma.booking.count({ where: { propertyId: propId, checkIn: d("2034-05-01") } }) <= 1, true, JSON.stringify(res));
  assert.equal(res.filter((r) => r !== "error").length, 1, JSON.stringify(res)); // đúng 1 request được xử lý
});

test("Host đồng ý nhưng ngày đã bị đặt → thẻ FAILED kèm lý do, không có booking mới", async () => {
  await createBooking({ actorId: hostId, as: "HOST", propertyId: propId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2034-06-01"), checkOut: d("2034-06-03"), guestName: "OTA", guestCount: 1, guestTotalPrice: 1000 });
  const card = await createHoldRequest(brokerId, convId, holdInput({ checkIn: "2034-06-02", checkOut: "2034-06-04" }));
  const r = await decideHoldRequest(hostId, card.id, true);
  assert.equal(r.status, "FAILED");
  assert.equal(await prisma.booking.count({ where: { propertyId: propId, checkIn: d("2034-06-02") } }), 0); // không tạo booking mới
  const m = (await getMessages(hostId, convId)).find((x) => x.id === card.id)!;
  assert.equal(m.metadata!.status, "FAILED");
  assert.match(String(m.metadata!.reason), /không còn trống/);
});

test("CTV bị chặn sau khi gửi yêu cầu → Host đồng ý cũng không tạo được booking", async () => {
  const card = await createHoldRequest(brokerId, convId, holdInput({ checkIn: "2034-07-01", checkOut: "2034-07-02" }));
  await prisma.hostBrokerLink.updateMany({ where: { hostId, brokerId }, data: { status: "BLOCKED" } });
  const r = await decideHoldRequest(hostId, card.id, true);
  await prisma.hostBrokerLink.updateMany({ where: { hostId, brokerId }, data: { status: "APPROVED" } });
  assert.equal(r.status, "FAILED");
  assert.equal(await prisma.booking.count({ where: { propertyId: propId, checkIn: d("2034-07-01") } }), 0);
});

// ───────── Thẻ bộ ảnh ─────────
test("gửi bộ ảnh: chỉ Host, chỉ căn của mình, phải có ảnh; thẻ chứa tối đa 6 ảnh + tổng", async () => {
  await rejects(shareMediaPack(brokerId, convId, propId));
  await rejects(shareMediaPack(hostId, convId, propId)); // chưa có ảnh
  const other = await prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId: strangerId, name: `${tag}-other` } });
  await rejects(shareMediaPack(hostId, convId, other.id)); // căn người khác
  await prisma.property.delete({ where: { id: other.id } });

  await prisma.propertyMedia.createMany({ data: Array.from({ length: 8 }, (_, i) => ({ propertyId: propId, url: `https://m.example/${i}.jpg`, mediaType: "IMAGE" as const, sortOrder: i })) });
  const dto = await shareMediaPack(hostId, convId, propId);
  assert.equal(dto.msgType, "ACTION_MEDIA_PACK");
  assert.equal(dto.metadata!.total, 8);
  assert.equal((dto.metadata!.items as unknown[]).length, 6);
});

// ───────── Thẻ bill ─────────
test("giao dịch tạo thẻ ACTION_BILL_UPLOAD trong chat của booking; trạng thái thẻ theo DB", async () => {
  const b = await createBooking({ actorId: brokerId, as: "BROKER", propertyId: propId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2034-08-01"), checkOut: d("2034-08-02"), guestName: "K", guestCount: 1, guestTotalPrice: 5000 });
  const tx = await createTransaction(brokerId, b.id, { direction: "BROKER>HOST", txType: "DEPOSIT", amount: 1500 }); // Host chưa duyệt
  const conv = await prisma.conversation.findFirstOrThrow({ where: { bookingId: b.id } });
  const card = (await getMessages(hostId, conv.id)).find((m) => m.msgType === "ACTION_BILL_UPLOAD")!;
  assert.equal(card.metadata!.transactionId, tx.id);
  assert.equal((card.metadata!.tx as { status: string }).status, "PENDING_CONFIRM");

  await decideTransaction(hostId, tx.id, "CONFIRM");
  const card2 = (await getMessages(brokerId, conv.id)).find((m) => m.msgType === "ACTION_BILL_UPLOAD")!;
  assert.equal((card2.metadata!.tx as { status: string }).status, "CONFIRMED"); // tự cập nhật, không cần đăng thẻ mới
  assert.equal((card2.metadata!.tx as { amount: number }).amount, 1500);
  await rejects(getMessages(strangerId, conv.id));
});
