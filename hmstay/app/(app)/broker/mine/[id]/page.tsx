import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { deleteMyPropertyAction, setMyBookingStatusAction, updateMyPropertyAction } from "@/lib/actions";
import { dmy, nightsBetween, vnd } from "@/lib/format";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MyBooking, MyBookingForm } from "@/components/MyBookingForm";

type Row = MyBooking & { status: string };

function StatusBtn({ id, pid, to, label, danger }: { id: string; pid: string; to: string; label: string; danger?: boolean }) {
  return (
    <form action={setMyBookingStatusAction}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="property_id" value={pid} /><input type="hidden" name="status" value={to} />
      <button className={danger ? "btn-danger" : "btn-ghost"}>{label}</button>
    </form>
  );
}

export default async function MyProperty({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { e } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withUser(uid, async (q) => {
    const [p] = await q<{ id: string; name: string; address: string | null; rooms: string[] }>("select id,name,address,rooms from broker_properties where id=$1", [id]);
    if (!p) return null;
    const rows = await q<Row>(
      `select id, rooms, check_in, check_out, guest_name, guest_phone, nightly_price, total, deposit, note, status
       from broker_bookings where property_id=$1 order by check_in desc, check_out desc`, [id]);
    return { p, rows };
  });
  if (!data) notFound();
  const { p, rows } = data;
  const active = rows.filter((r) => r.status === "active");
  return (
    <div className="space-y-5">
      <ErrorBanner e={e} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/broker/mine" className="text-sm text-teal-700 underline">‹ Cơ sở tự quản</Link>
          <h1 className="text-xl font-bold">{p.name} <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 align-middle text-xs font-medium text-violet-800">Tự quản lý</span></h1>
          {p.address && <p className="text-sm text-slate-600">{p.address}</p>}
        </div>
        <Link href="/broker/bookings" className="btn-ghost">Xem lịch tất cả cơ sở</Link>
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Thêm booking</h2>
        <MyBookingForm propertyId={p.id} rooms={p.rooms} />
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Booking ({active.length})</h2>
        {rows.length === 0 && <p className="text-sm text-slate-500">Chưa có booking.</p>}
        <ul className="space-y-3">
          {rows.map((b) => {
            const n = nightsBetween(b.check_in, b.check_out);
            const off = b.status === "cancelled";
            return (
              <li key={b.id} className={`card ${off ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{b.guest_name}{b.guest_phone && <span className="font-normal text-slate-500"> · {b.guest_phone}</span>}</p>
                    <p className="text-sm text-slate-600">{dmy(b.check_in)} → {dmy(b.check_out)} ({n} đêm){b.rooms ? ` · ${b.rooms}` : ""}</p>
                  </div>
                  {off && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">Đã huỷ</span>}
                </div>
                <p className="mt-2 text-sm">
                  Giá/đêm: <b>{vnd(b.nightly_price)}</b> · Tổng: <b>{vnd(b.total)}</b> · Đã cọc: <b>{vnd(b.deposit)}</b> · Còn lại: <b className="text-emerald-700">{vnd(b.total - b.deposit)}</b>
                </p>
                {b.note && <p className="mt-1 text-xs text-slate-500">Ghi chú: {b.note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {off ? <StatusBtn id={b.id} pid={p.id} to="active" label="Khôi phục" /> : <StatusBtn id={b.id} pid={p.id} to="cancelled" label="Huỷ booking" danger />}
                  <StatusBtn id={b.id} pid={p.id} to="delete" label="Xoá hẳn" danger />
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-teal-700">Sửa booking</summary>
                  <div className="mt-3"><MyBookingForm propertyId={p.id} rooms={p.rooms} b={b} /></div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Thông tin cơ sở</h2>
        <form action={updateMyPropertyAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="property_id" value={p.id} />
          <div><label className="label">Tên cơ sở</label><input className="input" name="name" defaultValue={p.name} required /></div>
          <div><label className="label">Địa chỉ</label><input className="input" name="address" defaultValue={p.address ?? ""} /></div>
          <div className="sm:col-span-2"><label className="label">Danh sách phòng (mỗi dòng một phòng)</label>
            <textarea className="input" name="rooms" rows={4} defaultValue={p.rooms.join("\n")} /></div>
          <div><button className="btn">Lưu</button></div>
        </form>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-red-700">Xoá cơ sở này</summary>
          <form action={deleteMyPropertyAction} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <input type="hidden" name="property_id" value={p.id} />
            <p className="text-sm text-red-800">Xoá cơ sở sẽ xoá luôn {rows.length} booking của nó, không khôi phục được.</p>
            <button className="btn-danger">Xác nhận xoá</button>
          </form>
        </details>
      </section>
    </div>
  );
}
