import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/password-forms";

// Token nằm trong URL: không lập chỉ mục, không gửi Referer sang trang khác
export const metadata: Metadata = { title: "Đặt mật khẩu mới", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <p className="max-w-sm rounded border border-black bg-white p-4 text-sm shadow-brutal-sm">
        Link không hợp lệ. <Link href="/forgot-password" className="font-medium underline">Gửi lại link đặt mật khẩu</Link>.
      </p>
    );
  }
  return <ResetForm token={token} />;
}
