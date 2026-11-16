import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { BOOKING_SQL, BookingList, BookingRow } from "@/components/BookingList";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function OwnerBookings({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { e } = await searchParams;
  const rows = await withUser(uid, (q) => q<BookingRow>(
    `${BOOKING_SQL} where p.owner_id=$1
     order by (b.status in ('holding','deposit_reported')) desc, b.check_in desc limit 200`, [uid]));
  const wait = rows.filter((r) => ["holding", "deposit_reported"].includes(r.status));
  const rest = rows.filter((r) => !wait.includes(r));
  return (
    <div className="space-y-6">
      <ErrorBanner e={e} />
      <h1 className="text-xl font-bold">Booking chờ chốt ({wait.length})</h1>
      <BookingList rows={wait} role="owner" back="/owner/bookings" />
      <h2 className="text-lg font-semibold">Các booking khác</h2>
      <BookingList rows={rest} role="owner" back="/owner/bookings" />
    </div>
  );
}
