import * as webpush from "web-push";
import { prisma } from "@/lib/db";

export const pushEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@localhost", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

/** Gửi Web Push tới mọi thiết bị của user; xoá subscription đã chết (404/410). `send` để test. */
export async function sendPush(userId: string, payload: { title: string; body: string; url?: string }, send?: Sender): Promise<number> {
  if (!send && !pushEnabled()) return 0;
  if (!send) configure();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let ok = 0;
  for (const s of subs) {
    try {
      await (send ?? ((sub, p) => webpush.sendNotification(sub, p, { TTL: 3600 })))(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload),
      );
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
      else console.error("[push] lỗi:", (e as Error).message);
    }
  }
  return ok;
}
