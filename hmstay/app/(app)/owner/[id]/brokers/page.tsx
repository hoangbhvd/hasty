import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { setLinkStatusAction } from "@/lib/actions";
import { vnd } from "@/lib/format";
import { ErrorBanner } from "@/components/ErrorBanner";

type Link = { id: string; broker_id: string; full_name: string; phone: string | null; status: string; commission_note: string | null; confirmed: number; revenue: number; open: number };

export default async function BrokersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { e } = await searchParams;
  const links = await withUser(uid, async (q) => {
    const [p] = await q("select 1 from properties where id=$1 and owner_id=$2", [id, uid]);
    if (!p) return null;
    return q<Link>(
      `select l.id, l.broker_id, pr.full_name, pr.phone, l.status, l.commission_note,
              (select count(*)::int from bookings b join units u on u.id=b.unit_id where u.property_id=l.property_id and b.broker_id=l.broker_id and b.status='confirmed') confirmed,
              (select coalesce(sum(b.net_total),0)::bigint from bookings b join units u on u.id=b.unit_id where u.property_id=l.property_id and b.broker_id=l.broker_id and b.status='confirmed') revenue,
              (select count(*)::int from bookings b join units u on u.id=b.unit_id where u.property_id=l.property_id and b.broker_id=l.broker_id and b.status in ('holding','deposit_reported')) open
       from broker_links l join profiles pr on pr.id=l.broker_id where l.property_id=$1
       order by (l.status='pending') desc, (l.status='active') desc, l.created_at desc`, [id]);
  });
  if (!links) notFound();
  const label: Record<string, string> = { pending: "Chờ duyệt", active: "Đang hợp tác", rejected: "Đã từ chối", revoked: "Đã thu hồi" };
  const tone: Record<string, string> = { pending: "bg-amber-100 text-amber-800", active: "bg-emerald-100 text-emerald-800", rejected: "bg-slate-200 text-slate-600", revoked: "bg-red-100 text-red-700" };

  return (
    <div className="space-y-4">
      <ErrorBanner e={e} />
      <p className="text-sm text-slate-600">Broker tìm thấy cơ sở của bạn ở Chế độ Broker và xin hợp tác. Chỉ broker đã duyệt mới thấy giá net, lịch trống và báo giá được.</p>
      {links.length === 0 && <p className="text-sm text-slate-500">Chưa có broker nào xin hợp tác.</p>}
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{l.full_name}{l.phone && <span className="font-normal text-slate-500"> · {l.phone}</span>}</p>
                {l.commission_note && <p className="text-xs text-slate-500">Thoả thuận: {l.commission_note}</p>}
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone[l.status]}`}>{label[l.status]}</span>
            </div>
            {l.status === "active" && (
              <p className="mt-2 text-sm text-slate-700">{l.confirmed} booking đã chốt · {vnd(l.revenue)} net · {l.open} đang chờ</p>
            )}
            <form action={setLinkStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="property_id" value={id} /><input type="hidden" name="link_id" value={l.id} />
              <input className="input w-56" name="note" placeholder="Thoả thuận hoa hồng / ghi chú" defaultValue="" />
              {l.status !== "active" && <button name="status" value="active" className="btn">Duyệt</button>}
              {l.status === "pending" && <button name="status" value="rejected" className="btn-danger">Từ chối</button>}
              {l.status === "active" && <button name="status" value="revoked" className="btn-danger">Thu hồi</button>}
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
