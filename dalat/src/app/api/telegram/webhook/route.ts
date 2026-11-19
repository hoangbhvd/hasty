import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleTelegramUpdate, sendTelegram } from "@/lib/telegram";

/** Webhook Telegram. Bắt buộc có TELEGRAM_WEBHOOK_SECRET và header X-Telegram-Bot-Api-Secret-Token khớp. */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook chưa được cấu hình" }, { status: 503 });
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const a = Buffer.from(got), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const update = await req.json().catch(() => null);
  if (!update || typeof update !== "object") return NextResponse.json({ ok: true });
  const r = await handleTelegramUpdate(update).catch((e) => { console.error("[telegram] webhook:", e); return null; });
  if (r) await sendTelegram(r.chatId, r.reply);
  return NextResponse.json({ ok: true }); // luôn 200 để Telegram không gửi lại
}
