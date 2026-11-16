import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { vnd } from "@/lib/format";
import { BOOKING_SQL, BookingList, BookingRow } from "@/components/BookingList";
import { ErrorBanner } from "@/components/ErrorBanner";

const FILTERS: [string, string, string][] = [
  ["", "Tất cả", ""],
  ["open", "Đang xử lý", "and b.status in ('quoted','holding','deposit_reported')"],
  ["confirmed", "Đã chốt", "and b.status='confirmed'"],
  ["closed", "Đã huỷ / hết hạn", "and b.status in ('cancelled','expired')"],
];

export default async function BrokerBookings({ searchParams }: { searchParams: Promise<{ e?: string; s?: string }> }) {
  const uid = await requireUser();
  const { e, s = "" } = await searchParams;
  const f = FILTERS.find((x) => x[0] === s) ?? FILTERS[0];
  const rows = await withUser(uid, (q) => q<BookingRow>(`${BOOKING_SQL} where b.broker_id=$1 ${f[2]} order by b.created_at desc limit 200`, [uid]));
  const done = rows.filter((r) => r.status === "confirmed");
  return (
    <div className="space-y-4">
      <ErrorBanner e={e} />
      <h1 className="text-xl font-bold">Booking của tôi</h1>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={k ? `/broker/bookings?s=${k}` : "/broker/bookings"}
            className={`rounded-full px-3 py-1 text-sm ${k === f[0] ? "bg-teal-700 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{label}</Link>
        ))}
      </div>
      {done.length > 0 && <p className="text-sm text-slate-600">Lãi các booking đã chốt ở danh sách này: <b className="text-emerald-700">{vnd(done.reduce((t, r) => t + r.sell_total - r.net_total, 0))}</b></p>}
      <BookingList rows={rows} role="broker" back={`/broker/bookings${f[0] ? `?s=${f[0]}` : ""}`} />
    </div>
  );
}
