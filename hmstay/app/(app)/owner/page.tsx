import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { createPropertyAction } from "@/lib/actions";
import { parseMonth } from "@/lib/calendar";
import { dmy, vnd } from "@/lib/format";
import { MODE_LABEL, TYPE_LABEL } from "@/lib/property";
import { ownerMonthStats, ownerStays, StayRow } from "@/lib/stats";
import { CalendarNav } from "@/components/CalendarGrid";
import { ErrorBanner } from "@/components/ErrorBanner";
import { delta, pct, Stat } from "@/components/Stat";

type Prop = { id: string; name: string; type: string; rental_mode: string; area: string | null; image: string | null; units: number; brokers: number; pending: number };

function StayList({ rows, empty, showDate }: { rows: StayRow[]; empty: string; showDate?: boolean }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
          <span><b>{r.guest_name}</b>{r.guests ? ` · ${r.guests} khách` : ""}{r.guest_phone ? ` · ${r.guest_phone}` : ""}</span>
          <span className="text-slate-500">{showDate && `${dmy(r.check_in)} · `}{r.property_name} – {r.unit_name}{r.broker_name ? ` · ${r.broker_name}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function OwnerHome({ searchParams }: { searchParams: Promise<{ e?: string; m?: string }> }) {
  const uid = await requireUser();
  const { e, m: mq } = await searchParams;
  const m = parseMonth(mq);
  const prevM = parseMonth(m.prev);

  const d = await withUser(uid, async (q) => {
    const props = await q<Prop>(
      `select p.id, p.name, p.type, p.rental_mode, p.area,
              (select storage_key from property_images i where i.property_id=p.id order by sort_order, created_at limit 1) image,
              (select count(*)::int from units u where u.property_id=p.id and u.active) units,
              (select count(*)::int from broker_links l where l.property_id=p.id and l.status='active') brokers,
              (select count(*)::int from bookings b join units u on u.id=b.unit_id where u.property_id=p.id and b.status in ('holding','deposit_reported')) pending
       from properties p where p.owner_id=$1 order by p.created_at desc`, [uid]);
    const pendingLinks = (await q<{ c: number }>(
      `select count(*)::int c from broker_links l join properties p on p.id=l.property_id where p.owner_id=$1 and l.status='pending'`, [uid]))[0].c;
    const all = await ownerMonthStats(q, uid, null, m.start, m.endExclusive);
    const prev = await ownerMonthStats(q, uid, null, prevM.start, prevM.endExclusive);
    const per: Record<string, Awaited<ReturnType<typeof ownerMonthStats>>> = {};
    for (const p of props) per[p.id] = await ownerMonthStats(q, uid, p.id, m.start, m.endExclusive);
    const stays = await ownerStays(q, uid, null);
    // Booking đang chờ chủ xử lý, gấp nhất lên đầu
    const todo = await q<{ id: string; guest_name: string; status: string; check_in: string; check_out: string; unit_name: string; property_name: string; broker_name: string | null; hold_expires_at: string | null }>(
      `select b.id, b.guest_name, b.status, b.check_in, b.check_out, u.name unit_name, p.name property_name, pr.full_name broker_name, b.hold_expires_at
       from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id left join profiles pr on pr.id=b.broker_id
       where p.owner_id=$1 and b.status in ('holding','deposit_reported') order by b.hold_expires_at nulls first, b.check_in limit 8`, [uid]);
    return { props, pendingLinks, all, prev, per, stays, todo };
  });
  const { props, pendingLinks, all, prev, per, stays, todo } = d;

  return (
    <div className="space-y-8">
      <ErrorBanner e={e} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Tổng quan</h1>
        <CalendarNav base="/owner" m={m} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Doanh thu (net) – ${m.label}`} value={vnd(all.revenue)} sub={delta(all.revenue, prev.revenue)} tone="good" />
        <Stat label="Tỷ lệ lấp đầy" value={pct(all.occupancy)} sub={`${all.nights_booked}/${all.nights_available} đêm-phòng · ${all.units} phòng`} />
        <Stat label="Booking đã chốt trong tháng" value={all.bookings} sub={delta(all.bookings, prev.bookings)} />
        <Stat label="Đang ở hôm nay" value={stays.inhouse} sub={`${stays.arrivals.length} đến · ${stays.departures.length} đi`} />
      </div>

      {(todo.length > 0 || pendingLinks > 0) && (
        <section className="card border-amber-300 bg-amber-50">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-amber-900">Việc cần làm</h2>
            <Link href="/owner/bookings" className="text-sm text-amber-900 underline">Tất cả booking</Link>
          </div>
          {pendingLinks > 0 && <p className="mb-2 text-sm text-amber-900">{pendingLinks} broker xin hợp tác — vào cơ sở → tab “Broker” để duyệt.</p>}
          <ul className="divide-y divide-amber-200 text-sm">
            {todo.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                <span><b>{b.guest_name}</b> · {b.property_name} – {b.unit_name} · {dmy(b.check_in)} → {dmy(b.check_out)}{b.broker_name ? ` · ${b.broker_name}` : ""}</span>
                <span className="text-amber-900">{b.status === "deposit_reported" ? "Broker báo đã cọc – chờ chốt" : "Đang giữ chỗ"}{b.hold_expires_at ? ` đến ${new Date(b.hold_expires_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card"><h2 className="mb-2 font-semibold">Hôm nay</h2>
          <p className="mb-1 text-xs font-medium uppercase text-slate-500">Khách đến ({stays.arrivals.length})</p>
          <StayList rows={stays.arrivals} empty="Không có khách đến." />
          <p className="mb-1 mt-3 text-xs font-medium uppercase text-slate-500">Khách trả phòng ({stays.departures.length})</p>
          <StayList rows={stays.departures} empty="Không có khách trả phòng." />
        </section>
        <section className="card"><h2 className="mb-2 font-semibold">Sắp đến trong 7 ngày ({stays.upcoming.length})</h2>
          <StayList rows={stays.upcoming} empty="Chưa có khách đến trong 7 ngày tới." showDate />
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Cơ sở của tôi ({props.length})</h2>
        {props.length === 0 ? <p className="text-sm text-slate-500">Bạn chưa có cơ sở nào. Thêm ở bên dưới.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {props.map((p) => {
              const s = per[p.id];
              return (
                <li key={p.id}>
                  <Link href={`/owner/${p.id}`} className="card flex gap-3 hover:border-teal-600">
                    {p.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/img/${p.image}`} alt="" className="h-24 w-28 shrink-0 rounded object-cover" />
                      : <div className="grid h-24 w-28 shrink-0 place-items-center rounded bg-slate-100 text-xs text-slate-400">Chưa có ảnh</div>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-slate-500">{TYPE_LABEL[p.type]} · {MODE_LABEL[p.rental_mode]}{p.area ? ` · ${p.area}` : ""}</p>
                      <p className="mt-1 text-sm text-slate-700">{p.units} phòng · {p.brokers} broker</p>
                      <p className="text-sm text-slate-700">Lấp đầy {pct(s.occupancy)} · {vnd(s.revenue)}</p>
                      {p.pending > 0 && <p className="mt-1 text-xs font-medium text-amber-700">{p.pending} booking chờ xử lý</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="card" open={props.length === 0}>
        <summary className="cursor-pointer font-semibold">+ Thêm cơ sở mới</summary>
        <form action={createPropertyAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="label">Tên</label><input className="input" name="name" required /></div>
          <div><label className="label">Địa chỉ</label><input className="input" name="address" /></div>
          <div><label className="label">Loại</label>
            <select className="input" name="type"><option value="homestay">Homestay</option><option value="hotel">Khách sạn nhỏ</option></select></div>
          <div><label className="label">Cách bán</label>
            <select className="input" name="rental_mode"><option value="room">Theo từng phòng</option><option value="whole">Nguyên căn</option></select></div>
          <div><label className="label">Sức chứa (nếu nguyên căn)</label><input className="input" name="capacity" type="number" min={1} defaultValue={4} /></div>
          <div className="sm:col-span-2"><label className="label">Mô tả</label><textarea className="input" name="description" rows={2} /></div>
          <div className="sm:col-span-2"><button className="btn">Tạo cơ sở</button><span className="ml-3 text-xs text-slate-500">Sau khi tạo, bổ sung ảnh, tiện nghi, giá ở các tab của cơ sở.</span></div>
        </form>
      </details>
    </div>
  );
}
