// Phần thuần (không DB) của điểm uy tín CTV — có unit test.
export type TrustBase = { orders: number; guests: number; nights: number; cancelledAfterConfirm: number };
export type Badge = "NEW" | "ACTIVE" | "TOP";
export type TrustStats = TrustBase & { score: number; badge: Badge; completionRate: number | null; cancelRate: number | null };

export const BADGE_LABEL: Record<Badge, string> = { NEW: "CTV Mới", ACTIVE: "CTV Tích cực", TOP: "Top Seller Đà Lạt" };

/** +10/đơn CHECKED_OUT, +2/đêm bán được, −15/đơn hủy sau khi đã xác nhận. Không âm. */
export const scoreOf = (s: TrustBase) => Math.max(0, s.orders * 10 + s.nights * 2 - s.cancelledAfterConfirm * 15);

export const badgeOf = (score: number): Badge => (score >= 200 ? "TOP" : score >= 50 ? "ACTIVE" : "NEW");

/** Tỷ lệ hoàn thành = đơn xong / (đơn xong + đơn hủy sau xác nhận). Chưa có đơn nào → null. */
export function completionOf(s: Pick<TrustBase, "orders" | "cancelledAfterConfirm">) {
  const total = s.orders + s.cancelledAfterConfirm;
  if (total === 0) return { completionRate: null, cancelRate: null };
  return { completionRate: s.orders / total, cancelRate: s.cancelledAfterConfirm / total };
}
