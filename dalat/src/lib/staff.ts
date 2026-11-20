// Phân quyền Co-host / Quản gia trên từng căn của chủ nhà (spec "Lịch Trống Tổng Quan & Phân quyền").
import { prisma } from "@/lib/db";

export type AccessRole = "BROKER" | "CO_HOST" | "CARETAKER";
export type LinkLite = { accessRole: AccessRole; allowInstantBook: boolean; assignedPropertyIds: unknown };

/** Danh sách id căn được chỉ định; null = áp dụng cho mọi căn của chủ nhà. */
export function assignedIds(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
}

export type Effective = { role: AccessRole; /** được tạo booking CONFIRMED ngay (vẫn chạy khoá chống trùng) */ instant: boolean; /** quản gia ngoài phạm vi được chỉ định: không có quyền gì với căn này */ none?: boolean };

/**
 * Quyền hiệu lực của 1 liên kết (đã APPROVED) trên 1 căn.
 * CO_HOST/CARETAKER chỉ có hiệu lực ở các căn được chỉ định; căn khác: CO_HOST xuống thành CTV thường, quản gia không có quyền.
 */
export function effectiveAccess(link: LinkLite, propertyId: string): Effective {
  const ids = assignedIds(link.assignedPropertyIds);
  const inScope = ids === null || ids.includes(propertyId);
  if (link.accessRole === "CO_HOST" && inScope) return { role: "CO_HOST", instant: true };
  if (link.accessRole === "CARETAKER") return inScope ? { role: "CARETAKER", instant: false } : { role: "CARETAKER", instant: false, none: true };
  return { role: "BROKER", instant: link.allowInstantBook };
}

/** Quyền của user trên 1 căn của chủ nhà; null nếu chưa được duyệt liên kết. */
export async function accessOnProperty(userId: string, propertyId: string) {
  const p = await prisma.property.findUnique({ where: { id: propertyId }, select: { hostId: true, sourceType: true } });
  if (!p?.hostId || p.sourceType !== "HOST_MANAGED") return null;
  const link = await prisma.hostBrokerLink.findFirst({ where: { hostId: p.hostId, brokerId: userId, status: "APPROVED" } });
  return link ? { link, hostId: p.hostId, ...effectiveAccess(link, propertyId) } : null;
}

/** Hành động trạng thái booking mỗi vai trò được làm (ngoài chủ nhà / CTV tạo đơn). */
export function staffMay(role: AccessRole, action: "CONFIRM" | "CHECK_IN" | "CHECK_OUT" | "CANCEL" | "CLEAN"): boolean {
  if (role === "CO_HOST") return true;
  if (role === "CARETAKER") return action === "CHECK_IN" || action === "CHECK_OUT" || action === "CLEAN";
  return false;
}
