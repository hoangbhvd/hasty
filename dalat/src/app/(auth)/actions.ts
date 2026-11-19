"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone, phoneToInternalEmail } from "@/lib/phone";
import { setMode } from "@/lib/mode";

export type FormState = { error?: string } | undefined;

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Nhập SĐT hoặc email"),
  password: z.string().min(1, "Nhập mật khẩu"),
});

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { identifier, password } = parsed.data;

  let email = identifier.toLowerCase();
  if (!identifier.includes("@")) {
    const phone = normalizePhone(identifier);
    if (!phone) return { error: "Số điện thoại không hợp lệ" };
    const user = await prisma.user.findUnique({ where: { phone }, select: { email: true } });
    if (!user) return { error: "Sai thông tin đăng nhập" };
    email = user.email;
  }

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) return { error: "Sai thông tin đăng nhập" };
    throw e;
  }
  redirect("/");
}

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Nhập họ tên"),
  phone: z.string().trim().min(1, "Nhập số điện thoại"),
  email: z.union([z.literal(""), z.email("Email không hợp lệ")]),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
});

export async function registerAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fullName, password } = parsed.data;

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: "Số điện thoại không hợp lệ" };
  const email = (parsed.data.email || phoneToInternalEmail(phone)).toLowerCase();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }] },
    select: { id: true },
  });
  if (existing) return { error: "SĐT hoặc email đã được đăng ký" };

  try {
    await auth.api.signUpEmail({
      body: { name: fullName, email, password, phone },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) return { error: e.message || "Không đăng ký được" };
    throw e;
  }
  await setMode("host");
  redirect("/");
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
