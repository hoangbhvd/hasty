// Hồ sơ năng lực & điểm uy tín CTV (spec 9.4). Chỉ tính từ đơn HOST_MANAGED đã xác thực trên hệ thống
// (đơn BROKER_EXTERNAL do CTV tự nhập nên không tính, để chống làm giả số liệu).
import { prisma } from "@/lib/db";
import { badgeOf, completionOf, scoreOf, type TrustStats } from "@/lib/broker-trust-core";

export * from "@/lib/broker-trust-core";

/** "Hủy sau khi đã xác nhận" = đơn CANCELLED đã phát sinh giao dịch (khách đã cọc/thanh toán). Hold hết hạn không tính. */
export async function brokerTrust(brokerId: string): Promise<TrustStats> {
  const base = { brokerId, property: { sourceType: "HOST_MANAGED" as const } };
  const [done, cancelled] = await Promise.all([
    prisma.booking.findMany({ where: { ...base, status: "CHECKED_OUT" }, select: { guestCount: true, checkIn: true, checkOut: true } }),
    prisma.booking.count({ where: { ...base, status: "CANCELLED", transactions: { some: {} } } }),
  ]);
  const nights = done.reduce((s, b) => s + Math.max(0, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000)), 0);
  const stats = { orders: done.length, guests: done.reduce((s, b) => s + b.guestCount, 0), nights, cancelledAfterConfirm: cancelled };
  const score = scoreOf(stats);
  return { ...stats, score, badge: badgeOf(score), ...completionOf(stats) };
}
