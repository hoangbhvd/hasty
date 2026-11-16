import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { BOOKING_SQL, BookingList, BookingRow } from "@/components/BookingList";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function BrokerBookings({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { e } = await searchParams;
  const rows = await withUser(uid, (q) => q<BookingRow>(`${BOOKING_SQL} where b.broker_id=$1 order by b.created_at desc limit 200`, [uid]));
  const profit = rows.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.sell_total - r.net_total, 0);
  return (
    <div className="space-y-4">
      <ErrorBanner e={e} />
      <h1 className="text-xl font-bold">Booking của tôi</h1>
      <p className="text-sm text-slate-600">Lãi các booking đã chốt: <b className="text-emerald-700">{new Intl.NumberFormat("vi-VN").format(profit)}đ</b></p>
      <BookingList rows={rows} role="broker" back="/broker/bookings" />
    </div>
  );
}
