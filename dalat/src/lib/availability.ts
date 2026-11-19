export type OccupyingBooking = { bookingType: "WHOLE_UNIT" | "ROOMS" | "EXTERNAL_MANUAL"; roomIds: string[] };

/**
 * Điều kiện "đang chiếm lịch" (mục 4.1 spec) dưới dạng Prisma `where`:
 * status IN (CONFIRMED, CHECKED_IN) OR (HOLDING AND hold_expires_at > now)
 * và giao thời gian: check_in < reqOut AND check_out > reqIn.
 */
export function occupyingWhere(checkIn: Date, checkOut: Date, now: Date) {
  return {
    checkIn: { lt: checkOut },
    checkOut: { gt: checkIn },
    OR: [
      { status: { in: ["CONFIRMED", "CHECKED_IN"] as ("CONFIRMED" | "CHECKED_IN")[] } },
      { status: "HOLDING" as const, holdExpiresAt: { gt: now } },
    ],
  };
}

/** Đặt WHOLE_UNIT: không được có BẤT KỲ booking chiếm lịch nào của căn. */
export function wholeUnitAvailable(occ: OccupyingBooking[]): boolean {
  return occ.length === 0;
}

/** Đặt ROOMS: không có booking WHOLE_UNIT và không phòng nào trong danh sách đang bị chiếm. */
export function roomsAvailable(occ: OccupyingBooking[], roomIds: string[]): boolean {
  const want = new Set(roomIds);
  return !occ.some((b) => b.bookingType === "WHOLE_UNIT" || b.roomIds.some((r) => want.has(r)));
}

/** Các phòng còn trống trong khoảng ngày. */
export function freeRoomIds(occ: OccupyingBooking[], allRoomIds: string[]): string[] {
  if (occ.some((b) => b.bookingType === "WHOLE_UNIT")) return [];
  const taken = new Set(occ.flatMap((b) => b.roomIds));
  return allRoomIds.filter((r) => !taken.has(r));
}
