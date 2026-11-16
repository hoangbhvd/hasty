import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { nightsBetween, priceStayWithSeasons, Season, validDate, vnd } from "@/lib/format";
import { AMENITY_LABEL, TYPE_LABEL } from "@/lib/property";

type Hit = { unit_id: string; unit_name: string; capacity: number; min_nights: number; description: string | null;
  pid: string; pname: string; area: string | null; address: string | null; type: string; amenities: string[]; image: string | null };
type Rate = { unit_id: string; broker_id: string | null; weekday_price: number; weekend_price: number };
type SeasonRow = Season & { unit_id: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ in?: string; out?: string; guests?: string; area?: string; type?: string }> }) {
  const uid = await requireUser();
  const { in: ci, out: co, guests, area = "", type = "" } = await searchParams;
  const ok = validDate(ci) && validDate(co) && nightsBetween(ci, co) >= 1;
  const n = ok ? nightsBetween(ci, co) : 0;
  const g = Math.max(1, Number(guests) || 1);

  const data = ok ? await withUser(uid, async (q) => {
    const hits = await q<Hit>(
      `select u.id unit_id, u.name unit_name, u.capacity, u.min_nights, u.description,
              p.id pid, p.name pname, p.area, p.address, p.type, p.amenities,
              (select storage_key from property_images i where i.property_id=p.id order by sort_order, created_at limit 1) image
       from units u join properties p on p.id=u.property_id
       join broker_links l on l.property_id=p.id and l.broker_id=$1 and l.status='active'
       where u.active and p.owner_id <> $1 and u.capacity >= $4 and u.min_nights <= $5
         and ($6 = '' or p.area ilike '%' || $6 || '%' or p.address ilike '%' || $6 || '%' or p.name ilike '%' || $6 || '%')
         and ($7 = '' or p.type::text = $7)
         and not exists (select 1 from unit_busy_ranges(u.id, $2::date, $3::date))
       order by p.name, u.created_at`, [uid, ci, co, g, n, area, type === "hotel" || type === "homestay" ? type : ""]);
    const ids = hits.map((h) => h.unit_id);
    const rates = ids.length ? await q<Rate>("select unit_id, broker_id, weekday_price, weekend_price from net_rates where unit_id = any($1::uuid[]) and (broker_id=$2 or broker_id is null)", [ids, uid]) : [];
    const seasons = ids.length ? await q<SeasonRow>("select unit_id, start_date, end_date, weekday_price, weekend_price from rate_seasons where unit_id = any($1::uuid[]) order by created_at", [ids]) : [];
    return { hits, rates, seasons };
  }) : null;

  // Gom theo cơ sở; bỏ phòng chủ chưa đặt giá net
  const groups = new Map<string, { head: Hit; rooms: (Hit & { net: number })[] }>();
  if (data) for (const h of data.hits) {
    const r = data.rates.find((x) => x.unit_id === h.unit_id && x.broker_id === uid) ?? data.rates.find((x) => x.unit_id === h.unit_id);
    if (!r) continue;
    const net = priceStayWithSeasons(ci!, co!, r, data.seasons.filter((s) => s.unit_id === h.unit_id));
    const gr = groups.get(h.pid) ?? { head: h, rooms: [] };
    gr.rooms.push({ ...h, net });
    groups.set(h.pid, gr);
  }
  const list = [...groups.values()];
  const qs = `in=${ci}&out=${co}`;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Tìm phòng trống</h1>
      <form className="card grid items-end gap-3 sm:grid-cols-6" method="get">
        <div><label className="label">Nhận phòng</label><input className="input" type="date" name="in" defaultValue={ci} required /></div>
        <div><label className="label">Trả phòng</label><input className="input" type="date" name="out" defaultValue={co} required /></div>
        <div><label className="label">Số khách</label><input className="input" type="number" name="guests" min={1} defaultValue={g} /></div>
        <div><label className="label">Khu vực / tên</label><input className="input" name="area" defaultValue={area} placeholder="Đà Lạt..." /></div>
        <div><label className="label">Loại</label>
          <select className="input" name="type" defaultValue={type}><option value="">Tất cả</option><option value="homestay">Homestay</option><option value="hotel">Khách sạn nhỏ</option></select></div>
        <button className="btn">Tìm</button>
      </form>

      {!ok && (ci || co) && <p className="text-sm text-red-700">Ngày trả phòng phải sau ngày nhận phòng.</p>}
      {!ok && !ci && <p className="text-sm text-slate-500">Chọn ngày để xem mọi phòng còn trống trên các cơ sở bạn đã hợp tác, kèm giá net cho cả kỳ.</p>}
      {ok && (
        <p className="text-sm text-slate-600">{n} đêm · {g} khách · tìm thấy <b>{list.reduce((t, x) => t + x.rooms.length, 0)}</b> phòng trống ở <b>{list.length}</b> cơ sở</p>
      )}
      {ok && list.length === 0 && <p className="text-sm text-slate-500">Không có phòng phù hợp. Thử đổi ngày, giảm số khách, hoặc xin hợp tác thêm cơ sở ở tab “Cơ sở”. Phòng có yêu cầu tối thiểu nhiều đêm hơn kỳ này không hiện ở đây.</p>}

      <ul className="space-y-4">
        {list.map(({ head, rooms }) => (
          <li key={head.pid} className="card">
            <div className="flex gap-3">
              {head.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/img/${head.image}`} alt="" className="h-24 w-32 shrink-0 rounded object-cover" />
                : <div className="h-24 w-32 shrink-0 rounded bg-slate-100" />}
              <div className="min-w-0 flex-1">
                <Link href={`/broker/${head.pid}?${qs}`} className="font-semibold text-teal-800 hover:underline">{head.pname}</Link>
                <p className="text-xs text-slate-500">{TYPE_LABEL[head.type]}{head.area ? ` · ${head.area}` : ""}{head.address ? ` · ${head.address}` : ""}</p>
                {head.amenities.length > 0 && <p className="mt-1 text-xs text-slate-500">{head.amenities.slice(0, 6).map((a) => AMENITY_LABEL[a]).filter(Boolean).join(" · ")}</p>}
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {rooms.map((r) => (
                <li key={r.unit_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><b>{r.unit_name}</b> <span className="text-slate-500">· {r.capacity} khách{r.min_nights > 1 ? ` · tối thiểu ${r.min_nights} đêm` : ""}</span></span>
                  <span className="flex items-center gap-3">
                    <span>Net {n} đêm: <b>{vnd(r.net)}</b> <span className="text-xs text-slate-500">({vnd(Math.round(r.net / n))}/đêm)</span></span>
                    <Link href={`/broker/${head.pid}?${qs}#u-${r.unit_id}`} className="btn">Báo giá</Link>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
