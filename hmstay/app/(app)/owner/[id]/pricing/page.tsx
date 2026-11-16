import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { deleteSeasonAction, saveRateAction, saveSeasonAction } from "@/lib/actions";
import { dmy, vnd } from "@/lib/format";
import { ErrorBanner } from "@/components/ErrorBanner";

type Unit = { id: string; name: string; min_nights: number };
type Rate = { id: string; unit_id: string; broker_id: string | null; broker_name: string | null; weekday_price: number; weekend_price: number; min_sell_price: number | null };
type Season = { id: string; unit_id: string; name: string; start_date: string; end_date: string; weekday_price: number; weekend_price: number };

export default async function PricingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { e } = await searchParams;
  const d = await withUser(uid, async (q) => {
    const [p] = await q("select 1 from properties where id=$1 and owner_id=$2", [id, uid]);
    if (!p) return null;
    return {
      units: await q<Unit>("select id,name,min_nights from units where property_id=$1 and active order by created_at", [id]),
      rates: await q<Rate>(
        `select r.id, r.unit_id, r.broker_id, pr.full_name broker_name, r.weekday_price, r.weekend_price, r.min_sell_price
         from net_rates r join units u on u.id=r.unit_id left join profiles pr on pr.id=r.broker_id
         where u.property_id=$1 order by r.broker_id nulls first`, [id]),
      seasons: await q<Season>(
        `select s.id, s.unit_id, s.name, s.start_date, s.end_date, s.weekday_price, s.weekend_price
         from rate_seasons s join units u on u.id=s.unit_id where u.property_id=$1 and s.end_date >= current_date - 30
         order by s.start_date, s.created_at`, [id]),
      brokers: await q<{ broker_id: string; full_name: string }>(
        `select l.broker_id, pr.full_name from broker_links l join profiles pr on pr.id=l.broker_id
         where l.property_id=$1 and l.status='active' order by pr.full_name`, [id]),
    };
  });
  if (!d) notFound();
  const { units, rates, seasons, brokers } = d;
  const unitName = (uid2: string) => units.find((u) => u.id === uid2)?.name ?? "";

  return (
    <div className="space-y-10">
      <ErrorBanner e={e} />
      <section>
        <h2 className="mb-1 text-lg font-semibold">Giá net mặc định</h2>
        <p className="mb-3 text-sm text-slate-600">Giá chủ nhận. Broker tự cộng lãi để bán cho khách. Đêm thứ 6 và thứ 7 tính giá cuối tuần. Có thể đặt giá riêng cho từng broker và giá sàn (broker không được bán thấp hơn).</p>
        {units.length === 0 && <p className="text-sm text-amber-700">Chưa có phòng đang bán. Thêm phòng ở tab “Phòng”.</p>}
        <div className="space-y-4">
          {units.map((u) => {
            const ur = rates.filter((r) => r.unit_id === u.id);
            return (
              <div key={u.id} className="card">
                <p className="font-semibold">{u.name} {u.min_nights > 1 && <span className="text-sm font-normal text-slate-500">· tối thiểu {u.min_nights} đêm</span>}</p>
                <ul className="my-2 space-y-1 text-sm">
                  {ur.length === 0 && <li className="text-amber-700">Chưa có giá net — broker chưa báo giá được.</li>}
                  {ur.map((r) => (
                    <li key={r.id}>
                      <b>{r.broker_name ? `Riêng ${r.broker_name}` : "Mặc định (mọi broker)"}</b>: T2–T5, CN {vnd(r.weekday_price)} · T6–T7 {vnd(r.weekend_price)}
                      {r.min_sell_price ? ` · sàn ${vnd(r.min_sell_price)}/đêm` : ""}
                    </li>
                  ))}
                </ul>
                <form action={saveRateAction} className="grid items-end gap-2 sm:grid-cols-5">
                  <input type="hidden" name="property_id" value={id} /><input type="hidden" name="unit_id" value={u.id} />
                  <div><label className="label">Áp dụng cho</label>
                    <select className="input" name="broker_id"><option value="">Mặc định</option>
                      {brokers.map((b) => <option key={b.broker_id} value={b.broker_id}>{b.full_name}</option>)}</select></div>
                  <div><label className="label">Net T2–T5, CN</label><input className="input" name="weekday" inputMode="numeric" required /></div>
                  <div><label className="label">Net T6–T7</label><input className="input" name="weekend" inputMode="numeric" /></div>
                  <div><label className="label">Sàn/đêm (tuỳ chọn)</label><input className="input" name="min_sell" inputMode="numeric" /></div>
                  <button className="btn">Lưu giá</button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Giá theo mùa / ngày lễ</h2>
        <p className="mb-3 text-sm text-slate-600">Đêm nào nằm trong khoảng ngày bên dưới thì dùng giá mùa thay cho giá mặc định (áp dụng cho mọi broker). Nhiều mùa chồng nhau thì mùa tạo sau được ưu tiên.</p>
        {units.length > 0 && (
          <form action={saveSeasonAction} className="card mb-4 grid items-end gap-2 sm:grid-cols-6">
            <input type="hidden" name="property_id" value={id} />
            <div className="sm:col-span-2"><label className="label">Tên mùa</label><input className="input" name="name" placeholder="VD: Tết, 30/4, Hè" /></div>
            <div className="sm:col-span-2"><label className="label">Áp dụng cho</label>
              <select className="input" name="unit_id"><option value="all">Tất cả phòng</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label className="label">Từ ngày</label><input className="input" type="date" name="start_date" required /></div>
            <div><label className="label">Đến hết ngày</label><input className="input" type="date" name="end_date" required /></div>
            <div className="sm:col-span-2"><label className="label">Net T2–T5, CN</label><input className="input" name="weekday" inputMode="numeric" required /></div>
            <div className="sm:col-span-2"><label className="label">Net T6–T7</label><input className="input" name="weekend" inputMode="numeric" /></div>
            <button className="btn sm:col-span-2">Thêm mùa</button>
          </form>
        )}
        {seasons.length === 0 ? <p className="text-sm text-slate-500">Chưa có giá theo mùa.</p> : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>
                <th className="px-3 py-2">Mùa</th><th className="px-3 py-2">Phòng</th><th className="px-3 py-2">Thời gian</th><th className="px-3 py-2">T2–T5, CN</th><th className="px-3 py-2">T6–T7</th><th /></tr></thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{s.name || "—"}</td><td className="px-3 py-2">{unitName(s.unit_id)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dmy(s.start_date)} → {dmy(s.end_date)}</td>
                    <td className="px-3 py-2">{vnd(s.weekday_price)}</td><td className="px-3 py-2">{vnd(s.weekend_price)}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteSeasonAction}><input type="hidden" name="property_id" value={id} /><input type="hidden" name="season_id" value={s.id} />
                        <button className="text-xs text-red-700 underline">Xoá</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
