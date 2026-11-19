import { prisma } from "@/lib/db";
import { bookingLedger } from "@/lib/booking-finance";
import { parseDateOnly, todayVn } from "@/lib/format";

/** Tháng dạng yyyy-mm; mặc định tháng hiện tại theo giờ Việt Nam. */
export function monthRange(month?: string) {
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : todayVn().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
  return { month: m, prev, next, from: parseDateOnly(`${m}-01`)!, to: parseDateOnly(`${next}-01`)! };
}

const SOLD = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"];
const include = {
  addons: true, transactions: true,
  property: { select: { name: true } },
  broker: { select: { id: true, fullName: true } },
  host: { select: { id: true, fullName: true } },
} as const;

type Row = Awaited<ReturnType<typeof load>>[number];
const load = (where: object) => prisma.booking.findMany({ where, include, orderBy: { checkIn: "desc" }, take: 3000 });

export type DebtRow = { bookingId: string; code: string; guest: string; property: string; owed: number };

// ───────────────────────── HOST ─────────────────────────
export async function hostFinance(hostId: string, monthStr?: string) {
  const r = monthRange(monthStr);
  const rows = await load({ hostId, status: { not: "HOLDING" } });

  const inMonth = rows.filter((b) => SOLD.includes(b.status) && b.checkIn >= r.from && b.checkIn < r.to);
  let revenue = 0, received = 0, deposits = 0;
  for (const b of inMonth) {
    const l = bookingLedger(b);
    revenue += l.hostEntitled;
    received += l.hostCash;
    deposits += b.transactions
      .filter((t) => t.status === "CONFIRMED" && t.txType === "DEPOSIT" && t.receiverRole === "HOST")
      .reduce((s, t) => s + Number(t.amount), 0);
  }

  // Công nợ tính trên MỌI booking (không giới hạn tháng): còn nợ là còn nợ
  const byBroker = new Map<string, { brokerId: string; name: string; owed: number; bookings: DebtRow[] }>();
  for (const b of rows) {
    if (!b.brokerId || !b.broker) continue;
    const owed = bookingLedger(b).owedToHost;
    if (owed === 0) continue;
    const e = byBroker.get(b.brokerId) ?? { brokerId: b.brokerId, name: b.broker.fullName, owed: 0, bookings: [] };
    e.owed += owed;
    e.bookings.push({ bookingId: b.id, code: b.bookingCode, guest: b.guestName, property: b.property.name, owed });
    byBroker.set(b.brokerId, e);
  }
  const brokers = [...byBroker.values()].sort((a, b) => Math.abs(b.owed) - Math.abs(a.owed));
  return {
    ...r, count: inMonth.length, revenue, received, deposits,
    brokerOwesYou: brokers.filter((b) => b.owed > 0).reduce((s, b) => s + b.owed, 0),
    youOweBrokers: brokers.filter((b) => b.owed < 0).reduce((s, b) => s - b.owed, 0),
    brokers,
  };
}

// ───────────────────────── BROKER ─────────────────────────
export async function brokerFinance(brokerId: string, monthStr?: string) {
  const r = monthRange(monthStr);
  const rows = await load({ brokerId, status: { not: "HOLDING" } });

  const inMonth = rows.filter((b) => SOLD.includes(b.status) && b.checkIn >= r.from && b.checkIn < r.to);
  const byProperty = new Map<string, { name: string; count: number; sales: number; commission: number; realized: number; pending: number }>();
  let sales = 0, commission = 0, realized = 0, pending = 0;
  for (const b of inMonth) {
    const l = bookingLedger(b);
    sales += l.guestPayable; commission += l.commission; realized += l.commissionRealized; pending += l.commissionPending;
    const e = byProperty.get(b.propertyId) ?? { name: b.property.name, count: 0, sales: 0, commission: 0, realized: 0, pending: 0 };
    e.count++; e.sales += l.guestPayable; e.commission += l.commission; e.realized += l.commissionRealized; e.pending += l.commissionPending;
    byProperty.set(b.propertyId, e);
  }

  const debts: DebtRow[] = [];
  for (const b of rows as Row[]) {
    if (!b.hostId) continue;
    const owed = bookingLedger(b).owedToHost;
    if (owed !== 0) debts.push({ bookingId: b.id, code: b.bookingCode, guest: b.guestName, property: b.property.name, owed });
  }
  return {
    ...r, count: inMonth.length, sales, commission, realized, pending,
    properties: [...byProperty.values()].sort((a, b) => b.commission - a.commission),
    youOwe: debts.filter((d) => d.owed > 0).reduce((s, d) => s + d.owed, 0),
    owedToYou: debts.filter((d) => d.owed < 0).reduce((s, d) => s - d.owed, 0),
    debts,
  };
}
