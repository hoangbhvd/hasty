import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { markNotificationsReadAction } from "@/lib/actions";

export default async function Notifications() {
  const uid = await requireUser();
  const rows = await withUser(uid, (q) => q<{ id: number; message: string; read_at: string | null; created_at: string }>(
    "select id, message, read_at, created_at from notifications order by created_at desc limit 100"));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Thông báo</h1>
        <form action={markNotificationsReadAction}><button className="btn-ghost">Đánh dấu đã đọc</button></form>
      </div>
      {rows.length === 0 && <p className="text-sm text-slate-500">Chưa có thông báo.</p>}
      <ul className="space-y-2">
        {rows.map((n) => (
          <li key={n.id} className={`card text-sm ${n.read_at ? "opacity-60" : "border-teal-300"}`}>
            {n.message}<span className="ml-2 text-xs text-slate-500">{new Date(n.created_at).toLocaleString("vi-VN")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
