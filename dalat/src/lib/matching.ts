import { freeRoomIds, wholeUnitAvailable, type OccupyingBooking } from "@/lib/availability";

export const ROAD_RANK = { MOTORBIKE: 0, CAR_7: 1, CAR_16: 2, BUS_29: 3 } as const;
export type Road = keyof typeof ROAD_RANK;

export type Criteria = { area: string | null; roadAccess: Road | null; guestCount: number; maxBudgetPerNight: number | null };
export type Candidate = {
  id: string; area: string; roadAccess: Road;
  allowWholeUnit: boolean; allowIndividualRooms: boolean;
  rooms: { id: string; maxGuests: number }[];
};
export type Match = {
  wholeAvailable: boolean;
  /** Net trung bình/đêm của nguyên căn; null nếu chưa cấu hình giá (không thể so ngân sách) */
  wholeNetPerNight: number | null;
  freeRooms: { id: string; maxGuests: number }[];
};

/**
 * Căn có khớp yêu cầu tìm gấp không (mục 5 Phase 5: lọc tự động theo tiêu chí).
 * Trả về null nếu không có phương án nào: cần tối thiểu 1 trong 2 — nguyên căn trống (và trong ngân sách), hoặc các phòng lẻ còn trống đủ chỗ.
 */
export function matchProperty(p: Candidate, c: Criteria, occ: OccupyingBooking[], wholeNetTotal: number | null, nights: number): Match | null {
  if (c.area && p.area !== c.area) return null;
  if (c.roadAccess && ROAD_RANK[p.roadAccess] < ROAD_RANK[c.roadAccess]) return null; // xe lớn hơn thì vào được nhỏ hơn, không ngược lại

  const perNight = wholeNetTotal !== null && nights > 0 ? Math.round(wholeNetTotal / nights) : null;
  const inBudget = c.maxBudgetPerNight === null || perNight === null || perNight <= c.maxBudgetPerNight;
  const wholeAvailable = p.allowWholeUnit && wholeUnitAvailable(occ) && inBudget;

  let freeRooms: Match["freeRooms"] = [];
  if (p.allowIndividualRooms) {
    const free = new Set(freeRoomIds(occ, p.rooms.map((r) => r.id)));
    const list = p.rooms.filter((r) => free.has(r.id));
    if (list.reduce((s, r) => s + r.maxGuests, 0) >= c.guestCount) freeRooms = list;
  }
  if (!wholeAvailable && freeRooms.length === 0) return null;
  return { wholeAvailable, wholeNetPerNight: perNight, freeRooms };
}
