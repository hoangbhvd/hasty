"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { deleteMediaAction, registerMediaAction } from "@/app/(app)/media-actions";

type Item = { id: string; url: string; type: "IMAGE" | "VIDEO"; roomName: string | null };

export function MediaManager({
  propertyId, items, rooms, canEdit, r2Ready,
}: {
  propertyId: string;
  items: Item[];
  rooms: { id: string; name: string }[];
  canEdit: boolean;
  r2Ready: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function upload(files: FileList) {
    setError(undefined);
    for (const [i, file] of Array.from(files).entries()) {
      setBusy(`Đang tải ${i + 1}/${files.length}…`);
      try {
        const res = await fetch("/api/media/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, contentType: file.type, size: file.size }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Không tải lên được");
        const put = await fetch(j.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!put.ok) throw new Error("Tải lên R2 thất bại (kiểm tra CORS của bucket)");
        const r = await registerMediaAction({ propertyId, roomId: roomId || null, key: j.key, contentType: file.type });
        if (r.error) throw new Error(r.error);
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "lỗi"}`);
        break;
      }
    }
    setBusy(undefined);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function downloadAll() {
    items.forEach((m, i) => setTimeout(() => {
      const a = document.createElement("a");
      a.href = `/api/media/${m.id}/download`;
      a.click();
    }, i * 400));
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          {!r2Ready && <p className="text-sm text-destructive">Chưa cấu hình Cloudflare R2 (xem .env.example) nên chưa tải ảnh lên được.</p>}
          <div className="flex flex-wrap items-center gap-2">
            {rooms.length > 0 && (
              <select aria-label="Gắn vào" value={roomId} onChange={(e) => setRoomId(e.target.value)} className="h-11 rounded-md border bg-background px-2 text-base">
                <option value="">Ảnh chung của căn</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={(e) => e.target.files?.length && upload(e.target.files)} />
            <Button type="button" className="h-11" disabled={!r2Ready || !!busy} onClick={() => input.current?.click()}>
              {busy ?? "+ Tải ảnh / video"}
            </Button>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {items.length > 0 && (
        <Button type="button" variant="outline" className="h-10" onClick={downloadAll}>
          <Download className="size-4" /> Tải tất cả ({items.length})
        </Button>
      )}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Chưa có ảnh/video.</p>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((m) => (
          <li key={m.id} className="overflow-hidden rounded-lg border">
            <div className="aspect-square bg-muted">
              {m.type === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.roomName ?? "Ảnh căn"} loading="lazy" className="size-full object-cover" />
              ) : (
                <video src={m.url} controls preload="metadata" className="size-full object-cover" />
              )}
            </div>
            <div className="flex items-center justify-between gap-1 p-2 text-xs">
              <span className="truncate text-muted-foreground">{m.roomName ?? "Chung"}</span>
              <span className="flex gap-1">
                <a href={`/api/media/${m.id}/download`} aria-label="Tải file gốc" className="grid size-9 place-items-center rounded-md border hover:bg-muted">
                  <Download className="size-4" />
                </a>
                {canEdit && (
                  <ActionButton action={() => deleteMediaAction(m.id)} confirm="Xoá file này?" ariaLabel="Xoá file" className="size-9 justify-center px-0 text-destructive">
                    <Trash2 className="size-4" />
                  </ActionButton>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
