import type { PrismaClient, Prisma } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Tạo (nếu chưa có) cuộc trò chuyện gắn với booking — chỉ khi có đủ Host và Broker. */
export async function ensureConversation(db: Db, bookingId: string) {
  const existing = await db.conversation.findFirst({ where: { bookingId } });
  if (existing) return existing;
  const b = await db.booking.findUnique({ where: { id: bookingId }, select: { hostId: true, brokerId: true } });
  if (!b?.hostId || !b.brokerId) return null;
  return db.conversation.create({ data: { bookingId, hostId: b.hostId, brokerId: b.brokerId } });
}

/** Ghi tin nhắn hệ thống (sender = null) vào khung chat của booking. */
export async function postSystemMessage(db: Db, bookingId: string, content: string) {
  const conv = await ensureConversation(db, bookingId);
  if (!conv) return;
  await db.message.create({ data: { conversationId: conv.id, senderId: null, msgType: "TEXT", content } });
  await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
}
