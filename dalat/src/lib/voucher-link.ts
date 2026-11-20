import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getBookingForParty } from "@/lib/booking-finance";

export class VoucherLinkError extends Error {}

async function ownedId(userId: string, bookingId: string) {
  const l = await getBookingForParty(userId, bookingId);
  if (!l) throw new VoucherLinkError("Không có quyền");
  return l.booking.id;
}

/** Đổi token: link cũ lập tức vô hiệu (khi lỡ gửi nhầm khách). Hạn dùng được giữ nguyên. */
export async function regenerateVoucherToken(userId: string, bookingId: string) {
  const id = await ownedId(userId, bookingId);
  const b = await prisma.booking.update({ where: { id }, data: { voucherToken: randomUUID() }, select: { voucherToken: true } });
  return b.voucherToken;
}

/** days = null → bỏ hạn; số ngày > 0 → hết hạn sau N ngày kể từ bây giờ. */
export async function setVoucherExpiry(userId: string, bookingId: string, days: number | null, now = Date.now()) {
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) throw new VoucherLinkError("Số ngày không hợp lệ (1–365)");
  const id = await ownedId(userId, bookingId);
  const at = days === null ? null : new Date(now + days * 86_400_000);
  await prisma.booking.update({ where: { id }, data: { voucherExpiresAt: at } });
  return at;
}

export const isVoucherExpired = (expiresAt: Date | null, now = Date.now()) => !!expiresAt && expiresAt.getTime() <= now;
