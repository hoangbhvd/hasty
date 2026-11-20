import { prisma } from "@/lib/db";
import { occupyingWhere } from "@/lib/availability";

export type CalProperty = { id: string; name: string; kind: "EXTERNAL" | "LINKED" };
export type CalBlock = {
  /** id booking của CTV (null nếu là lịch kín của người khác: không lộ thông tin) */
  bookingId: string | null;
  propertyId: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  /** Tên khách — chỉ có với booking của chính CTV */
  guestName: string | null;
};

/** Homestay CTV xem được: căn ngoài của mình + căn của chủ nhà đã duyệt liên kết. */
export async function calendarProperties(brokerId: string): Promise<CalProperty[]> {
  const [mine, linked] = await Promise.all([
    prisma.property.findMany({ where: { sourceType: "BROKER_EXTERNAL", createdByBrokerId: brokerId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.property.findMany({
      where: { sourceType: "HOST_MANAGED", host: { hostLinks: { some: { brokerId, status: "APPROVED", accessRole: { not: "CARETAKER" } } } } },
      orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
  ]);
  return [
    ...mine.map((p) => ({ ...p, kind: "EXTERNAL" as const })),
    ...linked.map((p) => ({ ...p, kind: "LINKED" as const })),
  ];
}

/** Lịch chiếm của các homestay đã chọn. Booking của người khác chỉ hiện là "kín" (không tên khách, không id). */
export async function calendarBlocks(brokerId: string, propertyIds: string[], from: Date, to: Date, now: Date): Promise<CalBlock[]> {
  if (propertyIds.length === 0) return [];
  const allowed = new Set((await calendarProperties(brokerId)).map((p) => p.id));
  const ids = propertyIds.filter((id) => allowed.has(id));
  if (ids.length === 0) return [];
  const rows = await prisma.booking.findMany({
    where: { propertyId: { in: ids }, ...occupyingWhere(from, to, now) },
    orderBy: { checkIn: "asc" },
    select: { id: true, propertyId: true, brokerId: true, checkIn: true, checkOut: true, status: true, guestName: true },
  });
  return rows.map((b) => b.brokerId === brokerId
    ? { bookingId: b.id, propertyId: b.propertyId, checkIn: b.checkIn, checkOut: b.checkOut, status: b.status, guestName: b.guestName }
    : { bookingId: null, propertyId: b.propertyId, checkIn: b.checkIn, checkOut: b.checkOut, status: "BUSY", guestName: null });
}

/** `p` trên URL: vắng = chọn tất cả; "-" = không chọn căn nào; còn lại là danh sách id cách nhau dấu phẩy. */
export function parseSelected(p: string | undefined, all: CalProperty[]): string[] {
  if (p === undefined) return all.map((x) => x.id);
  if (p === "-") return [];
  const want = new Set(p.split(",").filter(Boolean));
  return all.filter((x) => want.has(x.id)).map((x) => x.id);
}
export const selectedParam = (ids: string[], all: CalProperty[]) =>
  ids.length === all.length ? undefined : ids.length === 0 ? "-" : ids.join(",");
