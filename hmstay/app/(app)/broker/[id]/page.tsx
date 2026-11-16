import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { createQuoteAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";
import { nightsBetween, priceStay, validDate, vnd } from "@/lib/format";

type Unit = { id: string; name: string; capacity: number };
type Rate = { unit_id: string; broker_id: string | null; weekday_price: number; weekend_price: number; min_sell_price: number | null };

export default async function BrokerProperty({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; in?: string; out?: string }>;
}) {
  const uid = await requireUser();
  const { id } = await params;
  const { e, in: ci, out: co } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const dates = validDate(ci) && validDate(co) && nightsBetween(ci, co) >= 1 ? { a: ci, b: co, n: nightsBetween(ci, co) } : null;

  const data = await withUser(uid, async (q) => {
    // Chỉ broker đã được duyệt mới vào được (RLS cũng chặn units)
    const [p] = await q<{ id: string; name: string; address: string | null; description: string | null; commission_note: string | null }>(
      `select p.id,p.name,p.address,p.description,l.commission_note from properties p
       join broker_links l on l.property_id=p.id and l.broker_id=$2 and l.status='active' where p.id=$1`, [id, uid]);
    if (!p) return null;
    const units = await q<Unit>("select id,name,capacity from units where property_id=$1 and active order by created_at", [id]);
    const rates = await q<Rate>(
      "select r.unit_id, r.broker_id, r.weekday_price, r.weekend_price, r.min_sell_price from net_rates r join units u on u.id=r.unit_id where u.property_id=$1", [id]);
    const images = await q<{ storage_key: string }>("select storage_key from property_images where property_id=$1 order by sort_order, created_at", [id]);
    const free: Record<string, boolean> = {};
    if (dates) for (const u of units) {
      const busy = await q("select 1 from unit_busy_ranges($1,$2,$3) limit 1", [u.id, dates.a, dates.b]);
      free[u.id] = busy.length === 0;
    }
    return { p, units, rates, images, free };
  });
  if (!data) notFound();
  const { p, units, rates, images, free } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{p.name}</h1>
        <p className="text-sm text-slate-600">{p.address}</p>
        <Link href={`/broker/${id}/calendar`} className="btn-ghost mt-2">Xem lịch trống theo tháng</Link>
        {p.commission_note && <p className="mt-1 text-sm text-teal-800">Thoả thuận với chủ: {p.commission_note}</p>}
        {p.description && <p className="mt-2 text-sm text-slate-700">{p.description}</p>}
      </div>
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((im) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={im.storage_key} src={`/api/img/${im.storage_key}`} alt="" className="h-40 w-auto rounded-lg object-cover" />
          ))}
        </div>
      )}
      <ErrorBanner e={e} />
      <form className="card flex flex-wrap items-end gap-3" method="get">
        <div><label className="label">Nhận phòng</label><input className="input" type="date" name="in" defaultValue={ci} required /></div>
        <div><label className="label">Trả phòng</label><input className="input" type="date" name="out" defaultValue={co} required /></div>
        <button className="btn">Kiểm tra tình trạng phòng</button>
      </form>

      {!dates && ci && <p className="text-sm text-red-700">Ngày trả phòng phải sau ngày nhận phòng.</p>}
      <ul className="space-y-3">
        {units.map((u) => {
          const r = rates.find((x) => x.unit_id === u.id && x.broker_id === uid) ?? rates.find((x) => x.unit_id === u.id && x.broker_id === null);
          const net = dates && r ? priceStay(dates.a, dates.b, r.weekday_price, r.weekend_price) : null;
          const isFree = free[u.id];
          return (
            <li key={u.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{u.name} <span className="text-sm font-normal text-slate-500">· {u.capacity} khách</span></p>
                {dates && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isFree ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{isFree ? "Còn trống" : "Đã kín"}</span>}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {r ? <>Giá net: T2–T5/CN {vnd(r.weekday_price)} · T6–T7 {vnd(r.weekend_price)}{r.min_sell_price ? ` · giá sàn ${vnd(r.min_sell_price)}/đêm` : ""}</> : "Chủ chưa đặt giá net."}
              </p>
              {dates && r && isFree && net !== null && (
                <form action={createQuoteAction} className="mt-3 grid items-end gap-2 sm:grid-cols-6">
                  <input type="hidden" name="property_id" value={id} /><input type="hidden" name="unit_id" value={u.id} />
                  <input type="hidden" name="check_in" value={dates.a} /><input type="hidden" name="check_out" value={dates.b} />
                  <p className="text-sm sm:col-span-6">{dates.n} đêm · Tổng giá net: <b>{vnd(net)}</b></p>
                  <div className="sm:col-span-2"><label className="label">Tên khách</label><input className="input" name="guest_name" required /></div>
                  <div><label className="label">SĐT khách</label><input className="input" name="guest_phone" /></div>
                  <div><label className="label">Số khách</label><input className="input" name="guests" type="number" min={1} /></div>
                  <div><label className="label">Giá bán cho khách (tổng)</label><input className="input" name="sell_total" inputMode="numeric" defaultValue={net} required /></div>
                  <div><label className="label">Tiền cọc dự kiến</label><input className="input" name="deposit" inputMode="numeric" /></div>
                  <button className="btn sm:col-span-6 sm:w-fit">Tạo báo giá</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
