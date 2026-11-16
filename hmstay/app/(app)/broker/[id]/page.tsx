import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { createQuoteAction } from "@/lib/actions";
import { CopyButton } from "@/components/CopyButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { addDays, dmy, nightPrice, nightsBetween, priceStayWithSeasons, Season, validDate, vnd } from "@/lib/format";
import { AMENITY_LABEL, TYPE_LABEL } from "@/lib/property";

type Unit = { id: string; name: string; capacity: number; description: string | null; min_nights: number };
type Rate = { unit_id: string; broker_id: string | null; weekday_price: number; weekend_price: number; min_sell_price: number | null };
type SeasonRow = Season & { unit_id: string; name: string };
type P = { id: string; name: string; type: string; rental_mode: string; address: string | null; area: string | null; description: string | null;
  amenities: string[]; checkin_time: string; checkout_time: string; cancel_policy: string | null; house_rules: string | null;
  commission_note: string | null; owner_name: string; owner_phone: string | null };

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

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
    const [p] = await q<P>(
      `select p.id,p.name,p.type,p.rental_mode,p.address,p.area,p.description,p.amenities,p.checkin_time,p.checkout_time,p.cancel_policy,p.house_rules,
              l.commission_note, o.full_name owner_name, o.phone owner_phone
       from properties p join profiles o on o.id=p.owner_id
       join broker_links l on l.property_id=p.id and l.broker_id=$2 and l.status='active' where p.id=$1`, [id, uid]);
    if (!p) return null;
    const units = await q<Unit>("select id,name,capacity,description,min_nights from units where property_id=$1 and active order by created_at", [id]);
    const rates = await q<Rate>(
      "select r.unit_id, r.broker_id, r.weekday_price, r.weekend_price, r.min_sell_price from net_rates r join units u on u.id=r.unit_id where u.property_id=$1", [id]);
    const seasons = await q<SeasonRow>(
      `select s.unit_id, s.name, s.start_date, s.end_date, s.weekday_price, s.weekend_price from rate_seasons s join units u on u.id=s.unit_id
       where u.property_id=$1 and s.end_date >= current_date order by s.created_at`, [id]);
    const images = await q<{ storage_key: string }>("select storage_key from property_images where property_id=$1 order by sort_order, created_at", [id]);
    const free: Record<string, boolean> = {};
    if (dates) for (const u of units) {
      const busy = await q("select 1 from unit_busy_ranges($1,$2,$3) limit 1", [u.id, dates.a, dates.b]);
      free[u.id] = busy.length === 0;
    }
    return { p, units, rates, seasons, images, free };
  });
  if (!data) notFound();
  const { p, units, rates, seasons, images, free } = data;

  const share = [
    `${p.name} (${TYPE_LABEL[p.type]})`,
    p.address ? `Địa chỉ: ${p.address}` : "",
    p.description ?? "",
    p.amenities.length ? `Tiện nghi: ${p.amenities.map((a) => AMENITY_LABEL[a]).filter(Boolean).join(", ")}` : "",
    `Nhận phòng từ ${p.checkin_time}, trả phòng trước ${p.checkout_time}`,
    p.cancel_policy ? `Chính sách huỷ: ${p.cancel_policy}` : "",
    p.house_rules ? `Nội quy: ${p.house_rules}` : "",
  ].filter(Boolean).join("\n");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/broker/properties" className="text-sm text-teal-700 underline">← Cơ sở</Link>
        <h1 className="mt-1 text-xl font-bold">{p.name}</h1>
        <p className="text-sm text-slate-600">{TYPE_LABEL[p.type]}{p.area ? ` · ${p.area}` : ""}{p.address ? ` · ${p.address}` : ""} · Chủ: {p.owner_name}{p.owner_phone ? ` (${p.owner_phone})` : ""}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/broker/${id}/calendar`} className="btn-ghost">Lịch trống theo tháng</Link>
          <CopyButton text={share} label="Sao chép thông tin gửi khách" />
        </div>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl">
          {images.slice(0, 5).map((im, i) => (
            <a key={im.storage_key} href={`/api/img/${im.storage_key}`} target="_blank" rel="noreferrer" download
              className={i === 0 ? "col-span-2 row-span-2" : ""}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/img/${im.storage_key}`} alt="" className="h-full w-full object-cover" style={{ aspectRatio: i === 0 ? "1/1" : "4/3" }} />
            </a>
          ))}
        </div>
      )}
      {images.length > 5 && (
        <details className="text-sm"><summary className="cursor-pointer text-teal-700">Xem thêm {images.length - 5} ảnh</summary>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {images.slice(5).map((im) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={im.storage_key} href={`/api/img/${im.storage_key}`} target="_blank" rel="noreferrer"><img src={`/api/img/${im.storage_key}`} alt="" className="aspect-[4/3] w-full rounded object-cover" /></a>
            ))}
          </div>
        </details>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-3 md:col-span-2">
          {p.description && <p className="whitespace-pre-line text-sm text-slate-700">{p.description}</p>}
          {p.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{p.amenities.map((a) => AMENITY_LABEL[a] && <span key={a} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs text-teal-800">{AMENITY_LABEL[a]}</span>)}</div>
          )}
        </div>
        <div className="card space-y-2 text-sm">
          <p><b>Nhận phòng</b> từ {p.checkin_time} · <b>Trả phòng</b> trước {p.checkout_time}</p>
          {p.commission_note && <p className="text-teal-800"><b>Thoả thuận với chủ:</b> {p.commission_note}</p>}
          {p.cancel_policy && <p><b>Chính sách huỷ:</b> <span className="whitespace-pre-line text-slate-700">{p.cancel_policy}</span></p>}
          {p.house_rules && <p><b>Nội quy:</b> <span className="whitespace-pre-line text-slate-700">{p.house_rules}</span></p>}
        </div>
      </section>

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
          const us = seasons.filter((s) => s.unit_id === u.id);
          const net = dates && r ? priceStayWithSeasons(dates.a, dates.b, r, us) : null;
          const isFree = free[u.id];
          const short = dates && dates.n < u.min_nights;
          return (
            <li key={u.id} id={`u-${u.id}`} className="card scroll-mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{u.name} <span className="text-sm font-normal text-slate-500">· {u.capacity} khách{u.min_nights > 1 ? ` · tối thiểu ${u.min_nights} đêm` : ""}</span></p>
                {dates && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isFree ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{isFree ? "Còn trống" : "Đã kín"}</span>}
              </div>
              {u.description && <p className="mt-1 text-sm text-slate-600">{u.description}</p>}
              <p className="mt-1 text-sm text-slate-600">
                {r ? <>Giá net: T2–T5, CN {vnd(r.weekday_price)} · T6–T7 {vnd(r.weekend_price)}{r.min_sell_price ? ` · giá sàn ${vnd(r.min_sell_price)}/đêm` : ""}</> : "Chủ chưa đặt giá net."}
              </p>
              {us.length > 0 && (
                <ul className="mt-1 text-xs text-amber-800">
                  {us.map((s, i) => <li key={i}>{s.name || "Giá mùa"} {dmy(s.start_date)}–{dmy(s.end_date)}: {vnd(s.weekday_price)} / {vnd(s.weekend_price)} (T6–T7)</li>)}
                </ul>
              )}
              {short && <p className="mt-2 text-sm text-red-700">Phòng này yêu cầu tối thiểu {u.min_nights} đêm.</p>}
              {dates && r && isFree && !short && net !== null && (
                <form action={createQuoteAction} className="mt-3 grid items-end gap-2 sm:grid-cols-6">
                  <input type="hidden" name="property_id" value={id} /><input type="hidden" name="unit_id" value={u.id} />
                  <input type="hidden" name="check_in" value={dates.a} /><input type="hidden" name="check_out" value={dates.b} />
                  <div className="sm:col-span-6">
                    <p className="text-sm">{dates.n} đêm · Tổng giá net: <b>{vnd(net)}</b></p>
                    <details className="text-xs text-slate-500"><summary className="cursor-pointer">Giá từng đêm</summary>
                      <ul className="mt-1 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                        {Array.from({ length: dates.n }, (_, i) => addDays(dates.a, i)).map((d) => (
                          <li key={d}>{WD[new Date(d + "T00:00:00Z").getUTCDay()]} {dmy(d).slice(0, 5)}: {vnd(nightPrice(d, r, us))}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                  <div className="sm:col-span-2"><label className="label">Tên khách</label><input className="input" name="guest_name" required /></div>
                  <div><label className="label">SĐT khách</label><input className="input" name="guest_phone" /></div>
                  <div><label className="label">Số khách</label><input className="input" name="guests" type="number" min={1} max={u.capacity} /></div>
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
