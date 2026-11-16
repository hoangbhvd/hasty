import Link from "next/link";
import { loginAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const { e, ok } = await searchParams;
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-bold">HMStay</h1>
      <p className="mb-6 text-sm text-slate-600">Đăng nhập để quản lý cơ sở hoặc bán phòng với vai trò broker.</p>
      <ErrorBanner e={e} />
      {ok && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>}
      <form action={loginAction} className="card space-y-3">
        <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
        <div><label className="label">Mật khẩu</label><input className="input" name="password" type="password" required /></div>
        <button className="btn w-full">Đăng nhập</button>
        <p className="text-right text-sm"><Link className="text-teal-700 underline" href="/forgot">Quên mật khẩu?</Link></p>
      </form>
      <p className="mt-4 text-center text-sm">Chưa có tài khoản? <Link className="text-teal-700 underline" href="/register">Đăng ký</Link></p>
    </main>
  );
}
