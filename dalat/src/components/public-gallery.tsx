"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Lightbox } from "@/components/lightbox";
import { galleryTabs, type GalleryDto } from "@/lib/albums-core";

/** Xem ảnh/video sạch bằng link công khai: không nút tải, không giá, không SĐT. */
export function PublicGallery({ gallery }: { gallery: GalleryDto }) {
  const tabs = galleryTabs(gallery);
  const [key, setKey] = useState(tabs[0]?.key ?? "general");
  const [open, setOpen] = useState<number | null>(null);
  const active = tabs.find((t) => t.key === key) ?? tabs[0];
  if (!active) return <p className="text-center text-sm text-muted-foreground">Chưa có ảnh/video.</p>;
  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Bộ ảnh">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.key === active.key} onClick={() => setKey(t.key)}
              className={`h-10 shrink-0 rounded-full border border-black px-4 text-sm ${t.key === active.key ? "bg-primary font-semibold text-black" : "bg-white text-black"}`}>{t.name}</button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {active.media.map((m, i) => (
          <li key={m.id}>
            <button type="button" onClick={() => setOpen(i)} aria-label={`Xem ${m.type === "VIDEO" ? "video" : "ảnh"} ${i + 1}`} className="relative block aspect-square w-full overflow-hidden rounded border border-black bg-muted">
              {m.type === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumb} alt={active.name} loading="lazy" decoding="async" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center bg-black text-white"><Play className="size-8" /></span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox tabs={tabs.map((t) => ({ key: t.key, name: t.name, media: t.media }))} tab={active.key} index={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
