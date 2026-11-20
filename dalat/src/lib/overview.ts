import { prisma } from "@/lib/db";
import { addDays, parseDateOnly, todayVn } from "@/lib/format";
import { listConversations } from "@/lib/chat";
import { hostFinance, brokerFinance } from "@/lib/finance";
import { listRequestsForHost, listMyRequests } from "@/lib/requests";

export type BookingItem = {
  id: string; code: string; guest: string; property: string; guests: number;
  checkIn: Date; checkOut: Date; status: string;
  /** Số phút còn lại của giữ phòng (null nếu không phải HOLDING) */
  minutesLeft: number | null;
};

const select = {
  id: true, bookingCode: true, guestName: true, guestCount: true, checkIn: true, checkOut: true, status: true, holdExpiresAt: true,
  property: { select: { name: true } },
} as const;

type Row = { id: string; bookingCode: string; guestName: string; guestCount: number; checkIn: Date; checkOut: Date; status: string; holdExpiresAt: Date | null; property: { name: string } };

function toItem(r: Row, now: number): BookingItem {
  return {
    id: r.id, code: r.bookingCode, guest: r.guestName, property: r.property.name, guests: r.guestCount,
    checkIn: r.checkIn, checkOut: r.checkOut, status: r.status,
    minutesLeft: r.status === "HOLDING" && r.holdExpiresAt ? Math.max(Math.ceil((r.holdExpiresAt.getTime() - now) / 60_000), 0) : null,
  };
}

/** Nếu mọi giao dịch chờ đều thuộc 1 booking thì trả id đó (để dẫn thẳng tới), ngược lại null. */
function oneBooking(txs: { bookingId: string }[]): string | null {
  const ids = new Set(txs.map((t) => t.bookingId));
  return ids.size === 1 ? [...ids][0] : null;
}

/** Ví dụ: "thứ sáu, 20/11/2026" (giờ Việt Nam). */
export function todayLabel(): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

/** Mốc ngày theo giờ Việt Nam (cột DATE lưu UTC 00:00 của đúng ngày đó). */
function days() {
  const today = todayVn();
  return { today, todayD: parseDateOnly(today)!, tomorrowD: parseDateOnly(addDays(today, 1))!, dayAfterD: parseDateOnly(addDays(today, 2))! };
}

/** Các giữ phòng còn hiệu lực (chưa quá hạn), sắp hết hạn trước. */
const liveHolds = (now: Date) => ({ status: "HOLDING" as const, holdExpiresAt: { gt: now } });

// ───────────────────────── HOST ─────────────────────────
export async function hostOverview(hostId: string) {
  const now = new Date();
  const { todayD, tomorrowD, dayAfterD } = days();
  const mine = { hostId, property: { sourceType: "HOST_MANAGED" as const } };

  const [arrivals, staying, departures, holds, pendingTx, pendingLinks, holdRequests, convs, fin, requests] = await Promise.all([
    prisma.booking.findMany({ where: { ...mine, status: "CONFIRMED", checkIn: { gte: todayD, lt: dayAfterD } }, orderBy: { checkIn: "asc" }, select }),
    prisma.booking.findMany({ where: { ...mine, status: "CHECKED_IN" }, orderBy: { checkOut: "asc" }, select, take: 20 }),
    prisma.booking.findMany({ where: { ...mine, status: { in: ["CHECKED_IN", "CONFIRMED"] }, checkOut: { gte: todayD, lt: dayAfterD } }, orderBy: { checkOut: "asc" }, select }),
    prisma.booking.findMany({ where: { ...mine, ...liveHolds(now) }, orderBy: { holdExpiresAt: "asc" }, select, take: 20 }),
    prisma.transaction.findMany({ where: { status: "PENDING_CONFIRM", booking: { hostId }, OR: [{ receiverRole: "HOST" }, { receiverRole: "GUEST", payerRole: "HOST" }] }, select: { bookingId: true } }),
    prisma.hostBrokerLink.count({ where: { hostId, status: "PENDING" } }),
    prisma.message.count({ where: { msgType: "ACTION_HOLD_REQ", conversation: { hostId }, metadata: { path: ["status"], equals: "PENDING" } } }),
    listConversations(hostId),
    hostFinance(hostId),
    listRequestsForHost(hostId),
  ]);
  const t = now.getTime();
  const unread = convs.filter((c) => c.role === "HOST").reduce((s, c) => s + c.unread, 0);
  return {
    today: days().today, label: todayLabel(),
    arrivalsToday: arrivals.filter((b) => b.checkIn < tomorrowD).map((b) => toItem(b, t)),
    arrivalsTomorrow: arrivals.filter((b) => b.checkIn >= tomorrowD).map((b) => toItem(b, t)),
    staying: staying.map((b) => toItem(b, t)),
    departuresToday: departures.filter((b) => b.checkOut < tomorrowD).map((b) => toItem(b, t)),
    holds: holds.map((b) => toItem(b, t)),
    todo: { holdRequests: holdRequests, pendingTx: pendingTx.length, pendingTxBookingId: oneBooking(pendingTx), pendingLinks, urgentRequests: requests.length, unread },
    month: { label: fin.month, revenue: fin.revenue, received: fin.received, brokerOwesYou: fin.brokerOwesYou, youOweBrokers: fin.youOweBrokers },
  };
}

// ───────────────────────── BROKER ─────────────────────────
export async function brokerOverview(brokerId: string) {
  const now = new Date();
  const { todayD, tomorrowD, dayAfterD } = days();
  const mine = { brokerId };

  const [arrivals, holds, upcoming, pendingTx, convs, fin, myRequests] = await Promise.all([
    prisma.booking.findMany({ where: { ...mine, status: "CONFIRMED", checkIn: { gte: todayD, lt: dayAfterD } }, orderBy: { checkIn: "asc" }, select }),
    prisma.booking.findMany({ where: { ...mine, ...liveHolds(now) }, orderBy: { holdExpiresAt: "asc" }, select, take: 20 }),
    prisma.booking.findMany({ where: { ...mine, status: "CONFIRMED", checkIn: { gte: dayAfterD } }, orderBy: { checkIn: "asc" }, select, take: 5 }),
    prisma.transaction.findMany({ where: { status: "PENDING_CONFIRM", booking: { brokerId }, OR: [{ receiverRole: "BROKER" }, { receiverRole: "GUEST", payerRole: "BROKER" }] }, select: { bookingId: true } }),
    listConversations(brokerId),
    brokerFinance(brokerId),
    listMyRequests(brokerId),
  ]);
  const t = now.getTime();
  const open = myRequests.filter((r) => r.open);
  const unread = convs.filter((c) => c.role === "BROKER").reduce((s, c) => s + c.unread, 0);
  return {
    today: days().today, label: todayLabel(),
    arrivalsToday: arrivals.filter((b) => b.checkIn < tomorrowD).map((b) => toItem(b, t)),
    arrivalsTomorrow: arrivals.filter((b) => b.checkIn >= tomorrowD).map((b) => toItem(b, t)),
    upcoming: upcoming.map((b) => toItem(b, t)),
    holds: holds.map((b) => toItem(b, t)),
    todo: {
      expiringHolds: holds.filter((b) => b.holdExpiresAt && b.holdExpiresAt.getTime() - t <= 10 * 60_000).length, // còn ≤ 10 phút
      pendingTx: pendingTx.length, pendingTxBookingId: oneBooking(pendingTx), unread,
      newOffers: open.reduce((s, r) => s + r.offers.length, 0),
      openRequests: open.length,
    },
    month: { label: fin.month, sales: fin.sales, commission: fin.commission, realized: fin.realized, pending: fin.pending, youOwe: fin.youOwe, owedToYou: fin.owedToYou },
  };
}
