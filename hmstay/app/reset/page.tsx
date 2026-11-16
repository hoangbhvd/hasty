import Link from "next/link";
import { resetPasswordAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string; e?: string }> }) {
  const { token, e } = await searchParams;
  if (!token) {
    return (
      <main className="mx-auto mt-16 w-full max-w-sm px-4">
        <p className="card text-sm">Liên kết không hợp lệ. <Link className="text-teal-700 underline" href="/forgot">Yêu cầu liên kết mới</Link></p>
      </main>
    );
  }
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-bold">Đặt mật khẩu mới</h1>
      <ErrorBanner e={e} />
      <form action={resetPasswordAction} className="card space-y-3">
        <input type="hidden" name="token" value={token} />
        <div><label className="label">Mật khẩu mới (tối thiểu 8 ký tự)</label><input className="input" name="password" type="password" minLength={8} required /></div>
        <div><label className="label">Nhập lại mật khẩu</label><input className="input" name="password2" type="password" minLength={8} required /></div>
        <button className="btn w-full">Đổi mật khẩu</button>
      </form>
    </main>
  );
}
