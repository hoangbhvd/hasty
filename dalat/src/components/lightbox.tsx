"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { MediaDto } from "@/lib/albums-core";

export type LightboxTab = { key: string; name: string; media: MediaDto[] };

/**
 * Xem toàn màn hình: vuốt trái/phải, chụm 2 ngón để phóng to (kéo để di chuyển khi đã phóng), chạm đúp để phóng/thu,
 * phát video, hiện "3 / 12", chuyển nhanh giữa các bộ ảnh bằng thanh tab phía trên. Chỉ tải ảnh nét của tấm đang xem (+ tấm kế bên).
 */
export function Lightbox({ tabs, tab: initialTab, index: initialIndex, onClose }: { tabs: LightboxTab[]; tab: string; index: number; onClose: () => void }) {
  const [tab, setTab] = useState(initialTab);
  const [index, setIndex] = useState(initialIndex);
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const cur = tabs.find((t) => t.key === tab) ?? tabs[0];
  const items = cur.media;
  const item = items[index];
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; startX: number; startY: number; ox: number; oy: number; moved: boolean; lastTap: number }>({ dist: 0, s: 1, startX: 0, startY: 0, ox: 0, oy: 0, moved: false, lastTap: 0 });

  const go = useCallback((d: number) => {
    setZ({ s: 1, x: 0, y: 0 });
    setIndex((i) => Math.min(Math.max(i + d, 0), Math.max(items.length - 1, 0)));
  }, [items.length]);
  const pickTab = (key: string) => { setTab(key); setIndex(0); setZ({ s: 1, x: 0, y: 0 }); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);

  const dist = () => { const [a, b] = [...ptrs.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (ptrs.current.size === 2) { g.dist = dist(); g.s = z.s; }
    else { g.startX = e.clientX; g.startY = e.clientY; g.ox = z.x; g.oy = z.y; g.moved = false; }
  };
  const move = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (ptrs.current.size === 2) {
      setZ((c) => ({ ...c, s: Math.min(Math.max((g.s * dist()) / (g.dist || 1), 1), 5) }));
      g.moved = true;
    } else if (z.s > 1) {
      g.moved = true;
      setZ((c) => ({ ...c, x: g.ox + e.clientX - g.startX, y: g.oy + e.clientY - g.startY }));
    }
  };
  const up = (e: React.PointerEvent) => {
    const g = gesture.current;
    const wasSingle = ptrs.current.size === 1;
    ptrs.current.delete(e.pointerId);
    if (!wasSingle) return;
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    if (z.s <= 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) return go(dx < 0 ? 1 : -1); // vuốt
    if (!g.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) { // chạm đúp
      const now = Date.now();
      if (now - g.lastTap < 300) setZ((c) => (c.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }));
      g.lastTap = now;
    }
  };

  if (!item) return null;
  const near = [items[index - 1], items[index + 1]].filter((m): m is MediaDto => !!m && m.type === "IMAGE");

  return (
    <div role="dialog" aria-modal="true" aria-label="Xem ảnh" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-2 p-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.key === cur.key} onClick={() => pickTab(t.key)}
              className={`h-9 shrink-0 rounded-full border border-white px-3 text-sm ${t.key === cur.key ? "bg-primary font-semibold text-black" : "bg-black text-white"}`}>{t.name}</button>
          ))}
        </div>
        <span className="money-num shrink-0 text-sm" aria-live="polite">{index + 1} / {items.length}</span>
        <button type="button" aria-label="Đóng" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full border border-white"><X className="size-5" /></button>
      </div>

      <div className="relative flex-1 touch-none select-none overflow-hidden" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {item.type === "VIDEO" ? (
          <video key={item.id} src={item.url} controls autoPlay playsInline className="absolute inset-0 size-full object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.id} src={item.url} alt={`${cur.name} ${index + 1}`} draggable={false}
            style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`, backgroundImage: `url(${item.thumb})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
            className="absolute inset-0 size-full object-contain transition-transform duration-75"
          />
        )}
        <button type="button" aria-label="Ảnh trước" disabled={index === 0} onClick={() => go(-1)} className="absolute top-1/2 left-2 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-white bg-black/60 disabled:opacity-30 md:grid"><ChevronLeft /></button>
        <button type="button" aria-label="Ảnh sau" disabled={index === items.length - 1} onClick={() => go(1)} className="absolute top-1/2 right-2 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-white bg-black/60 disabled:opacity-30 md:grid"><ChevronRight /></button>
      </div>
      {/* tải trước ảnh kế bên để vuốt không bị chờ */}
      <div hidden>
        {near.map((m) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={m.url} alt="" />
        ))}
      </div>
    </div>
  );
}
