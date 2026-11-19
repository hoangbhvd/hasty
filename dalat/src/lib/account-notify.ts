import { prisma } from "@/lib/db";
import { isRealEmail, sendMail } from "@/lib/mailer";
import { sendTelegram } from "@/lib/telegram";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Gửi tin bảo mật tới người dùng qua mọi kênh khả dụng: email thật (SMTP) và Telegram (nếu đã liên kết).
 * Trả về các kênh đã gửi được. Không bao giờ ném lỗi.
 */
export async function deliverAccountMessage(userId: string, subject: string, text: string, path?: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, telegramChatId: true } });
  const sent = { email: false, telegram: false };
  if (!u) return sent;
  const url = path ? `${appUrl()}${path}` : undefined;
  const body = url ? `${text}\n\n${url}` : text;
  const [email, tg] = await Promise.all([
    isRealEmail(u.email) ? sendMail(u.email, subject, body) : Promise.resolve(false),
    u.telegramChatId ? sendTelegram(u.telegramChatId, `${subject}\n\n${text}`, url) : Promise.resolve(false),
  ]);
  sent.email = email; sent.telegram = tg;
  if (!email && !tg) console.warn(`[account-notify] không có kênh nào gửi được cho user ${userId} ("${subject}")`);
  return sent;
}

/** Người dùng có kênh nhận link đặt lại mật khẩu không (để báo đúng trên giao diện quản lý tài khoản). */
export async function resetChannels(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, telegramChatId: true } });
  return { email: isRealEmail(u?.email), telegram: !!u?.telegramChatId };
}
