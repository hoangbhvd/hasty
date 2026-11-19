"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/form-fields";
import { useSafeForm } from "@/lib/use-safe-form";
import { changeEmailAction, changePasswordAction, revokeOtherSessionsAction } from "@/app/(app)/account/security-actions";

const box = "space-y-3 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card";
const Msg = ({ s }: { s: { error?: string; message?: string } | undefined }) => (
  <>
    {s?.error && <p role="alert" className="text-sm font-medium text-red-700">{s.error}</p>}
    {s?.message && <p role="status" className="text-sm font-medium text-green-800">{s.message}</p>}
  </>
);

export function ChangePasswordForm() {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(changePasswordAction, { resetOnSuccess: true });
  return (
    <form ref={ref} onSubmit={onSubmit} className={box}>
      <h3 className="font-bold">Đổi mật khẩu</h3>
      <Field label="Mật khẩu hiện tại" htmlFor="cp-cur"><Input id="cp-cur" name="current" type="password" autoComplete="current-password" className="h-11 text-base" required /></Field>
      <Field label="Mật khẩu mới" htmlFor="cp-new" hint="8–128 ký tự, không quá phổ biến, không chỉ toàn số"><Input id="cp-new" name="next" type="password" autoComplete="new-password" className="h-11 text-base" required /></Field>
      <Field label="Nhập lại mật khẩu mới" htmlFor="cp-conf"><Input id="cp-conf" name="confirm" type="password" autoComplete="new-password" className="h-11 text-base" required /></Field>
      <Msg s={state} />
      <Button type="submit" className="h-11" disabled={disabled}>{pending ? "Đang đổi…" : "Đổi mật khẩu"}</Button>
    </form>
  );
}

export function ChangeEmailForm({ current }: { current: string | null }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(changeEmailAction, { resetOnSuccess: true });
  return (
    <form ref={ref} onSubmit={onSubmit} className={box}>
      <h3 className="font-bold">Email khôi phục mật khẩu</h3>
      <p className="text-sm text-muted-foreground">{current ? `Hiện tại: ${current}` : "Chưa có email thật. Thêm email để có thể tự đặt lại mật khẩu khi quên."}</p>
      <Field label={current ? "Email mới" : "Email"} htmlFor="ce-email"><Input id="ce-email" name="email" type="email" autoComplete="email" className="h-11 text-base" required /></Field>
      <Field label="Mật khẩu hiện tại (để xác nhận)" htmlFor="ce-pw"><Input id="ce-pw" name="password" type="password" autoComplete="current-password" className="h-11 text-base" required /></Field>
      <Msg s={state} />
      <Button type="submit" className="h-11" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu email"}</Button>
    </form>
  );
}

export function SessionsCard({ count }: { count: number }) {
  return (
    <div className={box}>
      <h3 className="font-bold">Thiết bị đang đăng nhập</h3>
      <p className="text-sm text-muted-foreground">Tài khoản đang đăng nhập trên {count} thiết bị/trình duyệt.</p>
      {count > 1 && <ActionButton action={revokeOtherSessionsAction} confirm="Đăng xuất tất cả thiết bị khác?" className="bg-white">Đăng xuất các thiết bị khác</ActionButton>}
    </div>
  );
}
