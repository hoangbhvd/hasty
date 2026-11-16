import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { blockDatesAction, createDirectBookingAction } from "@/lib/actions";
import { parseMonth } from "@/lib/calendar";
import { vnd } from "@/lib/format";
import { ownerMonthStats, ownerStays } from "@/lib/stats";
import { BOOKING_SQL, BookingList, BookingRow } from "@/components/BookingList";
import { CalendarNav } from "@/components/CalendarGrid";
import { ErrorBanner } from "@/components/ErrorBanner";
import { delta, pct, Stat } from "@/components/Stat";

export default async function OwnerProperty({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; m?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { e, m: mq } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const m = parseMonth(mq);
  const prevM = parseMonth(m.prev);

  const data = await withUser(uid, async (q) => {
    const units = await q<{ id: string; name: string }>("select id,name from units where property_id=$1 and active order by created_at", [id]);
    return {
      units,
      cur: await ownerMonthStats(q, uid, id, m.start, m.endExclusive),
      prev: await ownerMonthStats(q, uid, id, prevM.start, prevM.endExclusive),
      stays: await ownerStays(q, uid, id),
      pending: await q<BookingRow>(`${BOOKING_SQL} where u.property_id=$1 and b.status in ('holding','deposit_reported') order by b.hold_expires_at nulls first, b.check_in`, [id]),
      bookings: await q<BookingRow>(`${BOOKING_SQL} where p.id=$1 and b.status='confirmed' and b.check_out >= current_date order by b.check_in`, [id]),
    };
  });
  const { units, cur, prev, stays, pending, bookings } = data;
  const back = `/owner/${id}`;

  return (
    <div className="space-y-8">
      <ErrorBanner e={e} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Số liệu {m.label}</h2>
        <CalendarNav base={back} m={m} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Doanh thu (net)" value={vnd(cur.revenue)} sub={delta(cur.revenue, prev.revenue)} tone="good" />
        <Stat label="Tỷ lệ lấp đầy" value={pct(cur.occupancy)} sub={`${cur.nights_booked}/${cur.nights_available} đêm-phòng`} />
        <Stat label="Booking đã chốt" value={cur.bookings} sub={delta(cur.bookings, prev.bookings)} />
        <Stat label="Hôm nay" value={`${stays.arrivals.length} đến · ${stays.departures.length} đi`} sub={`${stays.inhouse} phòng đang có khách`} />
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-amber-800">Chờ bạn xử lý ({pending.length})</h2>
          <BookingList rows={pending} role="owner" back={back} />
        </section>
      )}

      <section id="tao-booking" className="card scroll-mt-4">
        <h2 className="mb-1 font-semibold">Tạo booking cho khách của tôi</h2>
        <p className="mb-3 text-xs text-slate-500">Booking vào thẳng trạng thái Đã chốt và giữ phòng cho các đêm đã chọn. Sau khi tạo, bạn được chuyển sang trang xác nhận để lưu PDF.</p>
        {units.length === 0 ? (
          <p className="text-sm text-amber-700">Cơ sở chưa có phòng đang bán. Thêm phòng ở tab “Phòng” trước.</p>
        ) : (
          <form action={createDirectBookingAction} className="grid items-end gap-2 sm:grid-cols-6">
            <input type="hidden" name="property_id" value={id} />
            <div className="sm:col-span-3"><label className="label">Phòng</label>
              <select className="input" name="unit_id" required>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label className="label">Nhận phòng</label><input className="input" type="date" name="check_in" required /></div>
            <div><label className="label">Trả phòng</label><input className="input" type="date" name="check_out" required /></div>
            <div><label className="label">Số khách</label><input className="input" name="guests" type="number" min={1} /></div>
            <div className="sm:col-span-3"><label className="label">Tên khách</label><input className="input" name="guest_name" required /></div>
            <div className="sm:col-span-3"><label className="label">SĐT khách</label><input className="input" name="guest_phone" /></div>
            <div className="sm:col-span-3"><label className="label">Tổng tiền (VND)</label><input className="input" name="price" inputMode="numeric" required /></div>
            <div className="sm:col-span-3"><label className="label">Đã cọc (VND)</label><input className="input" name="deposit" inputMode="numeric" /></div>
            <div className="sm:col-span-6"><label className="label">Ghi chú (hiện trong xác nhận)</label><input className="input" name="note" /></div>
            <button className="btn sm:col-span-6 sm:w-fit">Tạo booking &amp; xem xác nhận</button>
          </form>
        )}
        {units.length > 0 && (
          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm text-slate-600">Khoá lịch (bảo trì / khách ngoài hệ thống)</summary>
            <form action={blockDatesAction} className="mt-2 grid items-end gap-2 sm:grid-cols-6">
              <input type="hidden" name="property_id" value={id} />
              <div className="sm:col-span-2"><label className="label">Phòng</label>
                <select className="input" name="unit_id">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              <div><label className="label">Nhận phòng</label><input className="input" type="date" name="check_in" required /></div>
              <div><label className="label">Trả phòng</label><input className="input" type="date" name="check_out" required /></div>
              <div><label className="label">Lý do</label><input className="input" name="guest_name" placeholder="Bảo trì..." /></div>
              <button className="btn-ghost">Khoá</button>
            </form>
          </details>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Lịch sắp tới ({bookings.length})</h2>
        <BookingList rows={bookings} role="owner" back={back} />
      </section>
    </div>
  );
}
