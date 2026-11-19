"use client";

import Link from "next/link";
import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormState } from "@/app/(auth)/actions";

type Props = {
  mode: "login" | "register";
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  next?: string;
};

export function AuthForm({ mode, action, next }: Props) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(action);
  const isLogin = mode === "login";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{isLogin ? "Đăng nhập" : "Tạo tài khoản"}</CardTitle>
        <CardDescription>
          {isLogin
            ? "Dùng SĐT hoặc email đã đăng ký"
            : "Một tài khoản dùng được cho cả Chủ nhà và CTV"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={ref} onSubmit={onSubmit} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          {isLogin ? (
            <div className="space-y-2">
              <Label htmlFor="identifier">SĐT hoặc Email</Label>
              <Input id="identifier" name="identifier" autoComplete="username" className="h-11 text-base" required />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName">Họ và tên</Label>
                <Input id="fullName" name="fullName" autoComplete="name" className="h-11 text-base" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="h-11 text-base" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (không bắt buộc)</Label>
                <Input id="email" name="email" type="email" autoComplete="email" className="h-11 text-base" />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="h-11 text-base"
              required
            />
          </div>
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11 w-full" disabled={disabled}>
            {pending ? "Đang xử lý…" : isLogin ? "Đăng nhập" : "Đăng ký"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
            <Link href={`${isLogin ? "/register" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline">
              {isLogin ? "Đăng ký" : "Đăng nhập"}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
