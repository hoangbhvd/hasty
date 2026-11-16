import Link from "next/link";
import { registerAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function Register({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-bold">Tạo tài khoản</h1>
      <p className="mb-6 text-sm text-slate-600">Một tài khoản dùng được cả hai vai trò: chủ và broker.</p>
      <ErrorBanner e={e} />
      <form action={registerAction} className="card space-y-3">
        <div><label className="label">Họ tên</label><input className="input" name="name" required /></div>
        <div><label className="label">Số điện thoại</label><input className="input" name="phone" /></div>
        <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
        <div><label className="label">Mật khẩu (tối thiểu 8 ký tự)</label><input className="input" name="password" type="password" minLength={8} required /></div>
        <button className="btn w-full">Đăng ký</button>
      </form>
      <p className="mt-4 text-center text-sm">Đã có tài khoản? <Link className="text-teal-700 underline" href="/login">Đăng nhập</Link></p>
    </main>
  );
}
