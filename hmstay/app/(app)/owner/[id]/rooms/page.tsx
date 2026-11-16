import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { addUnitAction, deleteUnitAction, updateUnitAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

type Unit = { id: string; name: string; capacity: number; description: string | null; min_nights: number; active: boolean; bookings: number };

export default async function RoomsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { e } = await searchParams;
  const d = await withUser(uid, async (q) => {
    const [p] = await q<{ rental_mode: string }>("select rental_mode from properties where id=$1 and owner_id=$2", [id, uid]);
    if (!p) return null;
    const units = await q<Unit>(
      `select u.id, u.name, u.capacity, u.description, u.min_nights, u.active,
              (select count(*)::int from bookings b where b.unit_id=u.id) bookings
       from units u where u.property_id=$1 order by u.created_at`, [id]);
    return { p, units };
  });
  if (!d) notFound();
  const whole = d.p.rental_mode === "whole";

  return (
    <div className="space-y-6">
      <ErrorBanner e={e} />
      <p className="text-sm text-slate-600">
        {whole ? "Cơ sở bán nguyên căn: chỉ có một đơn vị cho thuê." : "Mỗi phòng là một đơn vị riêng để broker báo giá và giữ chỗ."} Tắt “Đang bán” để ẩn phòng khỏi broker mà không mất lịch sử booking.
      </p>
      <ul className="space-y-3">
        {d.units.map((u) => (
          <li key={u.id} className={`card ${u.active ? "" : "opacity-70"}`}>
            <form action={updateUnitAction} className="grid items-end gap-2 sm:grid-cols-6">
              <input type="hidden" name="property_id" value={id} /><input type="hidden" name="unit_id" value={u.id} />
              <div className="sm:col-span-3"><label className="label">Tên</label><input className="input" name="name" defaultValue={u.name} required /></div>
              <div><label className="label">Sức chứa</label><input className="input" name="capacity" type="number" min={1} defaultValue={u.capacity} /></div>
              <div><label className="label">Tối thiểu (đêm)</label><input className="input" name="min_nights" type="number" min={1} max={60} defaultValue={u.min_nights} /></div>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} /> Đang bán</label>
              <div className="sm:col-span-6"><label className="label">Mô tả (giường, diện tích, view...)</label><input className="input" name="description" defaultValue={u.description ?? ""} /></div>
              <div className="flex gap-2 sm:col-span-6"><button className="btn">Lưu</button></div>
            </form>
            {!whole && (
              <form action={deleteUnitAction} className="mt-2">
                <input type="hidden" name="property_id" value={id} /><input type="hidden" name="unit_id" value={u.id} />
                <button className="text-xs text-red-700 underline" disabled={u.bookings > 0} title={u.bookings > 0 ? "Phòng đã có booking" : ""}>
                  {u.bookings > 0 ? `Không xoá được (${u.bookings} booking) — hãy tắt “Đang bán”` : "Xoá phòng"}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {!whole && (
        <form action={addUnitAction} className="card grid items-end gap-2 sm:grid-cols-6">
          <input type="hidden" name="property_id" value={id} />
          <h2 className="font-semibold sm:col-span-6">Thêm phòng</h2>
          <div className="sm:col-span-3"><label className="label">Tên phòng</label><input className="input" name="name" placeholder="VD: Phòng 101" required /></div>
          <div><label className="label">Sức chứa</label><input className="input" name="capacity" type="number" min={1} defaultValue={2} /></div>
          <div><label className="label">Tối thiểu (đêm)</label><input className="input" name="min_nights" type="number" min={1} max={60} defaultValue={1} /></div>
          <div className="sm:col-span-6"><label className="label">Mô tả</label><input className="input" name="description" /></div>
          <button className="btn sm:col-span-6 sm:w-fit">Thêm phòng</button>
        </form>
      )}
    </div>
  );
}
