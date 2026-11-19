import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { createMyPropertyAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function MyProperties({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { e } = await searchParams;
  const rows = await withUser(uid, (q) => q<{ id: string; name: string; address: string | null; rooms: string[]; upcoming: number }>(
    `select p.id, p.name, p.address, p.rooms,
            (select count(*)::int from broker_bookings b where b.property_id=p.id and b.status='active' and b.check_out >= current_date) upcoming
     from broker_properties p where p.broker_id=$1 order by p.name`, [uid]));
  return (
    <div className="space-y-4">
      <ErrorBanner e={e} />
      <div>
        <h1 className="text-xl font-bold">Cơ sở tự quản</h1>
        <p className="text-sm text-slate-600">Cơ sở do chính bạn quản lý, không cần chủ duyệt. Bạn tự nhập phòng và booking; hệ thống không kiểm tra trùng lịch.</p>
      </div>
      <details className="card" open={rows.length === 0}>
        <summary className="cursor-pointer font-medium">+ Thêm cơ sở tự quản</summary>
        <form action={createMyPropertyAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="label">Tên cơ sở</label><input className="input" name="name" required /></div>
          <div><label className="label">Địa chỉ</label><input className="input" name="address" /></div>
          <div className="sm:col-span-2">
            <label className="label">Danh sách phòng (mỗi dòng một phòng, có thể bỏ trống)</label>
            <textarea className="input" name="rooms" rows={3} placeholder={"Phòng đơn 1\nPhòng đôi 2"} />
          </div>
          <div><button className="btn">Tạo cơ sở</button></div>
        </form>
      </details>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((p) => (
          <li key={p.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/broker/mine/${p.id}`} className="font-semibold text-teal-800 hover:underline">{p.name}</Link>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">Tự quản lý</span>
            </div>
            {p.address && <p className="text-sm text-slate-600">{p.address}</p>}
            <p className="mt-1 text-sm text-slate-600">{p.rooms.length} phòng · {p.upcoming} booking sắp tới</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
