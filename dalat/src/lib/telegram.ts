import { prisma } from "@/lib/db";
import { randomBytes } from "node:crypto";

type Fetch = typeof fetch;
const API = (token: string, method: string) => `${(process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, "")}/bot${token}/${method}`;

export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;

/** Gửi tin Telegram. Nút "Mở" chỉ gắn khi URL là https (Telegram từ chối http/localhost). */
export async function sendTelegram(chatId: string, text: string, url?: string, f: Fetch = fetch): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const body: Record<string, unknown> = { chat_id: chatId, text: url && !url.startsWith("https://") ? `${text}\n${url}` : text, disable_web_page_preview: true };
  if (url?.startsWith("https://")) body.reply_markup = { inline_keyboard: [[{ text: "Mở trong app", url }]] };
  try {
    const r = await f(API(token, "sendMessage"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch (e) {
    console.error("[telegram] gửi lỗi:", (e as Error).message);
    return false;
  }
}

const TOKEN_PREFIX = "telegram-link:";
const TOKEN_TTL_MS = 15 * 60_000;

/** Tạo mã liên kết 1 lần (15 phút) → link t.me/<bot>?start=<mã>. */
export async function createTelegramLinkToken(userId: string): Promise<string> {
  const token = randomBytes(16).toString("hex");
  await prisma.verification.deleteMany({ where: { identifier: { startsWith: TOKEN_PREFIX }, value: userId } });
  await prisma.verification.create({ data: { identifier: TOKEN_PREFIX + token, value: userId, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) } });
  return token;
}

export type TgUpdate = { message?: { text?: string; chat?: { id: number; type: string } } };

/** Xử lý update từ webhook: `/start <mã>` gắn chat_id vào tài khoản. Trả về nội dung trả lời (nếu có). */
export async function handleTelegramUpdate(u: TgUpdate): Promise<{ chatId: string; reply: string } | null> {
  const m = u.message;
  if (!m?.text || !m.chat || m.chat.type !== "private") return null; // chỉ chat riêng, tránh gắn nhầm nhóm
  const chatId = String(m.chat.id);
  const [cmd, arg] = m.text.trim().split(/\s+/);
  if (cmd === "/id") return { chatId, reply: `Chat ID của bạn: ${chatId}\n(Dùng làm ADMIN_TELEGRAM_CHAT_ID để nhận cảnh báo hệ thống.)` };
  if (cmd === "/stop") {
    await prisma.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
    return { chatId, reply: "Đã tắt thông báo Telegram." };
  }
  if (cmd !== "/start") return { chatId, reply: "Gõ /start <mã> từ trang Tài khoản trong app để kết nối, hoặc /stop để tắt thông báo." };
  if (!arg || !/^[0-9a-f]{32}$/.test(arg)) return { chatId, reply: "Mã kết nối không hợp lệ. Hãy bấm “Kết nối Telegram” trong app." };

  const v = await prisma.verification.findFirst({ where: { identifier: TOKEN_PREFIX + arg, expiresAt: { gt: new Date() } } });
  if (!v) return { chatId, reply: "Mã đã hết hạn hoặc đã dùng. Hãy tạo mã mới trong app." };
  // Dùng 1 lần: chỉ request xoá được bản ghi mới được gắn (chống 2 request cùng lúc)
  const del = await prisma.verification.deleteMany({ where: { id: v.id } });
  if (del.count === 0) return { chatId, reply: "Mã đã hết hạn hoặc đã dùng. Hãy tạo mã mới trong app." };

  await prisma.$transaction([
    prisma.user.updateMany({ where: { telegramChatId: chatId, id: { not: v.value } }, data: { telegramChatId: null } }), // 1 chat = 1 tài khoản
    prisma.user.update({ where: { id: v.value }, data: { telegramChatId: chatId } }),
  ]);
  return { chatId, reply: "✅ Đã kết nối! Bạn sẽ nhận thông báo booking, chat và tìm phòng gấp tại đây." };
}
