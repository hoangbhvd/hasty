// Lịch trống tổng quan cho CTV / Co-host / Quản gia (spec "Broker Availability Matrix").
// Quy tắc bảo mật: dữ liệu được lọc THEO VAI TRÒ ngay trong hàm này, rồi mới trả ra UI.
//  - BROKER: không thấy quá khứ; ô của người khác chỉ có trạng thái; đơn của chính mình có tên khách + link.
//  - CARETAKER: 7 ngày gần nhất trở đi; thấy khách + số tiền thu nốt, KHÔNG thấy giá/Net/doanh thu.
//  - CO_HOST: thấy đủ thông tin đơn (không có giá Net / hoa hồng).
import { prisma } from "@/lib/db";
import { addDays, parseDateOnly, todayVn } from "@/lib/format";
import { effectiveAccess, type AccessRole } from "@/lib/staff";

export type BlockStatus = "BUSY" | "HOLDING" | "CROSS_LOCKED" | "MINE";
export type BlockDetail = {
  bookingId: string; code: string; guestName: string; guestPhone: string | null; guestCount: number;
  checkIn: string; checkOut: string; status: string;
  /** Số tiền khách còn phải trả (Co-host / Quản gia) */
  remaining?: number;
  /** Tổng tiền khách trả — chỉ Co-host */
  total?: number;
  cleaned?: boolean;
};
export type MatrixBlock = { key: string; start: number; end: number; status: BlockStatus; partial?: boolean; detail?: BlockDetail };
export type MatrixRow = { key: string; propertyId: string; roomId: string | null; label: string; blocks: MatrixBlock[] };
export type MatrixProperty = {
  id: string; name: string; area: string; roadAccess: string; allowWhole: boolean; allowRooms: boolean; kind: "LINKED" | "EXTERNAL";
  role: AccessRole; instant: boolean; row: MatrixRow; rooms: MatrixRow[];
};
export type MatrixFilter = { area?: string; mode?: "whole" | "rooms"; road?: string };
export type Matrix = { from: string; days: string[]; properties: MatrixProperty[] };

const ROAD_ORDER = ["MOTORBIKE", "CAR_7", "CAR_16", "BUS_29"];
export const MAX_DAYS = 60;
const dayIndex = (from: string, d: Date) => Math.round((d.getTime() - parseDateOnly(from)!.getTime()) / 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ngày bắt đầu sớm nhất mỗi vai trò được xem. */
export function earliestFor(role: AccessRole, today = todayVn()): string | null {
  return role === "BROKER" ? today : role === "CARETAKER" ? addDays(today, -7) : null;
}

export async function availabilityMatrix(userId: string, fromReq: string | undefined, daysReq: number, f: MatrixFilter = {}, now = new Date()): Promise<Matrix> {
  const today = todayVn();
  const days = Math.min(Math.max(Math.round(daysReq) || 30, 7), MAX_DAYS);
  const wanted = fromReq && parseDateOnly(fromReq) ? fromReq : today;

  const [links, own] = await Promise.all([
    prisma.hostBrokerLink.findMany({ where: { brokerId: userId, status: "APPROVED" } }),
    prisma.property.findMany({ where: { sourceType: "BROKER_EXTERNAL", createdByBrokerId: userId }, select: { id: true } }),
  ]);
  const roadIdx = ROAD_ORDER.indexOf(f.road ?? "");
  const props = await prisma.property.findMany({
    where: {
      OR: [{ sourceType: "HOST_MANAGED", hostId: { in: links.map((l) => l.hostId) } }, { id: { in: own.map((p) => p.id) } }],
      ...(f.area ? { area: f.area as never } : {}),
      ...(f.mode === "whole" ? { allowWholeUnit: true } : f.mode === "rooms" ? { allowIndividualRooms: true } : {}),
      ...(roadIdx >= 0 ? { roadAccess: { in: ROAD_ORDER.slice(roadIdx) as never } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, area: true, roadAccess: true, allowWholeUnit: true, allowIndividualRooms: true, hostId: true, sourceType: true, rooms: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });

  // Quyền hiệu lực từng căn; quản gia ngoài phạm vi được giao không thấy căn đó
  const linkOf = new Map(links.map((l) => [l.hostId, l]));
  const scoped = props.flatMap((p) => {
    if (p.sourceType === "BROKER_EXTERNAL") return [{ p, eff: { role: "BROKER" as AccessRole, instant: true } }];
    const eff = effectiveAccess(linkOf.get(p.hostId!)!, p.id);
    return eff.none ? [] : [{ p, eff }];
  });

  // Khoảng xem: mỗi căn theo vai trò. Lấy ngày sớm nhất hợp lệ cho từng vai trò rồi cắt theo từng căn.
  const fromOf = (role: AccessRole) => { const e = earliestFor(role, today); return e && wanted < e ? e : wanted; };
  const from = scoped.length ? scoped.map((s) => fromOf(s.eff.role)).sort()[0] : wanted;
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const to = addDays(from, days);

  const ids = scoped.map((s) => s.p.id);
  const bookings = ids.length === 0 ? [] : await prisma.booking.findMany({
    where: {
      propertyId: { in: ids }, checkIn: { lt: parseDateOnly(to)! }, checkOut: { gt: parseDateOnly(from)! },
      OR: [{ status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } }, { status: "HOLDING", holdExpiresAt: { gt: now } }],
    },
    orderBy: { checkIn: "asc" },
    select: {
      id: true, bookingCode: true, propertyId: true, brokerId: true, bookingType: true, status: true, checkIn: true, checkOut: true,
      guestName: true, guestPhone: true, guestCount: true, guestTotalPrice: true, extraFees: true, cleanedAt: true,
      rooms: { select: { roomId: true } },
      addons: { select: { quantity: true, guestPrice: true } },
      transactions: { where: { status: "CONFIRMED", OR: [{ payerRole: "GUEST" }, { receiverRole: "GUEST" }] }, select: { amount: true, receiverRole: true } },
    },
  });

  const properties: MatrixProperty[] = scoped.map(({ p, eff }) => {
    const role = eff.role;
    const min = earliestFor(role, today);
    const mine = bookings.filter((b) => b.propertyId === p.id);
    const mk = (b: (typeof bookings)[number], key: string, status: BlockStatus, partial = false): MatrixBlock | null => {
      let start = dayIndex(from, b.checkIn), end = dayIndex(from, b.checkOut);
      if (min) start = Math.max(start, dayIndex(from, parseDateOnly(min)!)); // không lộ ngày trước giới hạn của vai trò
      start = Math.max(start, 0); end = Math.min(end, days);
      if (end <= start) return null;
      const block: MatrixBlock = { key, start, end, status, ...(partial ? { partial } : {}) };
      const own = b.brokerId === userId;
      if (status === "CROSS_LOCKED") return block; // ô khoá chéo chỉ là trạng thái
      if (role === "BROKER" && own) block.detail = detailOf(b, "BROKER");
      else if (role !== "BROKER") block.detail = detailOf(b, role);
      return block;
    };
    const visible = (b: (typeof bookings)[number]) => role !== "BROKER" || b.status !== "CHECKED_OUT";
    const statusOf = (b: (typeof bookings)[number]): BlockStatus => (role === "BROKER" && b.brokerId === userId ? "MINE" : b.status === "HOLDING" ? "HOLDING" : "BUSY");

    const propRow: MatrixRow = {
      key: p.id, propertyId: p.id, roomId: null, label: p.name,
      blocks: mine.filter(visible).flatMap((b) => mk(b, `${b.id}`, statusOf(b), b.bookingType === "ROOMS") ?? []),
    };
    const roomRows: MatrixRow[] = p.rooms.map((r) => ({
      key: r.id, propertyId: p.id, roomId: r.id, label: r.name,
      blocks: mine.filter(visible).flatMap((b) => {
        if (b.bookingType === "WHOLE_UNIT") return mk(b, `${b.id}:${r.id}`, "CROSS_LOCKED") ?? [];
        if (!b.rooms.some((x) => x.roomId === r.id)) return [];
        return mk(b, `${b.id}:${r.id}`, statusOf(b)) ?? [];
      }),
    }));
    return {
      id: p.id, name: p.name, area: p.area, roadAccess: p.roadAccess, allowWhole: p.allowWholeUnit, allowRooms: p.allowIndividualRooms,
      kind: p.sourceType === "BROKER_EXTERNAL" ? "EXTERNAL" : "LINKED", role, instant: eff.instant, row: propRow, rooms: roomRows,
    };
  });
  return { from, days: dayList, properties };
}

function detailOf(b: { id: string; bookingCode: string; guestName: string; guestPhone: string | null; guestCount: number; checkIn: Date; checkOut: Date; status: string; guestTotalPrice: unknown; extraFees: unknown; cleanedAt: Date | null; addons: { quantity: number; guestPrice: unknown }[]; transactions: { amount: unknown; receiverRole: string }[] }, role: AccessRole): BlockDetail {
  const base: BlockDetail = { bookingId: b.id, code: b.bookingCode, guestName: b.guestName, guestPhone: null, guestCount: b.guestCount, checkIn: iso(b.checkIn), checkOut: iso(b.checkOut), status: b.status };
  if (role === "BROKER") return base; // đơn của chính CTV: chi tiết xem ở trang booking
  const total = Number(b.guestTotalPrice) + Number(b.extraFees) + b.addons.reduce((s, a) => s + a.quantity * Number(a.guestPrice), 0);
  const paid = b.transactions.reduce((s, t) => s + (t.receiverRole === "GUEST" ? -1 : 1) * Number(t.amount), 0);
  return { ...base, guestPhone: b.guestPhone, remaining: Math.max(total - paid, 0), cleaned: !!b.cleanedAt, ...(role === "CO_HOST" ? { total } : {}) };
}
