import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { createBooking, BookingError } from "@/lib/bookings";
import { postSystemMessage } from "@/lib/booking-chat";
import { emitToUsers } from "@/lib/realtime";
import { notifyUsers } from "@/lib/notify";
import { scheduleHoldExpiry } from "@/lib/queue";
import { parseDateOnly } from "@/lib/format";

export class ChatError extends Error {}
export type ChatRole = "HOST" | "BROKER";

export type MessageDto = {
  id: string; conversationId: string; senderId: string | null; senderName: string | null;
  msgType: "TEXT" | "IMAGE" | "ACTION_HOLD_REQ" | "ACTION_BILL_UPLOAD" | "ACTION_MEDIA_PACK" | "ACTION_NET_PRICE_REQ";
  content: string | null; metadata: Record<string, unknown> | null; createdAt: string;
};

const MAX_TEXT = 2000;

/** Cuộc trò chuyện mà user là 1 trong 2 bên. */
export async function getConversation(userId: string, convId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id: convId, OR: [{ hostId: userId }, { brokerId: userId }] },
    include: {
      host: { select: { id: true, fullName: true, avatarUrl: true } },
      broker: { select: { id: true, fullName: true, avatarUrl: true } },
      booking: { select: { id: true, bookingCode: true, guestName: true } },
    },
  });
  if (!conv) return null;
  const role: ChatRole = conv.hostId === userId ? "HOST" : "BROKER";
  const other = role === "HOST" ? conv.broker : conv.host;
  return { conv, role, other };
}
type Loaded = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

async function mustConv(userId: string, convId: string): Promise<Loaded> {
  const c = await getConversation(userId, convId);
  if (!c) throw new ChatError("Không tìm thấy cuộc trò chuyện");
  return c;
}

// ───────── Đọc ─────────
async function toDtos(rows: (Prisma.MessageGetPayload<{ include: { sender: { select: { fullName: true } } } }>)[]): Promise<MessageDto[]> {
  const txIds = rows.filter((r) => r.msgType === "ACTION_BILL_UPLOAD").map((r) => (r.metadata as { transactionId?: string } | null)?.transactionId).filter((x): x is string => !!x);
  const txs = txIds.length ? await prisma.transaction.findMany({ where: { id: { in: txIds } } }) : [];
  const byId = new Map(txs.map((t) => [t.id, t]));
  return rows.map((r) => {
    let metadata = (r.metadata ?? null) as Record<string, unknown> | null;
    if (r.msgType === "ACTION_BILL_UPLOAD" && metadata) {
      const t = byId.get(String(metadata.transactionId));
      // Trạng thái giao dịch lấy từ DB (luôn mới nhất), không lấy từ bản chụp lúc đăng thẻ
      metadata = { ...metadata, tx: t ? { amount: Number(t.amount), status: t.status, txType: t.txType, payerRole: t.payerRole, receiverRole: t.receiverRole, billImageUrl: t.billImageUrl } : null };
    }
    return { id: r.id, conversationId: r.conversationId, senderId: r.senderId, senderName: r.sender?.fullName ?? null, msgType: r.msgType, content: r.content, metadata, createdAt: r.createdAt.toISOString() };
  });
}

export async function getMessages(userId: string, convId: string, limit = 80): Promise<MessageDto[]> {
  await mustConv(userId, convId);
  const rows = await prisma.message.findMany({
    where: { conversationId: convId }, orderBy: { createdAt: "desc" }, take: limit, include: { sender: { select: { fullName: true } } },
  });
  return toDtos(rows.reverse());
}

export async function listConversations(userId: string) {
  const convs = await prisma.conversation.findMany({
    where: { OR: [{ hostId: userId }, { brokerId: userId }] },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
    take: 100,
    include: {
      host: { select: { fullName: true } }, broker: { select: { fullName: true } },
      booking: { select: { bookingCode: true, guestName: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, msgType: true, createdAt: true } },
    },
  });
  return Promise.all(convs.map(async (c) => {
    const role: ChatRole = c.hostId === userId ? "HOST" : "BROKER";
    const lastRead = role === "HOST" ? c.hostLastReadAt : c.brokerLastReadAt;
    const unread = await prisma.message.count({
      where: { conversationId: c.id, OR: [{ senderId: null }, { senderId: { not: userId } }], ...(lastRead ? { createdAt: { gt: lastRead } } : {}) },
    });
    return {
      id: c.id, role, title: role === "HOST" ? c.broker.fullName : c.host.fullName,
      bookingCode: c.booking?.bookingCode ?? null, guestName: c.booking?.guestName ?? null,
      last: c.messages[0] ?? null, unread,
    };
  }));
}

export async function totalUnread(userId: string): Promise<number> {
  return (await listConversations(userId)).reduce((s, c) => s + c.unread, 0);
}

export async function markRead(userId: string, convId: string) {
  const { role } = await mustConv(userId, convId);
  await prisma.conversation.update({ where: { id: convId }, data: role === "HOST" ? { hostLastReadAt: new Date() } : { brokerLastReadAt: new Date() } });
}

// ───────── Gửi ─────────
async function publish(conv: { id: string; hostId: string; brokerId: string }, dto: MessageDto) {
  await emitToUsers([conv.hostId, conv.brokerId], "chat:message", { conversationId: conv.id, message: dto });
}

async function createMessage(userId: string, c: Loaded, data: { msgType: MessageDto["msgType"]; content: string; metadata?: Prisma.InputJsonValue }) {
  const m = await prisma.message.create({
    data: { conversationId: c.conv.id, senderId: userId, msgType: data.msgType, content: data.content, metadata: data.metadata },
    include: { sender: { select: { fullName: true } } },
  });
  await prisma.conversation.update({
    where: { id: c.conv.id },
    data: { lastMessageAt: m.createdAt, ...(c.role === "HOST" ? { hostLastReadAt: m.createdAt } : { brokerLastReadAt: m.createdAt }) },
  });
  const [dto] = await toDtos([m]);
  await publish(c.conv, dto);
  return dto;
}

export async function sendText(userId: string, convId: string, text: string) {
  const c = await mustConv(userId, convId);
  const t = text.trim();
  if (!t) throw new ChatError("Tin nhắn trống");
  if (t.length > MAX_TEXT) throw new ChatError(`Tin nhắn tối đa ${MAX_TEXT} ký tự`);
  const dto = await createMessage(userId, c, { msgType: "TEXT", content: t });
  // Telegram/Push cho người kia (không toast vì socket đã đẩy tin trực tiếp)
  await notifyUsers([c.other.id], `${c.role === "HOST" ? "Chủ nhà" : "CTV"} ${c.role === "HOST" ? c.conv.host.fullName : c.conv.broker.fullName}: ${t.slice(0, 120)}`, `/${c.role === "HOST" ? "broker" : "host"}/chat/${convId}`, { skipToast: true });
  return dto;
}

/** Mở (hoặc tạo) cuộc trò chuyện trực tiếp Host ↔ Broker. Chỉ khi 2 bên đã liên kết (APPROVED). */
/** `as`: vai trò người mở (2 tài khoản có thể liên kết hai chiều — phải mở đúng chiều mà họ đang xem, nếu không trang chat sẽ 404). */
export async function openDirectConversation(userId: string, otherId: string, as?: ChatRole) {
  if (userId === otherId) throw new ChatError("Không thể nhắn cho chính mình");
  const sides = [
    ...(as !== "BROKER" ? [{ hostId: userId, brokerId: otherId }] : []),
    ...(as !== "HOST" ? [{ hostId: otherId, brokerId: userId }] : []),
  ];
  const link = await prisma.hostBrokerLink.findFirst({ where: { status: "APPROVED", OR: sides } });
  if (!link) throw new ChatError("Hai bên chưa liên kết đối tác");
  const existing = await prisma.conversation.findFirst({ where: { bookingId: null, hostId: link.hostId, brokerId: link.brokerId } });
  if (existing) return existing;
  return prisma.conversation.create({ data: { hostId: link.hostId, brokerId: link.brokerId } });
}

// ───────── Thẻ ACTION_HOLD_REQ: CTV xin giữ phòng 30p, Host đồng ý/từ chối ─────────
export type HoldReqInput = {
  propertyId: string; checkIn: string; checkOut: string; bookingType: "WHOLE_UNIT" | "ROOMS"; roomIds: string[];
  guestName: string; guestCount: number; guestPhone?: string;
};

export async function createHoldRequest(userId: string, convId: string, i: HoldReqInput) {
  const c = await mustConv(userId, convId);
  if (c.role !== "BROKER") throw new ChatError("Chỉ CTV mới gửi yêu cầu giữ phòng");
  const property = await prisma.property.findFirst({
    where: { id: i.propertyId, sourceType: "HOST_MANAGED", hostId: c.conv.hostId }, include: { rooms: true },
  });
  if (!property) throw new ChatError("Căn không thuộc chủ nhà này");
  const link = await prisma.hostBrokerLink.findFirst({ where: { hostId: c.conv.hostId, brokerId: userId, status: "APPROVED" } });
  if (!link) throw new ChatError("Bạn chưa được chủ nhà duyệt");
  const ci = parseDateOnly(i.checkIn), co = parseDateOnly(i.checkOut);
  if (!ci || !co || co <= ci) throw new ChatError("Ngày không hợp lệ");
  const guestName = i.guestName.trim();
  if (guestName.length < 2 || guestName.length > 100) throw new ChatError("Nhập tên khách");
  if (!Number.isInteger(i.guestCount) || i.guestCount < 1) throw new ChatError("Số khách không hợp lệ");
  const rooms = i.bookingType === "ROOMS" ? property.rooms.filter((r) => i.roomIds.includes(r.id)) : [];
  if (i.bookingType === "ROOMS" && (rooms.length === 0 || rooms.length !== new Set(i.roomIds).size)) throw new ChatError("Chọn phòng hợp lệ");

  const metadata = {
    status: "PENDING", propertyId: property.id, propertyName: property.name, checkIn: i.checkIn, checkOut: i.checkOut,
    bookingType: i.bookingType, roomIds: rooms.map((r) => r.id), roomNames: rooms.map((r) => r.name),
    guestName, guestCount: i.guestCount, guestPhone: i.guestPhone ?? null,
  };
  const dto = await createMessage(userId, c, { msgType: "ACTION_HOLD_REQ", content: `Xin giữ phòng 30 phút: ${property.name}`, metadata });
  await notifyUsers([c.conv.hostId], `CTV ${c.conv.broker.fullName} xin giữ phòng ${property.name} (${i.checkIn} → ${i.checkOut})`, `/host/chat/${convId}`, { skipToast: true });
  return dto;
}

/**
 * Host đồng ý / từ chối. "Giành quyền xử lý" bằng UPDATE có điều kiện trên trạng thái PENDING:
 * hai lần bấm cùng lúc chỉ 1 lần thắng → không bao giờ tạo 2 booking.
 */
export async function decideHoldRequest(userId: string, messageId: string, accept: boolean) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.msgType !== "ACTION_HOLD_REQ") throw new ChatError("Không tìm thấy yêu cầu");
  const c = await mustConv(userId, msg.conversationId);
  if (c.role !== "HOST") throw new ChatError("Chỉ chủ nhà mới xử lý yêu cầu giữ phòng");

  const claimed = await prisma.$executeRaw`
    UPDATE messages SET metadata = jsonb_set(metadata, '{status}', ${accept ? '"PROCESSING"' : '"REJECTED"'}::jsonb)
    WHERE id = ${messageId}::uuid AND metadata->>'status' = 'PENDING'`;
  if (claimed === 0) throw new ChatError("Yêu cầu này đã được xử lý");

  const meta = msg.metadata as Record<string, unknown>;
  const patch = async (p: Record<string, unknown>) => {
    await prisma.message.update({ where: { id: messageId }, data: { metadata: { ...meta, ...p } as Prisma.InputJsonValue } });
    await emitToUsers([c.conv.hostId, c.conv.brokerId], "chat:update", { conversationId: c.conv.id });
  };

  if (!accept) {
    await patch({ status: "REJECTED" });
    await notifyUsers([c.conv.brokerId], `Chủ nhà từ chối giữ phòng ${meta.propertyName}`, `/broker/chat/${c.conv.id}`, { skipToast: true });
    return { status: "REJECTED" as const };
  }
  try {
    const b = await createBooking({
      actorId: c.conv.brokerId, as: "BROKER", propertyId: String(meta.propertyId), mode: "HOLD",
      bookingType: meta.bookingType as "WHOLE_UNIT" | "ROOMS", roomIds: meta.roomIds as string[],
      checkIn: parseDateOnly(String(meta.checkIn))!, checkOut: parseDateOnly(String(meta.checkOut))!,
      guestName: String(meta.guestName), guestCount: Number(meta.guestCount), guestPhone: (meta.guestPhone as string | null) ?? undefined,
    });
    if (b.holdExpiresAt) await scheduleHoldExpiry(b.id, b.holdExpiresAt);
    await patch({ status: "ACCEPTED", bookingId: b.id, bookingCode: b.bookingCode });
    await postSystemMessage(prisma, b.id, `Chủ nhà đã đồng ý giữ phòng cho khách ${b.guestName}.`);
    await notifyUsers([c.conv.brokerId], `Chủ nhà đã giữ phòng ${meta.propertyName} 30 phút (${b.bookingCode})`, `/broker/bookings/${b.id}`);
    return { status: "ACCEPTED" as const, bookingId: b.id };
  } catch (e) {
    const reason = e instanceof BookingError ? e.message : "Không giữ được phòng";
    await patch({ status: "FAILED", reason });
    if (!(e instanceof BookingError)) console.error(e);
    return { status: "FAILED" as const, reason };
  }
}

// ───────── Thẻ ACTION_MEDIA_PACK: Host gửi bộ ảnh/video sạch ─────────
/** `keys`: các bộ ảnh cần gửi ("general" = Ảnh chung, hoặc id album); bỏ trống = cả căn. */
export async function shareMediaPack(userId: string, convId: string, propertyId: string, keys: string[] = []) {
  const c = await mustConv(userId, convId);
  if (c.role !== "HOST") throw new ChatError("Chỉ chủ nhà mới gửi bộ ảnh");
  const property = await prisma.property.findFirst({ where: { id: propertyId, sourceType: "HOST_MANAGED", hostId: userId } });
  if (!property) throw new ChatError("Không tìm thấy căn");
  const [albums, media] = await Promise.all([
    prisma.propertyAlbum.findMany({ where: { propertyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
    prisma.propertyMedia.findMany({ where: { propertyId }, orderBy: { sortOrder: "asc" }, select: { id: true, url: true, thumbUrl: true, mediaType: true, albumId: true } }),
  ]);
  const valid = new Set(["general", ...albums.map((a) => a.id)]);
  if (keys.some((k) => !valid.has(k))) throw new ChatError("Bộ ảnh không hợp lệ");
  const chosen = keys.length > 0 ? new Set(keys) : valid;
  const picked = media.filter((m) => chosen.has(m.albumId ?? "general"));
  if (picked.length === 0) throw new ChatError("Bộ ảnh đã chọn chưa có ảnh/video");
  const groups = [{ key: "general", name: "Ảnh chung" }, ...albums.map((a) => ({ key: a.id, name: a.name }))]
    .filter((g) => chosen.has(g.key))
    .map((g) => ({ key: g.key, name: g.name, count: picked.filter((m) => (m.albumId ?? "general") === g.key).length }))
    .filter((g) => g.count > 0);
  const metadata = {
    propertyId, propertyName: property.name, total: picked.length, albums: groups,
    items: picked.slice(0, 6).map((m) => ({ id: m.id, url: m.thumbUrl ?? m.url, type: m.mediaType })),
  };
  const label = groups.length === 1 ? `“${groups[0].name}”` : `${groups.length} bộ`;
  const dto = await createMessage(userId, c, { msgType: "ACTION_MEDIA_PACK", content: `Bộ ảnh ${property.name} · ${label} (${picked.length} file)`, metadata });
  await notifyUsers([c.conv.brokerId], `Chủ nhà gửi bộ ảnh ${property.name} · ${label}`, `/broker/chat/${convId}`, { skipToast: true });
  return dto;
}
