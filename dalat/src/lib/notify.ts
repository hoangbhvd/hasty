import { prisma } from "@/lib/db";
import { emitToUsers } from "@/lib/realtime";
import { sendTelegram } from "@/lib/telegram";
import { sendPush } from "@/lib/push";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Thông báo tới người dùng qua 3 kênh độc lập: socket (toast trong app), Telegram, Web Push.
 * Mỗi kênh lỗi riêng, không kênh nào được làm hỏng nghiệp vụ gọi nó.
 */
export async function notifyUsers(userIds: (string | null | undefined)[], text: string, href?: string, opts: { skipToast?: boolean } = {}) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const url = href ? (href.startsWith("http") ? href : `${appUrl()}${href}`) : undefined;
  console.log(`[notify] -> ${ids.join(",")}: ${text}${href ? ` (${href})` : ""}`);

  await Promise.allSettled([
    opts.skipToast ? Promise.resolve() : emitToUsers(ids, "notify", { text, href }),
    (async () => {
      const users = await prisma.user.findMany({ where: { id: { in: ids }, telegramChatId: { not: null } }, select: { telegramChatId: true } });
      await Promise.allSettled(users.map((u) => sendTelegram(u.telegramChatId!, text, url)));
    })(),
    Promise.allSettled(ids.map((id) => sendPush(id, { title: "Đà Lạt Homestay", body: text, url: href ?? "/" }))),
  ]);
}
