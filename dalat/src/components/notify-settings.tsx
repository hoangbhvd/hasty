"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { createTelegramLinkAction, unlinkTelegramAction } from "@/app/(app)/account/notify-actions";

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

export function PushCard({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"checking" | "unsupported" | "off" | "on" | "denied">("checking");
  const [error, setError] = useState<string>();

  useEffect(() => {
    (async () => {
      if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      setState((await reg?.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  async function enable() {
    setError(undefined);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("Máy chủ từ chối đăng ký");
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không bật được thông báo");
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

  return (
    <div className="space-y-2 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
      <h3 className="font-bold">Thông báo trên thiết bị này</h3>
      <p className="text-sm text-muted-foreground">
        {state === "unsupported" ? "Thiết bị/trình duyệt này chưa hỗ trợ (hoặc hệ thống chưa cấu hình Web Push). Trên iPhone, hãy “Thêm vào Màn hình chính” trước."
          : state === "denied" ? "Bạn đã chặn thông báo. Hãy bật lại trong cài đặt trình duyệt."
          : state === "on" ? "✅ Đang bật." : "Nhận thông báo ngay cả khi không mở app."}
      </p>
      {state === "off" && <Button type="button" className="h-10" onClick={enable}>Bật thông báo</Button>}
      {state === "on" && <Button type="button" variant="outline" className="h-10" onClick={disable}>Tắt trên thiết bị này</Button>}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
