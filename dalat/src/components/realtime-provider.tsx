"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { closeSocket, getSocket } from "@/lib/socket-client";

type Toast = { id: number; text: string; href?: string };
const Ctx = createContext<{ unread: number; refreshUnread: () => void }>({ unread: 0, refreshUnread: () => {} });
export const useUnread = () => useContext(Ctx);

/** Kết nối socket 1 lần ở khung ứng dụng: đếm tin chưa đọc, hiện toast thông báo, làm mới trang khi booking đổi. */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshUnread = useCallback(() => {
    fetch("/api/chat/unread").then((r) => (r.ok ? r.json() : null)).then((j) => j && setUnread(j.count)).catch(() => {});
  }, []);

  // Đổi trang (vd. vào 1 cuộc trò chuyện → tin được đánh dấu đã đọc) thì đếm lại
  useEffect(() => { refreshUnread(); }, [pathname, refreshUnread]);

  useEffect(() => {
    const s = getSocket();
    refreshUnread();
    const onMessage = () => refreshUnread();
    const onNotify = (p: { text: string; href?: string }) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, text: p.text, href: p.href }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
    };
    // Gom nhiều sự kiện booking liên tiếp thành 1 lần làm mới
    const onBooking = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    s.on("chat:message", onMessage);
    s.on("chat:update", onMessage);
    s.on("notify", onNotify);
    s.on("booking:update", onBooking);
    s.on("request:new", onBooking);
    s.on("request:offer", onBooking);
    return () => {
      s.off("chat:message", onMessage); s.off("chat:update", onMessage); s.off("notify", onNotify); s.off("booking:update", onBooking); s.off("request:new", onBooking); s.off("request:offer", onBooking);
      clearTimeout(timer.current);
      closeSocket();
    };
  }, [refreshUnread, router]);

  return (
    <Ctx.Provider value={{ unread, refreshUnread }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed top-3 right-3 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto rounded border border-black bg-white p-3 text-sm shadow-brutal">
            {t.href ? <a href={t.href} className="font-medium underline">{t.text}</a> : t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
