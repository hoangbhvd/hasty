import Link from "next/link";
import { forgotPasswordAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function Forgot({ searchParams }: { searchParams: Promise<{ e?: string; sent?: string }> }) {
  const { e, sent } = await searchParams;
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-bold">Quên mật khẩu</h1>
      <p className="mb-6 text-sm text-slate-600">Nhập email đăng ký, chúng tôi sẽ gửi liên kết đặt mật khẩu mới.</p>
      <ErrorBanner e={e} />
      {sent ? (
        <p className="card text-sm">Nếu email này có tài khoản, một liên kết đặt lại mật khẩu đã được gửi (hiệu lực 1 giờ). Hãy kiểm tra cả thư mục spam.</p>
      ) : (
        <form action={forgotPasswordAction} className="card space-y-3">
          <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
          <button className="btn w-full">Gửi liên kết</button>
        </form>
      )}
      <p className="mt-4 text-center text-sm"><Link className="text-teal-700 underline" href="/login">Quay lại đăng nhập</Link></p>
    </main>
  );
}
