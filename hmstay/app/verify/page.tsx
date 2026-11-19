import Link from "next/link";
import { resendVerificationAction, verifyEmailAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function Verify({ searchParams }: { searchParams: Promise<{ e?: string; sent?: string; token?: string }> }) {
  const { e, sent, token } = await searchParams;
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <h1 className="mb-1 text-2xl font-bold">Xác minh email</h1>
      <ErrorBanner e={e} />
      {token ? (
        // Phải bấm nút (POST) để xác minh, tránh việc phần mềm quét email tự mở link làm mất hiệu lực
        <form action={verifyEmailAction} className="card space-y-3">
          <p className="text-sm text-slate-600">Bấm nút bên dưới để kích hoạt tài khoản.</p>
          <input type="hidden" name="token" value={token} />
          <button className="btn w-full">Xác minh email</button>
        </form>
      ) : (
        <>
          {sent && (
            <p className="card mb-4 text-sm">Nếu email này có tài khoản chưa kích hoạt, một liên kết xác minh đã được gửi (hiệu lực 24 giờ). Hãy kiểm tra cả thư mục spam.</p>
          )}
          <form action={resendVerificationAction} className="card space-y-3">
            <p className="text-sm text-slate-600">Chưa nhận được email? Nhập email đăng ký để gửi lại.</p>
            <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
            <button className="btn w-full">Gửi lại liên kết</button>
          </form>
        </>
      )}
      <p className="mt-4 text-center text-sm"><Link className="text-teal-700 underline" href="/login">Quay lại đăng nhập</Link></p>
    </main>
  );
}
