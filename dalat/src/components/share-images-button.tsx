"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { MediaDto } from "@/lib/albums-core";

const MAX_FILES = 30;

/**
 * Gửi cả bộ ảnh dạng FILE (không phải link) qua bảng chia sẻ của điện thoại → chọn Zalo, khách xem ảnh ngay trong chat.
 * Hai bước vì Safari/Chrome chỉ cho mở bảng chia sẻ ngay sau thao tác chạm: bước 1 tải ảnh về máy, bước 2 mở bảng chia sẻ.
 */
export function ShareImagesButton({ media, name, zipHref }: { media: MediaDto[]; name: string; zipHref: string }) {
  const images = media.filter((m) => m.type === "IMAGE").slice(0, MAX_FILES);
  const [files, setFiles] = useState<File[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState<string>();
  const [forKey, setForKey] = useState("");
  const key = images.map((m) => m.id).join(",");
  // Đổi bộ ảnh (hoặc thêm/xoá ảnh) thì bỏ file đã chuẩn bị
  if (forKey !== key) { setForKey(key); setFiles(null); setNote(undefined); }
  if (images.length === 0) return null;

  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  async function prepare() {
    setNote(undefined);
    const out: File[] = [];
    try {
      for (const [i, m] of images.entries()) {
        setBusy(`Đang chuẩn bị ${i + 1}/${images.length}…`);
        const res = await fetch(`/api/media/${m.id}/download`);
        if (!res.ok) throw new Error("Không tải được ảnh");
        const blob = await res.blob();
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        out.push(new File([blob], `${name.replace(/[^\p{L}\p{N}]+/gu, "-")}-${i + 1}.${ext}`, { type: blob.type || "image/jpeg" }));
      }
    } catch (e) {
      setBusy(undefined);
      setNote(e instanceof Error ? e.message : "Lỗi tải ảnh");
      return;
    }
    setBusy(undefined);
    if (!navigator.canShare?.({ files: out })) {
      setNote("Thiết bị này chưa hỗ trợ gửi ảnh trực tiếp. Dùng “Tải bộ ảnh này” rồi chọn ảnh trong Zalo.");
      return;
    }
    setFiles(out);
  }

  async function share() {
    if (!files) return;
    try {
      await navigator.share({ files, title: name });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // người dùng đóng bảng chia sẻ
      setNote("Không mở được bảng chia sẻ. Hãy thử lại hoặc dùng “Tải bộ ảnh này”.");
    }
  }

  return (
    <>
      {files ? (
        <button type="button" onClick={share} className="brutal-btn inline-flex h-10 items-center gap-1 bg-primary px-3 text-sm text-black">
          <Send className="size-4" /> Gửi {files.length} ảnh qua Zalo
        </button>
      ) : (
        <button type="button" onClick={prepare} disabled={!!busy} className="brutal-btn inline-flex h-10 items-center gap-1 bg-white px-3 text-sm text-black disabled:opacity-60">
          <Send className="size-4" /> {busy ?? "Gửi ảnh qua Zalo"}
        </button>
      )}
      {note && (
        <p role="status" className="basis-full rounded border border-black bg-status-holding p-2 text-sm font-medium">
          {note} {!canShareFiles && <a href={zipHref} className="underline">Tải .zip</a>}
        </p>
      )}
      {media.length > MAX_FILES && files && <p className="basis-full text-xs text-muted-foreground">Chỉ gửi {MAX_FILES} ảnh đầu của bộ (giới hạn của Zalo/điện thoại).</p>}
    </>
  );
}
