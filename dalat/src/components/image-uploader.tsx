"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/image-compress";
import { registerAvatarAction, registerCoverAction } from "@/app/(app)/profile-actions";

/** Chọn ảnh → nén/cắt ở trình duyệt → upload thẳng lên R2 → lưu URL. */
export function ImageUploader({
  kind, propertyId, label, r2Ready,
}: { kind: "avatar" | "cover"; propertyId?: string; label: string; r2Ready: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function pick(file: File) {
    setBusy(true); setError(undefined);
    try {
      const { blob, type } = await compressImage(file, kind === "avatar" ? { maxW: 400, maxH: 400, square: true } : { maxW: 1200, maxH: 800 });
      const res = await fetch("/api/media/presign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, propertyId, contentType: type, size: blob.size }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Không tải lên được");
      const put = await fetch(j.uploadUrl, { method: "PUT", headers: { "Content-Type": type }, body: blob });
      if (!put.ok) throw new Error("Tải lên R2 thất bại (kiểm tra CORS của bucket)");
      const r = kind === "avatar" ? await registerAvatarAction(type) : await registerCoverAction(propertyId!, type);
      if (r.error) throw new Error(r.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải ảnh");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      <Button type="button" variant="outline" className="h-11" disabled={!r2Ready || busy} onClick={() => input.current?.click()}>{busy ? "Đang tải…" : label}</Button>
      {!r2Ready && <p className="text-xs text-red-700">Chưa cấu hình Cloudflare R2.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
