"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { phoneToInternalEmail } from "@/lib/phone";
import { setMode } from "@/lib/mode";
import { clientIp } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password-policy";
import {
  burnPasswordHash, loginBlocked, loginFailed, loginSucceeded, normalizeIdentifier, registerBlocked, requestReset, resetPassword,
} from "@/lib/account-security";

export type FormState = { error?: string; message?: string } | undefined;

/** Chỉ cho phép redirect nội bộ (chống open redirect). */
function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") ? s : "/";
}

const BAD_LOGIN = "Sai thông tin đăng nhập";

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Nhập SĐT hoặc email").max(200),
  password: z.string().min(1, "Nhập mật khẩu").max(128),
});

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { password } = parsed.data;

  const id = normalizeIdentifier(parsed.data.identifier);
  if (!id) return { error: "Nhập SĐT hoặc email hợp lệ" };
  const h = await headers();
  const ip = clientIp(h);

  // Khoá tạm khi thử sai quá nhiều (theo tài khoản và theo IP)
  const blocked = await loginBlocked(id.value, ip);
  if (blocked) return { error: blocked };

  const user = await prisma.user.findFirst({ where: id.kind === "phone" ? { phone: id.value } : { email: id.value }, select: { email: true } });
  if (!user) {
    await burnPasswordHash(password); // cùng độ trễ với trường hợp sai mật khẩu → không dò được tài khoản nào tồn tại
    await loginFailed(id.value, ip);
    return { error: BAD_LOGIN };
  }

  try {
    await auth.api.signInEmail({ body: { email: user.email, password }, headers: h });
  } catch (e) {
    if (e instanceof APIError) {
      await loginFailed(id.value, ip);
      return { error: BAD_LOGIN };
    }
    throw e;
  }
  await loginSucceeded(id.value);
  redirect(safeNext(formData.get("next")));
}

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Nhập họ tên").max(100),
  phone: z.string().trim().min(1, "Nhập số điện thoại"),
  email: z.union([z.literal(""), z.email("Email không hợp lệ")]),
  password: z.string().max(128, "Mật khẩu tối đa 128 ký tự"),
});

export async function registerAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fullName, password } = parsed.data;

  const phoneId = normalizeIdentifier(parsed.data.phone);
  if (!phoneId || phoneId.kind !== "phone") return { error: "Số điện thoại không hợp lệ" };
  const phone = phoneId.value;
  const email = (parsed.data.email || phoneToInternalEmail(phone)).toLowerCase();

  const policy = validatePassword(password, { phone, email: parsed.data.email || null, name: fullName });
  if (policy) return { error: policy };

  const blocked = await registerBlocked(clientIp(await headers()));
  if (blocked) return { error: blocked };

  const existing = await prisma.user.findFirst({ where: { OR: [{ phone }, { email }] }, select: { id: true } });
  if (existing) return { error: "SĐT hoặc email đã được đăng ký" };

  try {
    await auth.api.signUpEmail({ body: { name: fullName, email, password, phone }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) return { error: e.message || "Không đăng ký được" };
    throw e;
  }
  await setMode("host");
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

// ───────── Quên / đặt lại mật khẩu ─────────
export async function forgotPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const identifier = String(formData.get("identifier") ?? "");
  return requestReset(identifier, clientIp(await headers()));
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { error: "Hai mật khẩu không khớp" };
  const r = await resetPassword(token, password, clientIp(await headers()));
  if (!r.ok) return { error: r.error };
  redirect("/login?reset=1");
}
