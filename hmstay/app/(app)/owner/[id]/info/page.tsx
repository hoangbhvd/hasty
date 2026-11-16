import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { updatePropertyAction } from "@/lib/actions";
import { AMENITIES } from "@/lib/property";
import { ErrorBanner } from "@/components/ErrorBanner";

type P = { id: string; name: string; type: string; address: string | null; area: string | null; description: string | null; amenities: string[];
  checkin_time: string; checkout_time: string; cancel_policy: string | null; house_rules: string | null };

export default async function InfoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; saved?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { e, saved } = await searchParams;
  const p = await withUser(uid, async (q) => (await q<P>(
    `select id,name,type,address,area,description,amenities,checkin_time,checkout_time,cancel_policy,house_rules
     from properties where id=$1 and owner_id=$2`, [id, uid]))[0]);
  if (!p) notFound();
  const groups = [...new Set(AMENITIES.map((a) => a.group))];

  return (
    <form action={updatePropertyAction} className="space-y-6">
      <input type="hidden" name="property_id" value={id} />
      <ErrorBanner e={e} />
      {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Đã lưu thông tin cơ sở.</p>}
      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Thông tin chung</h2>
        <div><label className="label">Tên cơ sở</label><input className="input" name="name" defaultValue={p.name} required /></div>
        <div><label className="label">Loại</label>
          <select className="input" name="type" defaultValue={p.type}><option value="homestay">Homestay</option><option value="hotel">Khách sạn nhỏ</option></select></div>
        <div><label className="label">Khu vực / thành phố</label><input className="input" name="area" defaultValue={p.area ?? ""} placeholder="VD: Đà Lạt, Sa Pa, Hội An" /></div>
        <div><label className="label">Địa chỉ</label><input className="input" name="address" defaultValue={p.address ?? ""} /></div>
        <div className="sm:col-span-2"><label className="label">Giới thiệu</label><textarea className="input" name="description" rows={4} defaultValue={p.description ?? ""} placeholder="Điểm nổi bật, vị trí, phù hợp với nhóm khách nào..." /></div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Tiện nghi</h2>
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1 text-xs font-medium uppercase text-slate-500">{g}</p>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.filter((a) => a.group === g).map((a) => (
                <label key={a.key} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50">
                  <input type="checkbox" name="amenities" value={a.key} defaultChecked={p.amenities.includes(a.key)} /> {a.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Chính sách</h2>
        <div><label className="label">Giờ nhận phòng</label><input className="input" type="time" name="checkin_time" defaultValue={p.checkin_time} /></div>
        <div><label className="label">Giờ trả phòng</label><input className="input" type="time" name="checkout_time" defaultValue={p.checkout_time} /></div>
        <div className="sm:col-span-2"><label className="label">Chính sách huỷ / hoàn cọc</label><textarea className="input" name="cancel_policy" rows={3} defaultValue={p.cancel_policy ?? ""} placeholder="VD: Huỷ trước 7 ngày hoàn 100% cọc; trước 3 ngày hoàn 50%." /></div>
        <div className="sm:col-span-2"><label className="label">Nội quy</label><textarea className="input" name="house_rules" rows={3} defaultValue={p.house_rules ?? ""} placeholder="Giờ yên tĩnh, hút thuốc, thú cưng, khách ngoài..." /></div>
      </section>
      <button className="btn">Lưu thông tin</button>
    </form>
  );
}
