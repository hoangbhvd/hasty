import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { parseMonth } from "@/lib/calendar";
import { dmy, vnd } from "@/lib/format";
import { brokerMonthStats } from "@/lib/stats";
import { CalendarNav } from "@/components/CalendarGrid";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Stat } from "@/components/Stat";

type Task = { id: string; guest_name: string; status: string; check_in: string; check_out: string; sell_total: number; unit_name: string; property_name: string; secs_left: number | null };

export default async function BrokerHome({ searchParams }: { searchParams: Promise<{ e?: string; m?: string }> }) {
  const uid = await requireUser();
  const { e, m: mq } = await searchParams;
  const m = parseMonth(mq);
  const d = await withUser(uid, async (q) => ({
    stats: await brokerMonthStats(q, uid, m.start, m.endExclusive),
    tasks: await q<Task>(
      `select b.id, b.guest_name, b.status, b.check_in, b.check_out, b.sell_total, u.name unit_name, p.name property_name, floor(extract(epoch from (b.hold_expires_at - now())))::int secs_left
       from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id
       where b.broker_id=$1 and b.status in ('quoted','holding','deposit_reported')
       order by (b.status='holding') desc, b.hold_expires_at nulls last, b.check_in limit 12`, [uid]),
    partners: await q<{ id: string; name: string; area: string | null; owner_name: string }>(
      `select p.id, p.name, p.area, o.full_name owner_name from properties p join profiles o on o.id=p.owner_id
       join broker_links l on l.property_id=p.id and l.broker_id=$1 and l.status='active' order by p.name`, [uid]),
    pendingLinks: (await q<{ c: number }>("select count(*)::int c from broker_links where broker_id=$1 and status='pending'", [uid]))[0].c,
    upcoming: await q<{ id: string; guest_name: string; check_in: string; check_out: string; unit_name: string; property_name: string }>(
      `select b.id, b.guest_name, b.check_in, b.check_out, u.name unit_name, p.name property_name
       from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id
       where b.broker_id=$1 and b.status='confirmed' and b.check_in >= current_date and b.check_in <= current_date + 14 order by b.check_in`, [uid]),
  }));
  const { stats, tasks, partners, pendingLinks, upcoming } = d;
  const label: Record<string, string> = { quoted: "Báo giá — chờ khách đồng ý", holding: "Đang giữ chỗ — cần báo cọc", deposit_reported: "Đã báo cọc — chờ chủ chốt" };

  return (
    <div className="space-y-8">
      <ErrorBanner e={e} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Tổng quan</h1>
        <CalendarNav base="/broker" m={m} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Lãi đã chốt – ${m.label}`} value={vnd(stats.confirmed_profit)} sub={`${stats.confirmed} booking · doanh số ${vnd(stats.confirmed_sell)}`} tone="good" />
        <Stat label="Lãi dự kiến (đang chờ)" value={vnd(stats.pending_profit)} sub={`${stats.pending} booking giữ chỗ / chờ chốt`} />
        <Stat label="Cơ sở đang hợp tác" value={partners.length} sub={pendingLinks ? `${pendingLinks} yêu cầu chờ duyệt` : undefined} />
        <Stat label="Khách đến 14 ngày tới" value={upcoming.length} />
      </div>

      <form action="/broker/search" className="card flex flex-wrap items-end gap-3">
        <div className="w-full text-sm font-semibold">Tìm phòng trống nhanh</div>
        <div><label className="label">Nhận phòng</label><input className="input" type="date" name="in" required /></div>
        <div><label className="label">Trả phòng</label><input className="input" type="date" name="out" required /></div>
        <div><label className="label">Số khách</label><input className="input w-24" type="number" name="guests" min={1} defaultValue={2} /></div>
        <button className="btn">Tìm trên mọi cơ sở</button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-semibold">Việc cần làm ({tasks.length})</h2>
          {tasks.length === 0 ? <p className="text-sm text-slate-500">Không có booking nào đang chờ.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {tasks.map((t) => {
                const left = t.secs_left === null ? null : t.secs_left * 1000;
                const urgent = left !== null && left < 3 * 3600_000;
                return (
                  <li key={t.id} className="py-2">
                    <p><b>{t.guest_name}</b> · {t.property_name} – {t.unit_name}</p>
                    <p className="text-xs text-slate-500">{dmy(t.check_in)} → {dmy(t.check_out)} · {vnd(t.sell_total)}</p>
                    <p className={`text-xs ${urgent ? "font-semibold text-red-700" : "text-amber-700"}`}>
                      {label[t.status]}{left !== null && t.status === "holding" && (left > 0 ? ` · còn ${Math.floor(left / 3600_000)}g${String(Math.floor((left % 3600_000) / 60_000)).padStart(2, "0")}` : " · sắp hết hạn")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/broker/bookings" className="mt-3 inline-block text-sm text-teal-700 underline">Xử lý ở “Booking của tôi”</Link>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Khách sắp đến (14 ngày)</h2>
          {upcoming.length === 0 ? <p className="text-sm text-slate-500">Chưa có khách đã chốt sắp đến.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {upcoming.map((u) => <li key={u.id} className="py-2"><b>{u.guest_name}</b> · {dmy(u.check_in)} → {dmy(u.check_out)}<br /><span className="text-xs text-slate-500">{u.property_name} – {u.unit_name}</span></li>)}
            </ul>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Cơ sở của tôi</h2><Link href="/broker/properties" className="text-sm text-teal-700 underline">Tìm thêm cơ sở để hợp tác</Link></div>
        {partners.length === 0 ? <p className="text-sm text-slate-500">Bạn chưa hợp tác với cơ sở nào. Vào “Cơ sở” để xin hợp tác với chủ.</p> : (
          <ul className="flex flex-wrap gap-2">
            {partners.map((p) => <li key={p.id}><Link href={`/broker/${p.id}`} className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-teal-600"><b>{p.name}</b><span className="text-slate-500">{p.area ? ` · ${p.area}` : ""} · {p.owner_name}</span></Link></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
