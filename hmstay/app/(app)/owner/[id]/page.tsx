import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import {
  addUnitAction, blockDatesAction, deleteImageAction, saveRateAction, setLinkStatusAction, uploadImageAction,
} from "@/lib/actions";
import { BOOKING_SQL, BookingList, BookingRow } from "@/components/BookingList";
import { ErrorBanner } from "@/components/ErrorBanner";
import { vnd } from "@/lib/format";

type Unit = { id: string; name: string; capacity: number };
type Rate = { id: string; unit_id: string; broker_id: string | null; broker_name: string | null; weekday_price: number; weekend_price: number; min_sell_price: number | null };
type Link = { id: string; broker_id: string; full_name: string; phone: string | null; status: string; commission_note: string | null };
type Img = { id: string; storage_key: string };

export default async function OwnerProperty({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { e } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const data = await withUser(uid, async (q) => {
    const [p] = await q<{ id: string; name: string; rental_mode: string; address: string | null }>(
      "select id,name,rental_mode,address from properties where id=$1 and owner_id=$2", [id, uid]);
    if (!p) return null;
    return {
      p,
      units: await q<Unit>("select id,name,capacity from units where property_id=$1 order by created_at", [id]),
      rates: await q<Rate>(
        `select r.id, r.unit_id, r.broker_id, pr.full_name broker_name, r.weekday_price, r.weekend_price, r.min_sell_price
         from net_rates r join units u on u.id=r.unit_id left join profiles pr on pr.id=r.broker_id
         where u.property_id=$1 order by r.broker_id nulls first`, [id]),
      links: await q<Link>(
        `select l.id, l.broker_id, pr.full_name, pr.phone, l.status, l.commission_note
         from broker_links l join profiles pr on pr.id=l.broker_id where l.property_id=$1 order by l.created_at desc`, [id]),
      images: await q<Img>("select id, storage_key from property_images where property_id=$1 order by sort_order, created_at", [id]),
      bookings: await q<BookingRow>(`${BOOKING_SQL} where p.id=$1 and b.status in ('holding','deposit_reported','confirmed') and b.check_out >= current_date order by b.check_in`, [id]),
    };
  });
  if (!data) notFound();
  const { p, units, rates, links, images, bookings } = data;
  const activeBrokers = links.filter((l) => l.status === "active");
  const back = `/owner/${id}`;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold">{p.name}</h1>
        <p className="text-sm text-slate-600">{p.address} · {p.rental_mode === "whole" ? "Bán nguyên căn" : "Bán theo phòng"}</p>
        <Link href={`/owner/${id}/calendar`} className="btn-ghost mt-2">Xem lịch theo tháng</Link>
      </div>
      <ErrorBanner e={e} />

      <section>
        <h2 className="mb-3 font-semibold">Broker hợp tác</h2>
        {links.length === 0 && <p className="text-sm text-slate-500">Chưa có broker nào xin hợp tác. Broker tìm cơ sở của bạn ở Chế độ Broker.</p>}
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="card flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{l.full_name}{l.phone && <span className="font-normal text-slate-500"> · {l.phone}</span>}</p>
                <p className="text-xs text-slate-500">{{ pending: "Đang chờ duyệt", active: "Đang hợp tác", rejected: "Đã từ chối", revoked: "Đã thu hồi" }[l.status]}{l.commission_note && ` · ${l.commission_note}`}</p>
              </div>
              <form action={setLinkStatusAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="property_id" value={id} /><input type="hidden" name="link_id" value={l.id} />
                <input className="input w-44" name="note" placeholder="Thoả thuận hoa hồng" />
                {l.status !== "active" && <button name="status" value="active" className="btn">Duyệt</button>}
                {l.status === "pending" && <button name="status" value="rejected" className="btn-danger">Từ chối</button>}
                {l.status === "active" && <button name="status" value="revoked" className="btn-danger">Thu hồi</button>}
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">{p.rental_mode === "whole" ? "Giá nguyên căn" : "Phòng & giá net"}</h2>
        <div className="space-y-4">
          {units.map((u) => {
            const ur = rates.filter((r) => r.unit_id === u.id);
            return (
              <div key={u.id} className="card">
                <p className="font-semibold">{u.name} <span className="text-sm font-normal text-slate-500">· {u.capacity} khách</span></p>
                <ul className="my-2 space-y-1 text-sm">
                  {ur.length === 0 && <li className="text-amber-700">Chưa có giá net — broker chưa báo giá được.</li>}
                  {ur.map((r) => (
                    <li key={r.id}>
                      <b>{r.broker_name ? `Riêng ${r.broker_name}` : "Mặc định (mọi broker)"}</b>: T2–T5/CN {vnd(r.weekday_price)} · T6–T7 {vnd(r.weekend_price)}
                      {r.min_sell_price ? ` · sàn ${vnd(r.min_sell_price)}/đêm` : ""}
                    </li>
                  ))}
                </ul>
                <form action={saveRateAction} className="grid items-end gap-2 sm:grid-cols-5">
                  <input type="hidden" name="property_id" value={id} /><input type="hidden" name="unit_id" value={u.id} />
                  <div><label className="label">Áp dụng cho</label>
                    <select className="input" name="broker_id"><option value="">Mặc định</option>
                      {activeBrokers.map((b) => <option key={b.broker_id} value={b.broker_id}>{b.full_name}</option>)}</select></div>
                  <div><label className="label">Net T2–T5, CN</label><input className="input" name="weekday" inputMode="numeric" required /></div>
                  <div><label className="label">Net T6–T7</label><input className="input" name="weekend" inputMode="numeric" /></div>
                  <div><label className="label">Sàn/đêm (tuỳ chọn)</label><input className="input" name="min_sell" inputMode="numeric" /></div>
                  <button className="btn">Lưu giá</button>
                </form>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-slate-600">Khoá lịch (khách trực tiếp / bảo trì)</summary>
                  <form action={blockDatesAction} className="mt-2 grid items-end gap-2 sm:grid-cols-5">
                    <input type="hidden" name="property_id" value={id} /><input type="hidden" name="unit_id" value={u.id} />
                    <div><label className="label">Nhận phòng</label><input className="input" type="date" name="check_in" required /></div>
                    <div><label className="label">Trả phòng</label><input className="input" type="date" name="check_out" required /></div>
                    <div className="sm:col-span-2"><label className="label">Tên khách / lý do</label><input className="input" name="guest_name" /></div>
                    <button className="btn-ghost">Khoá</button>
                  </form>
                </details>
              </div>
            );
          })}
        </div>
        {p.rental_mode === "room" && (
          <form action={addUnitAction} className="mt-4 grid items-end gap-2 sm:grid-cols-4">
            <input type="hidden" name="property_id" value={id} />
            <div className="sm:col-span-2"><label className="label">Tên phòng mới</label><input className="input" name="name" placeholder="VD: Phòng 101" required /></div>
            <div><label className="label">Sức chứa</label><input className="input" name="capacity" type="number" min={1} defaultValue={2} /></div>
            <button className="btn">Thêm phòng</button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Lịch sắp tới ({bookings.length})</h2>
        <BookingList rows={bookings} role="owner" back={back} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Ảnh ({images.length})</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((im) => (
            <div key={im.id} className="card p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/img/${im.storage_key}`} alt="" className="aspect-[4/3] w-full rounded object-cover" />
              <form action={deleteImageAction} className="mt-2">
                <input type="hidden" name="property_id" value={id} /><input type="hidden" name="image_id" value={im.id} />
                <button className="text-xs text-red-700 underline">Xoá</button>
              </form>
            </div>
          ))}
        </div>
        <form action={uploadImageAction} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="property_id" value={id} />
          <input type="file" name="images" accept="image/*" multiple required className="text-sm" />
          <button className="btn">Tải ảnh lên</button>
          <span className="text-xs text-slate-500">Tự nén về WebP ≤1600px.</span>
        </form>
      </section>
    </div>
  );
}
