import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { createPropertyAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function OwnerHome({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { e } = await searchParams;
  const { props, pendingBookings, pendingLinks } = await withUser(uid, async (q) => ({
    props: await q<{ id: string; name: string; type: string; rental_mode: string; units: number; brokers: number }>(
      `select p.id, p.name, p.type, p.rental_mode,
              (select count(*)::int from units u where u.property_id=p.id) units,
              (select count(*)::int from broker_links l where l.property_id=p.id and l.status='active') brokers
       from properties p where p.owner_id=$1 order by p.created_at desc`, [uid]),
    pendingBookings: (await q<{ c: number }>(
      `select count(*)::int c from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id
       where p.owner_id=$1 and b.status in ('holding','deposit_reported')`, [uid]))[0].c,
    pendingLinks: (await q<{ c: number }>(
      `select count(*)::int c from broker_links l join properties p on p.id=l.property_id
       where p.owner_id=$1 and l.status='pending'`, [uid]))[0].c,
  }));

  return (
    <div className="space-y-8">
      <ErrorBanner e={e} />
      {(pendingBookings > 0 || pendingLinks > 0) && (
        <div className="card flex flex-wrap gap-6 border-amber-300 bg-amber-50">
          {pendingBookings > 0 && <Link href="/owner/bookings" className="font-medium text-amber-900 underline">{pendingBookings} booking chờ bạn chốt</Link>}
          {pendingLinks > 0 && <span className="font-medium text-amber-900">{pendingLinks} broker xin hợp tác (mở cơ sở để duyệt)</span>}
        </div>
      )}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Cơ sở của tôi</h1>
          <Link href="/owner/bookings" className="btn-ghost">Tất cả booking</Link>
        </div>
        {props.length === 0 ? <p className="text-sm text-slate-500">Bạn chưa có cơ sở nào. Thêm ở bên dưới.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {props.map((p) => (
              <li key={p.id}>
                <Link href={`/owner/${p.id}`} className="card block hover:border-teal-600">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-slate-600">{p.type === "hotel" ? "Khách sạn" : "Homestay"} · {p.rental_mode === "whole" ? "Bán nguyên căn" : `${p.units} phòng`} · {p.brokers} broker</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Thêm cơ sở</h2>
        <form action={createPropertyAction} className="card grid gap-3 sm:grid-cols-2">
          <div><label className="label">Tên</label><input className="input" name="name" required /></div>
          <div><label className="label">Địa chỉ</label><input className="input" name="address" /></div>
          <div><label className="label">Loại</label>
            <select className="input" name="type"><option value="homestay">Homestay</option><option value="hotel">Khách sạn nhỏ</option></select></div>
          <div><label className="label">Cách bán</label>
            <select className="input" name="rental_mode"><option value="room">Theo từng phòng</option><option value="whole">Nguyên căn</option></select></div>
          <div><label className="label">Sức chứa (nếu nguyên căn)</label><input className="input" name="capacity" type="number" min={1} defaultValue={4} /></div>
          <div className="sm:col-span-2"><label className="label">Mô tả</label><textarea className="input" name="description" rows={2} /></div>
          <div className="sm:col-span-2"><button className="btn">Tạo cơ sở</button></div>
        </form>
      </section>
    </div>
  );
}
