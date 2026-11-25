"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { MediaDto } from "@/lib/albums-core";

const MAX_FILES = 30;
const MAX_BYTES = 150 * 1024 * 1024; // tổng dung lượng chuẩn bị trong bộ nhớ điện thoại

/**
 * Gửi cả bộ ảnh + video dạng FILE (không phải link) qua bảng chia sẻ của điện thoại → chọn Zalo, khách xem ảnh ngay trong chat.
 * Hai bước vì Safari/Chrome chỉ cho mở bảng chia sẻ ngay sau thao tác chạm: bước 1 tải ảnh về máy, bước 2 mở bảng chia sẻ.
 */
export function ShareImagesButton({ media, name, zipHref }: { media: MediaDto[]; name: string; zipHref: string }) {
  const images = media.slice(0, MAX_FILES); // gồm cả video
  const [files, setFiles] = useState<File[] | null>(null);
  const [seq, setSeq] = useState<number | null>(null); // chế độ gửi từng file (khi app nhận chỉ lấy được 1 file/lần)
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState<string>();
  const [forKey, setForKey] = useState("");
  const key = images.map((m) => m.id).join(",");
  // Đổi bộ ảnh (hoặc thêm/xoá ảnh) thì bỏ file đã chuẩn bị
  if (forKey !== key) { setForKey(key); setFiles(null); setSeq(null); setNote(undefined); }
  if (images.length === 0) return null;

  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  async function prepare() {
    setNote(undefined);
    const out: File[] = [];
    let bytes = 0, skipped = 0;
    try {
      for (const [i, m] of images.entries()) {
        setBusy(`Đang chuẩn bị ${i + 1}/${images.length}…`);
        const res = await fetch(`/api/media/${m.id}/download`);
        if (!res.ok) throw new Error("Không tải được ảnh");
        const blob = await res.blob();
        if (bytes + blob.size > MAX_BYTES) { skipped++; continue; }
        bytes += blob.size;
        const video = m.type === "VIDEO";
        const type = blob.type || (video ? "video/mp4" : "image/jpeg");
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("quicktime") ? "mov" : video ? "mp4" : "jpg";
        out.push(new File([blob], `${name.replace(/[^\p{L}\p{N}]+/gu, "-")}-${i + 1}.${ext}`, { type }));
      }
    } catch (e) {
      setBusy(undefined);
      setNote(e instanceof Error ? e.message : "Lỗi tải ảnh");
      return;
    }
    setBusy(undefined);
    if (skipped > 0) setNote(`Bỏ qua ${skipped} file vì tổng dung lượng quá lớn (tối đa ${MAX_BYTES / 1024 / 1024}MB mỗi lần).`);
    if (out.length === 0) return;
    if (!navigator.canShare?.({ files: out })) {
      setNote("Thiết bị này chưa hỗ trợ gửi ảnh trực tiếp. Dùng “Tải bộ ảnh này” rồi chọn ảnh trong Zalo.");
      return;
    }
    setFiles(out);
  }

  async function share(list: File[]) {
    try {
      await navigator.share({ files: list }); // không kèm title/text: một số app chỉ lấy 1 mục khi có thêm văn bản
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // người dùng đóng bảng chia sẻ
      setNote("Không mở được bảng chia sẻ. Hãy thử lại hoặc dùng “Tải bộ ảnh này”.");
      return false;
    }
    return true;
  }

  async function shareNext() {
    if (!files || seq === null) return;
    if (await share([files[seq]])) setSeq(seq + 1 < files.length ? seq + 1 : null);
  }

  return (
    <>
      {files && seq !== null ? (
        <button type="button" onClick={shareNext} className="brutal-btn inline-flex h-10 items-center gap-1 bg-primary px-3 text-sm text-black">
          <Send className="size-4" /> Gửi file {seq + 1}/{files.length}
        </button>
      ) : files ? (
        <>
          <button type="button" onClick={() => share(files)} className="brutal-btn inline-flex h-10 items-center gap-1 bg-primary px-3 text-sm text-black">
            <Send className="size-4" /> Gửi {files.length} file qua Zalo
          </button>
          {files.length > 1 && (
            <button type="button" onClick={() => setSeq(0)} className="h-10 px-1 text-sm underline">Zalo chỉ nhận 1 file? Gửi từng file</button>
          )}
        </>
      ) : (
        <button type="button" onClick={prepare} disabled={!!busy} className="brutal-btn inline-flex h-10 items-center gap-1 bg-white px-3 text-sm text-black disabled:opacity-60">
          <Send className="size-4" /> {busy ?? "Gửi ảnh/video qua Zalo"}
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
