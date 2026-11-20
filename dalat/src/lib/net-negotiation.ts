import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { formatVnd } from "@/lib/format";
import { postCard, postSystemMessage } from "@/lib/booking-chat";
import { emitToUsers } from "@/lib/realtime";
import { notifyUsers } from "@/lib/notify";

/** Mục 4.6 spec: mặc cả / đề xuất sửa giá Net giữa Broker ↔ Host cho đơn HOST_MANAGED. */
export class NetNegotiationError extends Error {}

const ALLOWED_STATUS = ["HOLDING", "CONFIRMED", "CHECKED_IN"];
const MAX_REASON = 500;
const MAX_MONEY = 10_000_000_000;

export type NetCardMeta = {
  bookingId: string; bookingCode: string;
  old_net_price: number; proposed_net_price: number; reason: string;
  proposedBy: "BROKER" | "HOST";
  status: "PENDING" | "PROCESSING" | "APPROVED" | "REJECTED" | "COUNTERED" | "FAILED";
  /** Chỉ có khi COUNTERED: mức giá chốt chủ nhà đưa ra */
  counter_price?: number;
  failReason?: string;
};

function validPrice(n: number, guestTotal: number) {
  if (!Number.isInteger(n) || n < 0 || n > MAX_MONEY) throw new NetNegotiationError("Giá Net không hợp lệ");
  if (n > guestTotal) throw new NetNegotiationError(`Giá Net không được cao hơn giá bán cho khách (${formatVnd(guestTotal)})`);
}

async function loadParty(userId: string, bookingId: string) {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, OR: [{ hostId: userId }, { brokerId: userId }] },
    include: { property: { select: { name: true, sourceType: true } } },
  });
  if (!b) throw new NetNegotiationError("Không tìm thấy booking");
  const role = b.hostId === userId ? "HOST" as const : "BROKER" as const;
  return { b, role };
}

function assertNegotiable(b: { hostId: string | null; brokerId: string | null; status: string; property: { sourceType: string } }) {
  if (b.property.sourceType !== "HOST_MANAGED" || !b.hostId || !b.brokerId) throw new NetNegotiationError("Chỉ áp dụng cho booking căn của chủ nhà trong hệ thống");
  if (!ALLOWED_STATUS.includes(b.status)) throw new NetNegotiationError("Booking này không còn sửa được giá Net");
}

const notifyPath = (role: "HOST" | "BROKER", bookingId: string) => `/${role === "HOST" ? "host" : "broker"}/bookings/${bookingId}`;

/** Broker gửi đề xuất giá Net mới. */
export async function proposeNetPrice(userId: string, bookingId: string, proposed: number, reason: string) {
  const { b, role } = await loadParty(userId, bookingId);
  if (role !== "BROKER") throw new NetNegotiationError("Chỉ CTV mới đề xuất sửa giá Net");
  assertNegotiable(b);
  const why = reason.trim();
  if (why.length < 3) throw new NetNegotiationError("Nhập lý do đề xuất");
  if (why.length > MAX_REASON) throw new NetNegotiationError(`Lý do tối đa ${MAX_REASON} ký tự`);
  validPrice(proposed, Number(b.guestTotalPrice));
  const old = Number(b.hostNetPrice);
  if (proposed === old) throw new NetNegotiationError("Giá đề xuất trùng giá Net hiện tại");

  await prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
    const cur = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { netPriceNegotiationStatus: true, hostNetPrice: true, status: true } });
    if (cur.netPriceNegotiationStatus === "PENDING") throw new NetNegotiationError("Đang có một đề xuất giá chờ phản hồi");
    if (!ALLOWED_STATUS.includes(cur.status) || Number(cur.hostNetPrice) !== old) throw new NetNegotiationError("Booking vừa thay đổi, tải lại trang");
    await db.booking.update({ where: { id: bookingId }, data: { pendingNetPrice: proposed, netPriceNegotiationStatus: "PENDING" } });
    const meta: NetCardMeta = { bookingId, bookingCode: b.bookingCode, old_net_price: old, proposed_net_price: proposed, reason: why, proposedBy: "BROKER", status: "PENDING" };
    const card = await postCard(db, bookingId, "ACTION_NET_PRICE_REQ", `CTV đề xuất giá Net ${formatVnd(proposed)} (hiện ${formatVnd(old)})`, meta as unknown as Prisma.InputJsonValue);
    if (!card) throw new NetNegotiationError("Không tạo được khung chat của booking");
  });
  const conv = await prisma.conversation.findFirst({ where: { bookingId }, select: { id: true } });
  await emitToUsers([b.hostId, b.brokerId], "chat:update", { conversationId: conv?.id, bookingId });
  await notifyUsers([b.hostId], `CTV đề xuất sửa giá Net ${b.bookingCode}: ${formatVnd(old)} → ${formatVnd(proposed)}. Lý do: ${why.slice(0, 80)}`, notifyPath("HOST", bookingId));
}

export type NetDecision = { kind: "ACCEPT" } | { kind: "REJECT" } | { kind: "COUNTER"; price: number };

/**
 * Bên được đề xuất phản hồi. Broker đề xuất → Host: đồng ý / từ chối / đề xuất giá khác.
 * Host đưa giá chốt (counter) → Broker: chấp nhận / từ chối.
 * "Giành quyền xử lý" bằng UPDATE có điều kiện trên trạng thái PENDING của thẻ: bấm đúp chỉ 1 lần thắng.
 */
export async function respondNetPrice(userId: string, messageId: string, decision: NetDecision) {
  const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!msg || msg.msgType !== "ACTION_NET_PRICE_REQ") throw new NetNegotiationError("Không tìm thấy đề xuất");
  const meta = msg.metadata as unknown as NetCardMeta;
  const { b, role } = await loadParty(userId, meta.bookingId);
  const responder = meta.proposedBy === "BROKER" ? "HOST" : "BROKER";
  if (role !== responder) throw new NetNegotiationError(meta.proposedBy === "BROKER" ? "Chỉ chủ nhà mới phản hồi đề xuất này" : "Chỉ CTV mới phản hồi giá chốt của chủ nhà");
  if (decision.kind === "COUNTER") {
    if (role !== "HOST") throw new NetNegotiationError("Chỉ chủ nhà mới đề xuất giá khác");
    validPrice(decision.price, Number(b.guestTotalPrice));
    if (decision.price === meta.old_net_price) throw new NetNegotiationError("Giá chốt trùng giá Net hiện tại — hãy chọn Từ chối");
    if (decision.price === meta.proposed_net_price) throw new NetNegotiationError("Giá chốt trùng đề xuất của CTV — hãy chọn Đồng ý");
  }

  const claimed = await prisma.$executeRaw`
    UPDATE messages SET metadata = jsonb_set(metadata, '{status}', '"PROCESSING"'::jsonb)
    WHERE id = ${messageId}::uuid AND metadata->>'status' = 'PENDING'`;
  if (claimed === 0) throw new NetNegotiationError("Đề xuất này đã được xử lý");

  const setCard = (patch: Partial<NetCardMeta>) =>
    prisma.message.update({ where: { id: messageId }, data: { metadata: { ...meta, ...patch } as unknown as Prisma.InputJsonValue } });
  const other = role === "HOST" ? b.brokerId : b.hostId;
  const who = role === "HOST" ? "Chủ nhà" : "CTV";
  const path = notifyPath(role === "HOST" ? "BROKER" : "HOST", b.id);

  try {
    if (decision.kind === "REJECT") {
      await prisma.booking.update({ where: { id: b.id }, data: { pendingNetPrice: null, netPriceNegotiationStatus: "REJECTED" } });
      await setCard({ status: "REJECTED" });
      await postSystemMessage(prisma, b.id, `${who} từ chối giá Net ${formatVnd(meta.proposed_net_price)}. Giữ nguyên ${formatVnd(meta.old_net_price)}.`);
      await notifyUsers([other], `${who} từ chối giá Net ${formatVnd(meta.proposed_net_price)} — ${b.bookingCode}`, path);
      return { status: "REJECTED" as const };
    }

    if (decision.kind === "COUNTER") {
      await prisma.$transaction(async (db) => {
        await db.$queryRaw`SELECT id FROM bookings WHERE id = ${b.id}::uuid FOR UPDATE`;
        const cur = await db.booking.findUniqueOrThrow({ where: { id: b.id }, select: { status: true, hostNetPrice: true } });
        if (!ALLOWED_STATUS.includes(cur.status)) throw new NetNegotiationError("Booking này không còn sửa được giá Net");
        await db.booking.update({ where: { id: b.id }, data: { pendingNetPrice: decision.price, netPriceNegotiationStatus: "PENDING" } });
        await db.message.update({ where: { id: messageId }, data: { metadata: { ...meta, status: "COUNTERED", counter_price: decision.price } as unknown as Prisma.InputJsonValue } });
        const next: NetCardMeta = {
          bookingId: b.id, bookingCode: b.bookingCode, old_net_price: Number(cur.hostNetPrice), proposed_net_price: decision.price,
          reason: `Chủ nhà đề xuất giá chốt thay cho ${formatVnd(meta.proposed_net_price)}`, proposedBy: "HOST", status: "PENDING",
        };
        await postCard(db, b.id, "ACTION_NET_PRICE_REQ", `Chủ nhà đề xuất giá Net chốt ${formatVnd(decision.price)}`, next as unknown as Prisma.InputJsonValue);
      });
      await notifyUsers([other], `Chủ nhà đề xuất giá Net chốt ${formatVnd(decision.price)} — ${b.bookingCode}. Mở chat để chấp nhận.`, path);
      return { status: "COUNTERED" as const };
    }

    // ACCEPT: áp giá vào booking, tính lại hoa hồng; công nợ tính từ host_net_price nên tự cập nhật
    await prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM bookings WHERE id = ${b.id}::uuid FOR UPDATE`;
      const cur = await db.booking.findUniqueOrThrow({ where: { id: b.id }, select: { status: true, guestTotalPrice: true, pendingNetPrice: true, netPriceNegotiationStatus: true } });
      if (!ALLOWED_STATUS.includes(cur.status)) throw new NetNegotiationError("Booking này không còn sửa được giá Net");
      if (cur.netPriceNegotiationStatus !== "PENDING" || Number(cur.pendingNetPrice) !== meta.proposed_net_price) throw new NetNegotiationError("Đề xuất không còn hiệu lực");
      await db.booking.update({
        where: { id: b.id },
        data: {
          hostNetPrice: meta.proposed_net_price,
          commissionAmount: Number(cur.guestTotalPrice) - meta.proposed_net_price,
          pendingNetPrice: null, netPriceNegotiationStatus: "APPROVED",
        },
      });
      await db.message.update({ where: { id: messageId }, data: { metadata: { ...meta, status: "APPROVED" } as unknown as Prisma.InputJsonValue } });
    });
    await postSystemMessage(prisma, b.id, `${who} đồng ý giá Net mới ${formatVnd(meta.proposed_net_price)} (trước đó ${formatVnd(meta.old_net_price)}). Hoa hồng và công nợ đã tính lại.`);
    await notifyUsers([other], `${who} đồng ý giá Net ${formatVnd(meta.proposed_net_price)} — ${b.bookingCode}`, path);
    return { status: "APPROVED" as const };
  } catch (e) {
    // Không để thẻ kẹt ở PROCESSING; trả booking về trạng thái không chờ
    const reason = e instanceof NetNegotiationError ? e.message : "Không xử lý được";
    if (!(e instanceof NetNegotiationError)) console.error(e);
    await setCard({ status: "FAILED", failReason: reason });
    await prisma.booking.updateMany({ where: { id: b.id, netPriceNegotiationStatus: "PENDING" }, data: { pendingNetPrice: null, netPriceNegotiationStatus: "NONE" } });
    throw new NetNegotiationError(reason);
  } finally {
    await emitToUsers([b.hostId, b.brokerId], "chat:update", { conversationId: msg.conversationId, bookingId: b.id });
  }
}

/** Thẻ đề xuất đang chờ của booking (để hiện nút phản hồi ngay ở trang chi tiết). */
export async function pendingNetCard(bookingId: string) {
  const rows = await prisma.message.findMany({
    where: { msgType: "ACTION_NET_PRICE_REQ", conversation: { bookingId } },
    orderBy: { createdAt: "desc" }, take: 5, select: { id: true, metadata: true },
  });
  const m = rows.find((r) => (r.metadata as { status?: string } | null)?.status === "PENDING");
  return m ? { id: m.id, meta: m.metadata as unknown as NetCardMeta } : null;
}
