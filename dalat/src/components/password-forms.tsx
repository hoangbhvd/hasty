"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSafeForm } from "@/lib/use-safe-form";
import { forgotPasswordAction, resetPasswordAction } from "@/app/(auth)/actions";

export function ForgotForm() {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(forgotPasswordAction);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Quên mật khẩu</CardTitle>
        <CardDescription>Nhập SĐT hoặc email của tài khoản. Link đặt lại được gửi qua email thật hoặc Telegram đã kết nối với tài khoản.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={ref} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="identifier">SĐT hoặc Email</Label>
            <Input id="identifier" name="identifier" autoComplete="username" className="h-11 text-base" required />
          </div>
          {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
          {state?.message && <p role="status" className="rounded border border-black bg-status-confirmed-bg p-3 text-sm font-medium">{state.message}</p>}
          <Button type="submit" size="lg" className="h-11 w-full" disabled={disabled}>{pending ? "Đang gửi…" : "Gửi link đặt lại"}</Button>
          <p className="text-xs text-muted-foreground">Tài khoản chỉ có SĐT và chưa kết nối Telegram thì không nhận được link. Hãy liên hệ quản trị viên.</p>
          <p className="text-center text-sm"><Link href="/login" className="font-medium underline">← Quay lại đăng nhập</Link></p>
        </form>
      </CardContent>
    </Card>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(resetPasswordAction);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Đặt mật khẩu mới</CardTitle>
        <CardDescription>8–128 ký tự, không quá phổ biến, không chỉ toàn số. Sau khi đổi, mọi thiết bị sẽ bị đăng xuất.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={ref} onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu mới</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" className="h-11 text-base" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Nhập lại mật khẩu</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" className="h-11 text-base" required />
          </div>
          {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
          <Button type="submit" size="lg" className="h-11 w-full" disabled={disabled}>{pending ? "Đang lưu…" : "Đổi mật khẩu"}</Button>
          <p className="text-center text-sm"><Link href="/forgot-password" className="font-medium underline">Gửi lại link mới</Link></p>
        </form>
      </CardContent>
    </Card>
  );
}
