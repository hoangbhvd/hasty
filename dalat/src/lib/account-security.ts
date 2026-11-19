import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { clear, fail, hit, isBlocked, keyOf, RULES, waitText } from "@/lib/rate-limit";
import { isRealEmail } from "@/lib/mailer";
import { normalizePhone } from "@/lib/phone";
import { validatePassword } from "@/lib/password-policy";

/** Chuẩn hoá định danh để không né giới hạn bằng cách đổi cách viết (0912… / +84912… / hoa thường). */
export function normalizeIdentifier(raw: string): { kind: "email" | "phone"; value: string } | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("@")) return { kind: "email", value: s.toLowerCase() };
  const phone = normalizePhone(s);
  return phone ? { kind: "phone", value: phone } : null;
}

const blockedMsg = (sec: number) => `Thử sai quá nhiều lần. Vui lòng thử lại sau ${waitText(sec)}.`;

// ───────── Đăng nhập ─────────
/** Trả về thông báo lỗi nếu đang bị khoá (theo tài khoản hoặc theo IP), ngược lại null. */
export async function loginBlocked(idKey: string, ip: string): Promise<string | null> {
  const [a, b] = await Promise.all([
    isBlocked(keyOf("login:id", idKey), RULES.loginFailPerAccount),
    isBlocked(keyOf("login:ip", ip), RULES.loginFailPerIp),
  ]);
  const v = !a.allowed ? a : !b.allowed ? b : null;
  return v ? blockedMsg(v.retryAfterSec) : null;
}
export async function loginFailed(idKey: string, ip: string) {
  await Promise.all([fail(keyOf("login:id", idKey), RULES.loginFailPerAccount), fail(keyOf("login:ip", ip), RULES.loginFailPerIp)]);
}
export const loginSucceeded = (idKey: string) => clear(keyOf("login:id", idKey)); // chỉ xoá khoá tài khoản; khoá IP tự hết hạn

/** Tốn thời gian băm như khi đăng nhập thật, để không dò được tài khoản nào tồn tại qua độ trễ. */
export async function burnPasswordHash(password: string) {
  await (await auth.$context).password.hash(password);
}

// ───────── Đăng ký ─────────
export async function registerBlocked(ip: string): Promise<string | null> {
  const v = await hit(keyOf("register:ip", ip), RULES.registerPerIp);
  return v.allowed ? null : blockedMsg(v.retryAfterSec);
}

// ───────── Quên / đặt lại mật khẩu ─────────
export const FORGOT_MESSAGE = "Nếu tài khoản tồn tại và có email thật hoặc Telegram đã kết nối, chúng tôi đã gửi link đặt lại mật khẩu (hiệu lực 30 phút).";

/** Phản hồi LUÔN giống nhau dù tài khoản có tồn tại hay không (chống dò tài khoản). */
export async function requestReset(identifier: string, ip: string): Promise<{ error?: string; message?: string }> {
  const id = normalizeIdentifier(identifier);
  if (!id) return { error: "Nhập SĐT hoặc email hợp lệ" };

  const [byIp, byAccount] = await Promise.all([
    hit(keyOf("forgot:ip", ip), RULES.forgotPerIp),
    hit(keyOf("forgot:id", id.value), RULES.forgotPerAccount),
  ]);
  const wait = !byIp.allowed ? byIp.retryAfterSec : !byAccount.allowed ? byAccount.retryAfterSec : 0;
  if (wait) return { error: `Bạn yêu cầu quá nhiều lần. Vui lòng thử lại sau ${waitText(wait)}.` };

  const user = await prisma.user.findFirst({ where: id.kind === "phone" ? { phone: id.value } : { email: id.value }, select: { email: true } });
  if (user) {
    try {
      await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "/reset-password" } });
    } catch (e) {
      console.error("[reset] không tạo được yêu cầu:", (e as Error).message); // không báo lỗi ra ngoài
    }
  }
  return { message: FORGOT_MESSAGE };
}

export type ResetResult = { ok: true } | { ok: false; error: string };

export async function resetPassword(token: string, newPassword: string, ip: string): Promise<ResetResult> {
  const v = await hit(keyOf("reset:ip", ip), RULES.resetPerIp);
  if (!v.allowed) return { ok: false, error: blockedMsg(v.retryAfterSec) };
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return { ok: false, error: "Link không hợp lệ hoặc đã hết hạn" };

  // Biết token thuộc ai để kiểm tra mật khẩu không chứa SĐT/email của chính họ
  const ver = await prisma.verification.findFirst({ where: { identifier: `reset-password:${token}`, expiresAt: { gt: new Date() } }, select: { value: true } });
  const owner = ver ? await prisma.user.findUnique({ where: { id: ver.value }, select: { phone: true, email: true, fullName: true } }) : null;
  const bad = validatePassword(newPassword, { phone: owner?.phone, email: owner?.email, name: owner?.fullName });
  if (bad) return { ok: false, error: bad };

  try {
    await auth.api.resetPassword({ body: { newPassword, token } });
    // Chủ tài khoản đã chứng minh quyền sở hữu (qua kênh nhận link) → gỡ khoá đăng nhập để vào ngay bằng mật khẩu mới
    if (owner?.phone) await clear(keyOf("login:id", owner.phone));
    if (isRealEmail(owner?.email)) await clear(keyOf("login:id", owner!.email));
    return { ok: true };
  } catch {
    return { ok: false, error: "Link không hợp lệ hoặc đã hết hạn" };
  }
}
