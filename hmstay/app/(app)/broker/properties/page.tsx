import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { requestLinkAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

type Row = { id: string; name: string; type: string; address: string | null; owner_name: string; status: string | null; image: string | null };

export default async function BrokerHome({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { e } = await searchParams;
  // Cơ sở của người khác + trạng thái hợp tác của mình (không liệt kê cơ sở của chính mình)
  const rows = await withUser(uid, (q) => q<Row>(
    `select p.id, p.name, p.type, p.address, o.full_name owner_name, l.status,
            (select storage_key from property_images i where i.property_id=p.id order by sort_order, created_at limit 1) image
     from properties p join profiles o on o.id=p.owner_id
     left join broker_links l on l.property_id=p.id and l.broker_id=$1
     where p.owner_id <> $1 order by (l.status='active') desc nulls last, p.name`, [uid]));
  const label: Record<string, string> = { pending: "Đang chờ chủ duyệt", rejected: "Chủ đã từ chối", revoked: "Đã bị thu hồi" };
  return (
    <div className="space-y-4">
      <ErrorBanner e={e} />
      <h1 className="text-xl font-bold">Cơ sở để bán</h1>
      {rows.length === 0 && <p className="text-sm text-slate-500">Chưa có cơ sở nào của chủ khác trên hệ thống.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="card flex gap-3">
            {r.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/img/${r.image}`} alt="" className="h-20 w-24 shrink-0 rounded object-cover" />
              : <div className="h-20 w-24 shrink-0 rounded bg-slate-100" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name}</p>
              <p className="truncate text-xs text-slate-500">{r.address} · Chủ: {r.owner_name}</p>
              <div className="mt-2">
                {r.status === "active" ? <Link className="btn" href={`/broker/${r.id}`}>Kiểm tra phòng & báo giá</Link>
                  : r.status === "pending" ? <span className="text-sm text-amber-700">{label.pending}</span>
                  : (
                    <form action={requestLinkAction} className="flex items-center gap-2">
                      <input type="hidden" name="property_id" value={r.id} />
                      <button className="btn-ghost">Xin hợp tác</button>
                      {r.status && <span className="text-xs text-slate-500">{label[r.status]}</span>}
                    </form>
                  )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
