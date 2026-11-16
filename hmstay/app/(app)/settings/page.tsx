import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { saveSettingsAction } from "@/lib/actions";

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const uid = await requireUser();
  const { saved } = await searchParams;
  const me = await withUser(uid, async (q) => (await q<{ email: string; email_notifications: boolean; full_name: string }>(
    "select u.email, u.email_notifications, p.full_name from users u join profiles p on p.id=u.id where u.id=$1", [uid]))[0]);
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-bold">Cài đặt</h1>
      {saved && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Đã lưu.</p>}
      <form action={saveSettingsAction} className="card space-y-3">
        <p className="text-sm text-slate-600">Tài khoản: <b>{me.full_name}</b> · {me.email}</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="email_notifications" defaultChecked={me.email_notifications} className="mt-0.5" />
          <span>Gửi email khi có thay đổi booking (giữ chỗ, báo cọc, chốt, huỷ). Thông báo trong app vẫn luôn hiển thị.</span>
        </label>
        <button className="btn">Lưu</button>
      </form>
    </div>
  );
}
