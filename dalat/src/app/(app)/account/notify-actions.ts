"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createTelegramLinkToken } from "@/lib/telegram";

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
