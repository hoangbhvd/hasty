import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { createTemplateAction, deleteTemplateAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function Templates({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { e } = await searchParams;
  const rows = await withUser(uid, (q) => q<{ id: string; name: string; updated_at: string }>(
    "select id, name, updated_at from booking_templates order by updated_at desc"));
  return (
    <div className="space-y-6">
      <ErrorBanner e={e} />
      <div>
        <h1 className="text-xl font-bold">Mẫu xác nhận booking</h1>
        <p className="text-sm text-slate-600">Tự thiết kế mẫu xác nhận gửi khách (logo, màu sắc, bố cục). Dùng các biến như {"{{TEN_KHACH}}"} để tự điền thông tin từ booking. Mẫu chỉ mình bạn thấy.</p>
      </div>
      <form action={createTemplateAction} className="card flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1"><label className="label">Tên mẫu mới</label><input className="input" name="name" placeholder="VD: Mẫu Cottown" required /></div>
        <button className="btn">Tạo mẫu</button>
        <p className="w-full text-xs text-slate-500">Mẫu mới bắt đầu từ bố cục cơ bản, bạn kéo thả để chỉnh lại.</p>
      </form>
      {rows.length === 0 ? <p className="text-sm text-slate-500">Chưa có mẫu nào. Khi chưa có mẫu, hệ thống dùng một mẫu cơ bản mặc định.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">Cập nhật {new Date(r.updated_at).toLocaleString("vi-VN")}</p></div>
              <div className="flex gap-2">
                <a className="btn-ghost" href={`/api/template-preview/${r.id}`} target="_blank" rel="noreferrer">Xem thử</a>
                <Link className="btn" href={`/templates/${r.id}`}>Chỉnh sửa</Link>
                <form action={deleteTemplateAction}><input type="hidden" name="id" value={r.id} /><button className="btn-danger">Xoá</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
