"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { createTelegramLinkAction, sendTestPushAction, unlinkTelegramAction } from "@/app/(app)/account/notify-actions";
import { pushSupport, type PushSupport } from "@/lib/push-support";

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function TelegramCard({ linked }: { linked: boolean }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function connect() {
    setBusy(true); setError(undefined);
    const r = await createTelegramLinkAction();
    setBusy(false);
    if (r.url) window.open(r.url, "_blank", "noopener");
    else setError(r.error);
  }
  return (
    <div className="space-y-2 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
      <h3 className="font-bold">Telegram</h3>
      <p className="text-sm text-muted-foreground">{linked ? "✅ Đã kết nối — bạn nhận thông báo booking, chat và tìm gấp qua Telegram." : "Nhận thông báo kèm link mở thẳng booking/chat."}</p>
      <div className="flex flex-wrap gap-2">
        {!linked && <Button type="button" className="h-10" disabled={busy} onClick={connect}>{busy ? "Đang tạo…" : "Kết nối Telegram"}</Button>}
        {!linked && <Button type="button" variant="outline" className="h-10" onClick={() => router.refresh()}>Tôi đã bấm Start</Button>}
        {linked && <ActionButton action={unlinkTelegramAction} confirm="Ngắt kết nối Telegram?" className="bg-white">Ngắt kết nối</ActionButton>}
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}

const SUPPORT_TEXT: Record<Exclude<PushSupport, "ok" | "ios-install">, string> = {
  unconfigured: "Hệ thống chưa cấu hình Web Push (thiếu khoá VAPID). Liên hệ quản trị.",
  "ios-old": "iPhone cần iOS 16.4 trở lên để nhận thông báo. Hãy cập nhật iOS rồi thử lại.",
  unsupported: "Trình duyệt này chưa hỗ trợ thông báo đẩy. Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới.",
};

export function PushCard({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"checking" | PushSupport | "off" | "on" | "denied">("checking");
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const support = pushSupport({
        vapidKey, ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
        standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches,
        hasServiceWorker: "serviceWorker" in navigator, hasPushManager: "PushManager" in window,
      });
      if (support !== "ok") return setState(support);
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      setState((await reg?.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  async function enable() {
    setError(undefined); setInfo(undefined); setBusy(true);
    try {
      // Phải gọi trực tiếp từ thao tác bấm nút (iOS bắt buộc)
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Chưa sẵn sàng, hãy tải lại trang rồi thử lại")), 8000)),
      ]);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("Máy chủ từ chối đăng ký");
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không bật được thông báo");
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }
  async function test() {
    setError(undefined); setInfo(undefined); setBusy(true);
    const r = await sendTestPushAction();
    setBusy(false);
    if (r.error) setError(r.error); else setInfo("Đã gửi thông báo thử. Nếu chưa thấy, hãy thoát khỏi app rồi chờ vài giây.");
  }

  return (
    <div className="space-y-2 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
      <h3 className="font-bold">Thông báo trên thiết bị này</h3>
      {state === "ios-install" ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">iPhone chỉ nhận thông báo khi app được cài ra Màn hình chính. Làm 4 bước:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Mở trang này bằng <b>Safari</b> (không dùng trình duyệt trong Zalo/Facebook).</li>
            <li>Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên ↑) → <b>Thêm vào Màn hình chính</b> → <b>Thêm</b>.</li>
            <li>Mở app từ <b>biểu tượng mới</b> ngoài Màn hình chính (không mở từ Safari).</li>
            <li>Vào <b>Tài khoản</b> → bấm <b>Bật thông báo</b> → chọn <b>Cho phép</b>.</li>
          </ol>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {state === "denied" ? "Bạn đã chặn thông báo. Trên iPhone: Cài đặt → Thông báo → ĐL Homestay → Cho phép. Trên máy tính/Android: bật lại trong cài đặt trình duyệt."
            : state === "on" ? "✅ Đang bật trên thiết bị này."
            : state === "off" ? "Nhận thông báo booking, chat, tìm gấp ngay cả khi không mở app."
            : state === "checking" ? "Đang kiểm tra…"
            : SUPPORT_TEXT[state as keyof typeof SUPPORT_TEXT]}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "off" && <Button type="button" className="h-10" disabled={busy} onClick={enable}>{busy ? "Đang bật…" : "Bật thông báo"}</Button>}
        {state === "on" && <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={test}>🔔 Gửi thử</Button>}
        {state === "on" && <Button type="button" variant="outline" className="h-10" onClick={disable}>Tắt trên thiết bị này</Button>}
      </div>
      {info && <p role="status" className="text-sm font-medium text-green-800">{info}</p>}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
