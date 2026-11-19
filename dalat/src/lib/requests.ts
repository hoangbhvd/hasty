import { prisma } from "@/lib/db";
import { fetchOccupying, specialRows, buildQuote } from "@/lib/bookings";
import { matchProperty, type Match, type Road } from "@/lib/matching";
import { notifyUsers } from "@/lib/notify";
import { emitToUsers } from "@/lib/realtime";
import { formatVnd, parseDateOnly, todayVn } from "@/lib/format";

export class RequestError extends Error {}
export const VALID_HOURS = [2, 6, 12, 24, 48] as const;

export type RequestInput = {
  checkIn: string; checkOut: string; guestCount: number;
  area?: string | null; roadAccess?: string | null; maxBudget?: number | null; note?: string | null; hoursValid: number;
};

const AREAS = ["TRUNG_TAM", "TUYEN_LAM", "TRAI_MAT", "TA_NUNG", "DA_PHU", "PHUONG_11", "KHAC"];
const ROADS = ["MOTORBIKE", "CAR_7", "CAR_16", "BUS_29"];

type Req = { id: string; brokerId: string; checkIn: Date; checkOut: Date; guestCount: number; area: string | null; roadAccess: string | null; maxBudget: unknown };

/** Các căn của 1 Host khớp yêu cầu (tính theo lịch trống hiện tại). Giá Net tính theo hạng đối tác của Broker. */
export async function matchesForHost(hostId: string, req: Req, tier: "STANDARD" | "VIP" | "AGENCY" | null) {
  const props = await prisma.property.findMany({ where: { sourceType: "HOST_MANAGED", hostId }, include: { rooms: true } });
  if (props.length === 0) return [];
  const nights = Math.round((req.checkOut.getTime() - req.checkIn.getTime()) / 86_400_000);
  const occ = await fetchOccupying(prisma, props.map((p) => p.id), req.checkIn, req.checkOut);
  const out: { propertyId: string; name: string; match: Match }[] = [];
  for (const p of props) {
    const q = buildQuote(p, await specialRows(prisma, p.id, req.checkIn, req.checkOut), tier, req.checkIn, req.checkOut, "WHOLE_UNIT", []);
    const known = q.missing.length === 0 && q.total > 0;
    const m = matchProperty(
      { id: p.id, area: p.area, roadAccess: p.roadAccess as Road, allowWholeUnit: p.allowWholeUnit, allowIndividualRooms: p.allowIndividualRooms, rooms: p.rooms.map((r) => ({ id: r.id, maxGuests: r.maxGuests })) },
      { area: req.area, roadAccess: req.roadAccess as Road | null, guestCount: req.guestCount, maxBudgetPerNight: req.maxBudget === null || req.maxBudget === undefined ? null : Number(req.maxBudget) },
      occ.get(p.id) ?? [], known ? q.total : null, nights,
    );
    if (m) out.push({ propertyId: p.id, name: p.name, match: m });
  }
  return out;
}

const live = (now: Date) => ({ status: "OPEN" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

export async function createRoomRequest(brokerId: string, i: RequestInput) {
  const ci = parseDateOnly(i.checkIn), co = parseDateOnly(i.checkOut);
  if (!ci || !co || co <= ci) throw new RequestError("Ngày không hợp lệ");
  if (i.checkIn < todayVn()) throw new RequestError("Ngày check-in đã qua");
  if (Math.round((co.getTime() - ci.getTime()) / 86_400_000) > 30) throw new RequestError("Tối đa 30 đêm");
  if (!Number.isInteger(i.guestCount) || i.guestCount < 1 || i.guestCount > 100) throw new RequestError("Số khách không hợp lệ");
  if (i.area && !AREAS.includes(i.area)) throw new RequestError("Khu vực không hợp lệ");
  if (i.roadAccess && !ROADS.includes(i.roadAccess)) throw new RequestError("Loại xe không hợp lệ");
  if (i.maxBudget != null && (!Number.isInteger(i.maxBudget) || i.maxBudget < 0 || i.maxBudget > 1_000_000_000)) throw new RequestError("Ngân sách không hợp lệ");
  if (!(VALID_HOURS as readonly number[]).includes(i.hoursValid)) throw new RequestError("Thời hạn không hợp lệ");
  const note = i.note?.trim().slice(0, 500) || null;

  // Giới hạn chống spam: tối đa 10 yêu cầu đang mở
  if ((await prisma.roomRequest.count({ where: { brokerId, ...live(new Date()) } })) >= 10) throw new RequestError("Bạn đang có quá nhiều yêu cầu mở (tối đa 10)");

  const req = await prisma.roomRequest.create({
    data: {
      brokerId, checkIn: ci, checkOut: co, guestCount: i.guestCount,
      area: (i.area as never) ?? null, roadAccess: (i.roadAccess as never) ?? null,
      maxBudget: i.maxBudget ?? null, note, expiresAt: new Date(Date.now() + i.hoursValid * 3600_000),
    },
  });

  // Lọc tự động: chỉ Host đã duyệt CTV này VÀ có căn trống khớp tiêu chí
  const links = await prisma.hostBrokerLink.findMany({ where: { brokerId, status: "APPROVED" } });
  const matched: string[] = [];
  for (const l of links) {
    if ((await matchesForHost(l.hostId, req, l.tier)).length > 0) matched.push(l.hostId);
  }
  const text = `🔥 Tìm phòng gấp: ${i.guestCount} khách, ${i.checkIn} → ${i.checkOut}${i.maxBudget ? `, Net ≤ ${formatVnd(i.maxBudget)}/đêm` : ""}. Bạn có căn trống phù hợp!`;
  await notifyUsers(matched, text, "/host/requests");
  await emitToUsers(matched, "request:new", { requestId: req.id });
  return { request: req, matchedHosts: matched.length };
}

/** Bảng tin cho Host: yêu cầu còn hạn từ CTV đã duyệt, kèm các căn của mình khớp tiêu chí. */
export async function listRequestsForHost(hostId: string) {
  const now = new Date();
  const links = await prisma.hostBrokerLink.findMany({ where: { hostId, status: "APPROVED" }, include: { broker: { select: { fullName: true } } } });
  if (links.length === 0) return [];
  const reqs = await prisma.roomRequest.findMany({
    where: { brokerId: { in: links.map((l) => l.brokerId) }, ...live(now), checkOut: { gt: now } },
    orderBy: { createdAt: "desc" }, take: 50,
    include: { offers: { where: { hostId }, select: { id: true, propertyId: true, offeredNetPrice: true, note: true } } },
  });
  const rows = [];
  for (const r of reqs) {
    const link = links.find((l) => l.brokerId === r.brokerId)!;
    const matches = await matchesForHost(hostId, r, link.tier);
    if (matches.length === 0 && r.offers.length === 0) continue; // không có căn phù hợp → không hiện
    rows.push({ request: r, brokerName: link.broker.fullName, matches, offers: r.offers });
  }
  return rows;
}

export async function createOffer(hostId: string, requestId: string, propertyId: string, offeredNetPrice: number, note?: string | null) {
  const now = new Date();
  const req = await prisma.roomRequest.findFirst({ where: { id: requestId, ...live(now) } });
  if (!req) throw new RequestError("Yêu cầu đã đóng hoặc hết hạn");
  const link = await prisma.hostBrokerLink.findFirst({ where: { hostId, brokerId: req.brokerId, status: "APPROVED" } });
  if (!link) throw new RequestError("Bạn không có quyền với yêu cầu này");
  if (!Number.isInteger(offeredNetPrice) || offeredNetPrice < 0 || offeredNetPrice > 1_000_000_000) throw new RequestError("Giá Net không hợp lệ");
  const ok = (await matchesForHost(hostId, req, link.tier)).some((m) => m.propertyId === propertyId); // kiểm tra lại: căn có thể vừa bị đặt
  if (!ok) throw new RequestError("Căn này không còn khớp / không còn trống cho yêu cầu");

  const n = note?.trim().slice(0, 500) || null;
  const existing = await prisma.roomRequestOffer.findFirst({ where: { requestId, hostId, propertyId } });
  const offer = existing
    ? await prisma.roomRequestOffer.update({ where: { id: existing.id }, data: { offeredNetPrice, note: n } })
    : await prisma.roomRequestOffer.create({ data: { requestId, hostId, propertyId, offeredNetPrice, note: n } });
  const prop = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } });
  await notifyUsers([req.brokerId], `Đề xuất mới cho yêu cầu tìm gấp: ${prop?.name} — Net ${formatVnd(offeredNetPrice)}`, "/broker/requests");
  await emitToUsers([req.brokerId], "request:offer", { requestId });
  return offer;
}

export async function listMyRequests(brokerId: string) {
  const now = Date.now();
  const rows = await prisma.roomRequest.findMany({
    where: { brokerId }, orderBy: { createdAt: "desc" }, take: 30,
    include: { offers: { orderBy: { createdAt: "asc" }, include: { host: { select: { fullName: true } }, property: { select: { name: true } } } } },
  });
  // `expired`/`open` tính ở đây để giao diện không phải gọi Date.now()
  return rows.map((r) => {
    const expired = r.expiresAt ? r.expiresAt.getTime() <= now : false;
    return { ...r, expired, open: r.status === "OPEN" && !expired };
  });
}

export async function closeRequest(brokerId: string, requestId: string) {
  const r = await prisma.roomRequest.updateMany({ where: { id: requestId, brokerId, status: "OPEN" }, data: { status: "CLOSED" } });
  if (r.count === 0) throw new RequestError("Không tìm thấy yêu cầu đang mở");
}

/** CTV chốt 1 đề xuất: đóng yêu cầu, báo Host, trả về thông tin để sang trang đặt phòng. */
export async function chooseOffer(brokerId: string, offerId: string) {
  const offer = await prisma.roomRequestOffer.findUnique({ where: { id: offerId }, include: { request: true, property: { select: { name: true } } } });
  if (!offer || offer.request.brokerId !== brokerId) throw new RequestError("Không tìm thấy đề xuất");
  const closed = await prisma.roomRequest.updateMany({ where: { id: offer.requestId, status: "OPEN" }, data: { status: "CLOSED" } });
  if (closed.count === 0) throw new RequestError("Yêu cầu đã đóng");
  await notifyUsers([offer.hostId], `CTV đã chọn đề xuất ${offer.property.name} của bạn. Hãy chờ họ giữ phòng.`, "/host/requests");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { propertyId: offer.propertyId, checkIn: iso(offer.request.checkIn), checkOut: iso(offer.request.checkOut) };
}

/** Đóng các yêu cầu đã hết hạn (worker gọi định kỳ). */
export async function closeExpiredRequests(now = new Date()): Promise<number> {
  return (await prisma.roomRequest.updateMany({ where: { status: "OPEN", expiresAt: { lte: now } }, data: { status: "CLOSED" } })).count;
}

