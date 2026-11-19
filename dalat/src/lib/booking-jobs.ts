import { prisma } from "@/lib/db";
import { postSystemMessage } from "@/lib/booking-chat";
import { notifyUsers } from "@/lib/notify";

/** Nhả phòng nếu booking vẫn HOLDING và đã quá hạn. Trả về true nếu đã huỷ. */
export async function expireHold(bookingId: string, now = new Date()): Promise<boolean> {
  const cancelled = await prisma.$transaction(async (tx) => {
    // updateMany có điều kiện là thao tác nguyên tử: chỉ 1 worker thắng
    const r = await tx.booking.updateMany({
      where: { id: bookingId, status: "HOLDING", holdExpiresAt: { lte: now } },
      data: { status: "CANCELLED" },
    });
    if (r.count === 0) return false;
    await postSystemMessage(tx, bookingId, `Hết ${30} phút giữ phòng — booking đã tự động huỷ và nhả lịch.`);
    return true;
  });
  if (cancelled) {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { hostId: true, brokerId: true, bookingCode: true } });
    await notifyUsers([b?.hostId, b?.brokerId], `Booking ${b?.bookingCode} hết hạn giữ phòng và đã được huỷ.`, `/host/calendar`);
  }
  return cancelled;
}

/** Quét dự phòng: huỷ mọi booking HOLDING đã quá hạn (phòng khi job trễ/mất). */
export async function sweepExpiredHolds(now = new Date()): Promise<number> {
  const due = await prisma.booking.findMany({
    where: { status: "HOLDING", holdExpiresAt: { lte: now } },
    select: { id: true },
    take: 200,
  });
  let n = 0;
  for (const b of due) if (await expireHold(b.id, now)) n++;
  return n;
}

/** Nhắc lịch check-in (chạy trước 24h). Bỏ qua nếu booking đã huỷ/đổi trạng thái. */
export async function sendCheckinReminder(bookingId: string): Promise<boolean> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { property: { select: { name: true } } } });
  if (!b || b.status !== "CONFIRMED") return false;
  const date = b.checkIn.toISOString().slice(0, 10).split("-").reverse().join("/");
  const text = `Nhắc lịch: khách ${b.guestName} check-in ${b.property.name} ngày ${date} (booking ${b.bookingCode}).`;
  await postSystemMessage(prisma, b.id, text);
  await notifyUsers([b.hostId, b.brokerId], text);
  return true;
}
