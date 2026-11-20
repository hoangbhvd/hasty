"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createTelegramLinkToken } from "@/lib/telegram";
import { pushEnabled, sendPush } from "@/lib/push";

/** Tạo link t.me/<bot>?start=<mã dùng 1 lần, 15 phút>. */
export async function createTelegramLinkAction(): Promise<{ url?: string; error?: string }> {
  const user = await requireUser();
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!bot || !process.env.TELEGRAM_BOT_TOKEN) return { error: "Chủ hệ thống chưa cấu hình Telegram Bot" };
  const token = await createTelegramLinkToken(user.id);
  return { url: `https://t.me/${bot}?start=${token}` };
}

export async function unlinkTelegramAction(): Promise<{ error?: string }> {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: null } });
  revalidatePath("/account");
  return {};
}

/** Gửi 1 thông báo thử tới mọi thiết bị đã bật của chính người dùng. */
export async function sendTestPushAction(): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!pushEnabled()) return { error: "Hệ thống chưa cấu hình khoá VAPID" };
  const n = await sendPush(user.id, { title: "Đà Lạt Homestay", body: "Thông báo thử: thiết bị của bạn đã nhận được thông báo ✅", url: "/account" });
  return n > 0 ? {} : { error: "Không gửi được tới thiết bị nào. Hãy tắt rồi bật lại thông báo." };
}
