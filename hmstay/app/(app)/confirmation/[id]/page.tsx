import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { loadConfirmationVars } from "@/lib/confirmation";

export default async function Confirmation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { t } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const vars = await loadConfirmationVars(uid, id);
  if (!vars) notFound();
  const templates = await withUser(uid, (q) => q<{ id: string; name: string }>("select id, name from booking_templates order by updated_at desc"));
  const chosen = t && (t === "default" || templates.some((x) => x.id === t)) ? t : (templates[0]?.id ?? "default");
  const src = `/api/confirm/${id}?t=${chosen}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Xác nhận booking – {vars.TEN_KHACH}</h1>
          <p className="text-sm text-slate-600">{vars.TEN_CO_SO} · {vars.TEN_PHONG} · {vars.CHECK_IN} → {vars.CHECK_OUT}</p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <div><label className="label">Mẫu</label>
            <select name="t" defaultValue={chosen} className="input">
              {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              <option value="default">Mẫu cơ bản mặc định</option>
            </select></div>
          <button className="btn-ghost">Đổi mẫu</button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn" href={src} target="_blank" rel="noreferrer">Mở toàn trang để in / lưu PDF</a>
        <Link className="btn-ghost" href="/templates">Quản lý mẫu</Link>
      </div>
      <p className="text-xs text-slate-500">Trong trang mở ra, bấm “In / Lưu PDF”, chọn đích “Lưu dưới dạng PDF”, khổ A4 và tắt “Đầu trang và chân trang”.</p>
      <iframe src={src} title="Xem trước xác nhận" className="h-[80vh] w-full rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
