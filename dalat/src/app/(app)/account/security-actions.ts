"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { validatePassword } from "@/lib/password-policy";
import { clear, fail, isBlocked, keyOf, RULES, waitText } from "@/lib/rate-limit";
import { deliverAccountMessage } from "@/lib/account-notify";
import { isRealEmail } from "@/lib/mailer";
import type { FormState } from "@/app/(auth)/actions";

/** Chống dò mật khẩu hiện tại từ 1 phiên bị chiếm: tối đa 5 lần sai / 15 phút cho mỗi tài khoản. */
const attemptKey = (userId: string) => keyOf("pwcheck", userId);

async function verifyCurrentPassword(userId: string, password: string): Promise<string | null> {
  const key = attemptKey(userId);
  const b = await isBlocked(key, RULES.loginFailPerAccount);
  if (!b.allowed) return `Thử sai quá nhiều lần. Vui lòng thử lại sau ${waitText(b.retryAfterSec)}.`;
  const acc = await prisma.account.findFirst({ where: { userId, providerId: "credential" }, select: { password: true } });
  const ok = !!acc?.password && (await (await auth.$context).password.verify({ hash: acc.password, password }));
  if (!ok) { await fail(key, RULES.loginFailPerAccount); return "Mật khẩu hiện tại không đúng"; }
  await clear(key);
  return null;
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "Hai mật khẩu mới không khớp" };
  if (next === current) return { error: "Mật khẩu mới phải khác mật khẩu hiện tại" };
  const bad = validatePassword(next, { phone: user.phone, email: user.email, name: user.fullName });
  if (bad) return { error: bad };

  const wrong = await verifyCurrentPassword(user.id, current);
  if (wrong) return { error: wrong };
  try {
    // Tách 2 bước: changePassword(revokeOtherSessions: true) xoay cookie phiên ngay trong lúc trang đang render lại,
    // khiến trang dùng cookie cũ và bị đẩy sang /login. revokeOtherSessions riêng thì giữ nguyên cookie của phiên hiện tại.
    const h = await headers();
    await auth.api.changePassword({ body: { currentPassword: current, newPassword: next, revokeOtherSessions: false }, headers: h });
    await auth.api.revokeOtherSessions({ headers: h }); // thiết bị khác phải đăng nhập lại
  } catch (e) {
    if (e instanceof APIError) return { error: "Không đổi được mật khẩu" };
    throw e;
  }
  void deliverAccountMessage(user.id, "Mật khẩu đã được đổi", "Mật khẩu tài khoản của bạn vừa được thay đổi. Nếu không phải bạn, hãy đặt lại mật khẩu ngay.");
  return { message: "Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất." };
}

const emailSchema = z.email("Email không hợp lệ").max(200);

/** Thêm/đổi email thật (để nhận link khôi phục). Cần mật khẩu hiện tại: kẻ chiếm phiên tạm thời không đổi được email sang của mình. */
export async function changeEmailAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = emailSchema.safeParse(String(fd.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data;
  if (!isRealEmail(email)) return { error: "Email này không được phép" };
  if (email === user.email.toLowerCase()) return { error: "Đây đã là email hiện tại của bạn" };

  const wrong = await verifyCurrentPassword(user.id, String(fd.get("password") ?? ""));
  if (wrong) return { error: wrong };
  if (await prisma.user.findFirst({ where: { email, id: { not: user.id } }, select: { id: true } })) return { error: "Email đã được dùng bởi tài khoản khác" };

  const old = user.email;
  await prisma.user.update({ where: { id: user.id }, data: { email, emailVerified: false } });
  // Báo cho kênh cũ (email cũ nếu là email thật + Telegram) để chủ tài khoản phát hiện nếu bị đổi trái phép
  void deliverAccountMessage(user.id, "Email tài khoản đã đổi", `Email đăng nhập/khôi phục của bạn vừa đổi thành ${email}. Nếu không phải bạn, hãy đặt lại mật khẩu ngay.`);
  if (isRealEmail(old)) {
    const { sendMail } = await import("@/lib/mailer");
    void sendMail(old, "Email tài khoản đã đổi", `Email tài khoản Đà Lạt Homestay của bạn vừa đổi thành ${email}. Nếu không phải bạn, hãy liên hệ quản trị viên.`);
  }
  revalidatePath("/account");
  return { message: "Đã cập nhật email." };
}

export async function revokeOtherSessionsAction(): Promise<{ error?: string }> {
  await requireUser();
  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
  } catch {
    return { error: "Không thực hiện được, thử lại" };
  }
  revalidatePath("/account");
  return {};
}
