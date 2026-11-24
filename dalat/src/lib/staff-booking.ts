import { prisma } from "@/lib/db";
import { effectiveAccess } from "@/lib/staff";

/** Co-host xem chi tiết booking của người khác ở căn được giao. Không có công nợ, giao dịch; Net chỉ khi chủ nhà bật. */
export async function coHostBookingView(userId: string, bookingId: string) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      property: { select: { name: true, sourceType: true, hostId: true } },
      rooms: { include: { room: { select: { name: true } } } },
      broker: { select: { fullName: true } },
    },
  });
  if (!b || b.property.sourceType !== "HOST_MANAGED" || !b.property.hostId) return null;
  const link = await prisma.hostBrokerLink.findFirst({ where: { hostId: b.property.hostId, brokerId: userId, status: "APPROVED" } });
  if (!link) return null;
  const eff = effectiveAccess(link, b.propertyId);
  if (eff.none || eff.role !== "CO_HOST") return null;
  return {
    id: b.id, code: b.bookingCode, status: b.status, property: b.property.name,
    checkIn: b.checkIn, checkOut: b.checkOut, holdExpiresAt: b.holdExpiresAt,
    guestName: b.guestName, guestPhone: b.guestPhone, guestCount: b.guestCount, childCount: b.childCount, guestNote: b.guestNote,
    roomText: b.bookingType === "ROOMS" ? b.rooms.map((r) => r.room.name).join(", ") : "Nguyên căn",
    createdBy: b.broker?.fullName ?? "Chủ nhà",
    total: Number(b.guestTotalPrice),
    hostNet: eff.seesNet ? Number(b.hostNetPrice) : null,
  };
}
