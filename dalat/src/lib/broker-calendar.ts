import { prisma } from "@/lib/db";
import { calendarWhere } from "@/lib/availability";
import { effectiveAccess } from "@/lib/staff";

export type CalProperty = { id: string; name: string; kind: "EXTERNAL" | "LINKED" };
export type CalBlock = {
  /** id booking để mở chi tiết: của CTV, hoặc mọi booking ở căn CTV là Co-host (null nếu là lịch kín) */
  bookingId: string | null;
  propertyId: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  /** Tên / SĐT khách — chỉ có với booking của chính CTV hoặc mọi booking ở căn mà CTV là Co-host */
  guestName: string | null;
  guestPhone: string | null;
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
  // Căn mà CTV là Co-host (trong phạm vi được giao): thấy tên + SĐT khách của mọi booking
  const links = await prisma.hostBrokerLink.findMany({ where: { brokerId, status: "APPROVED" } });
  const props = await prisma.property.findMany({ where: { id: { in: ids }, sourceType: "HOST_MANAGED" }, select: { id: true, hostId: true } });
  const coHost = new Set(props.filter((p) => {
    const l = links.find((x) => x.hostId === p.hostId);
    return l && effectiveAccess(l, p.id).role === "CO_HOST";
  }).map((p) => p.id));
  const rows = await prisma.booking.findMany({
    where: { propertyId: { in: ids }, ...calendarWhere(from, to, now) },
    orderBy: { checkIn: "asc" },
    select: { id: true, propertyId: true, brokerId: true, checkIn: true, checkOut: true, status: true, guestName: true, guestPhone: true },
  });
  return rows.flatMap((b): CalBlock[] => {
    const own = b.brokerId === brokerId;
    if (own || coHost.has(b.propertyId)) return [{ bookingId: b.id, propertyId: b.propertyId, checkIn: b.checkIn, checkOut: b.checkOut, status: b.status, guestName: b.guestName, guestPhone: b.guestPhone }];
    if (b.status === "CHECKED_OUT") return []; // booking đã xong của người khác: không còn là lịch bận
    return [{ bookingId: null, propertyId: b.propertyId, checkIn: b.checkIn, checkOut: b.checkOut, status: "BUSY", guestName: null, guestPhone: null }];
  });
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
