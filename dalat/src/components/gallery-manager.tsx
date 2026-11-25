"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShareImagesButton } from "@/components/share-images-button";
import { ArrowDown, ArrowUp, Download, Link2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import { ActionButton } from "@/components/action-button";
import { Field, Select } from "@/components/form-fields";
import { Lightbox } from "@/components/lightbox";
import { compressImage } from "@/lib/image-compress";
import { galleryTabs, type GalleryDto } from "@/lib/albums-core";
import {
  createAlbumAction, deleteAlbumAction, deleteMediaAction, moveAlbumAction, moveMediaToAlbumAction, registerMediaAction, updateAlbumAction,
} from "@/app/(app)/media-actions";
import { setCoverFromMediaAction } from "@/app/(app)/profile-actions";

const pill = (on: boolean) => `h-10 shrink-0 rounded-full border border-black px-4 text-sm ${on ? "bg-primary font-semibold text-black" : "bg-white text-black"}`;

function AlbumForm({ rooms, initial, onSubmit, label }: { rooms: { id: string; name: string }[]; initial?: { name: string; roomId: string | null }; onSubmit: (name: string, roomId: string | null) => Promise<{ error?: string }>; label: string }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(undefined);
      const r = await onSubmit(name, roomId || null); setBusy(false);
      if (r.error) setError(r.error);
    }}>
      <Field label="Tên bộ ảnh" htmlFor="album-name"><Input id="album-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="VD: Sân BBQ & View rừng thông" className="h-11 text-base" required /></Field>
      {rooms.length > 0 && (
        <Field label="Gắn vào phòng lẻ (tuỳ chọn)" htmlFor="album-room" hint="Gắn phòng thì bộ ảnh tự hiện khi CTV xem chi tiết phòng đó; để trống là bộ ảnh chung của căn.">
          <Select id="album-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} options={[{ value: "", label: "Chung cả căn" }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]} />
        </Field>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>{busy ? "Đang lưu…" : label}</Button>
    </form>
  );
}

/** Kho ảnh theo bộ (album): tab, lưới thumbnail, Lightbox, tải .zip, link xem công khai; chủ căn thêm quản lý bộ ảnh + tải lên. */
export function GalleryManager({
  gallery, rooms, canEdit, r2Ready, coverUrl, initialKey,
}: { gallery: GalleryDto; rooms: { id: string; name: string }[]; canEdit: boolean; r2Ready: boolean; coverUrl?: string | null; initialKey?: string }) {
  const router = useRouter();
  const tabs = galleryTabs(gallery);
  const [key, setKey] = useState(tabs.some((t) => t.key === initialKey) ? initialKey! : tabs[0]?.key ?? "general");
  const active = tabs.find((t) => t.key === key) ?? tabs[0];
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const album = gallery.albums.find((a) => a.id === active?.albumId);
  const albumIdx = gallery.albums.findIndex((a) => a.id === active?.albumId);
  const total = gallery.general.length + gallery.albums.reduce((s, a) => s + a.media.length, 0);

  async function upload(files: File[]) {
    setError(undefined); setNote(undefined);
    for (const [i, file] of files.entries()) {
      setBusy(`Đang tải ${i + 1}/${files.length}…`);
      try {
        let body: Blob = file, type = file.type, thumbKey: string | null = null;
        const isImage = file.type.startsWith("image/");
        const presign = async (blob: Blob, contentType: string) => {
          const res = await fetch("/api/media/presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId: gallery.propertyId, contentType, size: blob.size }) });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error ?? "Không tải lên được");
          const put = await fetch(j.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
          if (!put.ok) throw new Error("Tải lên R2 thất bại (kiểm tra CORS của bucket)");
          return j.key as string;
        };
        if (isImage) {
          if (file.size > 3 * 1024 * 1024) { const c = await compressImage(file, { maxW: 2560, maxH: 2560 }); body = c.blob; type = c.type; } // nén nhẹ ảnh quá nặng
          const t = await compressImage(file, { maxW: 480, maxH: 480 }); // ảnh nhỏ cho lưới xem nhanh qua 4G
          thumbKey = await presign(t.blob, t.type);
        }
        const keyOrig = await presign(body, type);
        const r = await registerMediaAction({ propertyId: gallery.propertyId, albumId: album?.id ?? null, key: keyOrig, thumbKey, contentType: type });
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

  async function copyLink() {
    const token = active?.shareToken ?? gallery.galleryToken;
    const url = `${window.location.origin}/gallery/${token}`;
    try { await navigator.clipboard.writeText(url); setNote("Đã chép link xem ảnh sạch (không có giá Net và SĐT) — gửi cho khách qua Zalo"); }
    catch { window.prompt("Sao chép link:", url); }
    setTimeout(() => setNote(undefined), 4000);
  }

  const zip = (albumKey?: string) => `/api/media/zip?property=${gallery.propertyId}${albumKey ? `&album=${albumKey}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Bộ ảnh">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === active?.key} onClick={() => setKey(t.key)} className={pill(t.key === active?.key)}>
            {t.name} <span className="money-num text-xs opacity-70">{t.media.length}</span>
          </button>
        ))}
        {canEdit && (
          <Modal trigger="+ Tạo bộ ảnh mới" title="Tạo bộ ảnh mới">
            {(close) => <AlbumForm rooms={rooms} label="Tạo bộ ảnh" onSubmit={async (n, r) => { const x = await createAlbumAction(gallery.propertyId, n, r); if (!x.error) { close(); if (x.id) setKey(x.id); router.refresh(); } return x; }} />}
          </Modal>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {total > 0 && active && active.media.length > 0 && (
          <a href={zip(active.albumId ?? "general")} className="brutal-btn inline-flex h-10 items-center gap-1 bg-white px-3 text-sm text-black"><Download className="size-4" /> Tải bộ ảnh này</a>
        )}
        {total > 0 && gallery.albums.length > 0 && (
          <a href={zip()} className="brutal-btn inline-flex h-10 items-center gap-1 bg-white px-3 text-sm text-black"><Download className="size-4" /> Tải toàn bộ ({total})</a>
        )}
        {active && active.media.length > 0 && <ShareImagesButton media={active.media} name={`${gallery.propertyName} ${active.name}`} zipHref={zip(active.albumId ?? "general")} />}
        {total > 0 && <button type="button" onClick={copyLink} className="brutal-btn inline-flex h-10 items-center gap-1 bg-primary px-3 text-sm text-black"><Link2 className="size-4" /> Copy link xem ảnh sạch</button>}
      </div>
      {note && <p role="status" className="rounded border border-black bg-status-holding p-2 text-sm font-medium">{note}</p>}

      {canEdit && album && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-black bg-white p-2 text-sm">
          <span className="font-semibold">Bộ “{album.name}”{album.roomName ? ` · phòng ${album.roomName}` : ""}</span>
          <Modal trigger="Đổi tên" title="Sửa bộ ảnh">
            {(close) => <AlbumForm rooms={rooms} initial={{ name: album.name, roomId: album.roomId }} label="Lưu" onSubmit={async (n, r) => { const x = await updateAlbumAction(album.id, { name: n, roomId: r }); if (!x.error) { close(); router.refresh(); } return x; }} />}
          </Modal>
          <ActionButton action={() => moveAlbumAction(album.id, -1)} ariaLabel="Đưa bộ ảnh lên trước" className="size-9 justify-center px-0"><ArrowUp className="size-4" /></ActionButton>
          <ActionButton action={() => moveAlbumAction(album.id, 1)} ariaLabel="Đưa bộ ảnh ra sau" className="size-9 justify-center px-0"><ArrowDown className="size-4" /></ActionButton>
          <Modal trigger="Xoá bộ ảnh" title={`Xoá “${album.name}”?`}>
            {(close) => (
              <div className="space-y-2">
                <p className="text-sm">Bộ này có {album.media.length} file. Bạn muốn làm gì với các file bên trong?</p>
                <ActionButton action={async () => { const r = await deleteAlbumAction(album.id, "MOVE"); if (!r.error) { setKey("general"); close(); } return r; }} className="h-11 w-full justify-center">Chuyển về “Ảnh chung”</ActionButton>
                <ActionButton action={async () => { const r = await deleteAlbumAction(album.id, "DELETE"); if (!r.error) { setKey("general"); close(); } return r; }} confirm={`Xoá vĩnh viễn ${album.media.length} file trong bộ này?`} className="h-11 w-full justify-center bg-destructive">Xoá luôn các file bên trong</ActionButton>
              </div>
            )}
          </Modal>
          <span className="sr-only">Vị trí {albumIdx + 1}/{gallery.albums.length}</span>
        </div>
      )}

      {canEdit && (
        <div
          className="space-y-2 rounded border border-dashed border-black bg-white p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (r2Ready && !busy && e.dataTransfer.files.length) upload([...e.dataTransfer.files]); }}
        >
          {!r2Ready && <p className="text-sm text-red-700">Chưa cấu hình Cloudflare R2 (xem .env.example) nên chưa tải ảnh lên được.</p>}
          <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={(e) => e.target.files?.length && upload([...e.target.files])} />
          <Button type="button" className="h-11" disabled={!r2Ready || !!busy} onClick={() => input.current?.click()}>{busy ?? `+ Tải ảnh / video vào “${active?.name ?? "Ảnh chung"}”`}</Button>
          <p className="text-xs text-muted-foreground">Chọn nhiều file cùng lúc hoặc kéo thả vào đây. Ảnh quá nặng được nén nhẹ trước khi tải lên.</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {total === 0 && <p className="text-sm text-muted-foreground">Chưa có ảnh/video.</p>}
      {active && total > 0 && active.media.length === 0 && <p className="text-sm text-muted-foreground">Bộ này chưa có file.</p>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {active?.media.map((m, i) => (
          <li key={m.id} className="overflow-hidden rounded border border-black bg-white shadow-brutal-sm">
            <button type="button" onClick={() => setOpen(i)} aria-label={`Xem ${m.type === "VIDEO" ? "video" : "ảnh"} ${i + 1}`} className="relative block aspect-square w-full bg-muted">
              {m.type === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumb} alt={m.roomName ?? active.name} loading="lazy" decoding="async" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center bg-black text-white"><Play className="size-8" /></span>
              )}
            </button>
            <div className="space-y-1 p-2 text-xs">
              {canEdit && m.type === "IMAGE" && (
                m.url === coverUrl
                  ? <span className="inline-block rounded border border-black bg-primary px-2 py-1 font-bold">⭐ Ảnh đại diện Căn</span>
                  : <ActionButton action={() => setCoverFromMediaAction(m.id)} className="h-9 w-full justify-center text-xs">Đặt làm ảnh đại diện Căn</ActionButton>
              )}
              <div className="flex items-center justify-between gap-1">
                {canEdit ? (
                  <select aria-label="Chuyển sang bộ ảnh" value={m.albumId ?? ""} onChange={async (e) => { const r = await moveMediaToAlbumAction(m.id, e.target.value || null); if (r.error) setError(r.error); else router.refresh(); }} className="brutal-input h-9 min-w-0 flex-1 px-1 text-xs">
                    <option value="">Ảnh chung</option>
                    {gallery.albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : <span className="truncate text-muted-foreground">{m.roomName ?? active.name}</span>}
                <span className="flex gap-1">
                  <a href={`/api/media/${m.id}/download`} aria-label="Tải file gốc" className="brutal-btn grid size-9 place-items-center bg-white text-black"><Download className="size-4" /></a>
                  {canEdit && <ActionButton action={() => deleteMediaAction(m.id)} confirm="Xoá file này?" ariaLabel="Xoá file" className="size-9 justify-center bg-destructive px-0"><Trash2 className="size-4" /></ActionButton>}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {open !== null && active && (
        <Lightbox tabs={tabs.map((t) => ({ key: t.key, name: t.name, media: t.media }))} tab={active.key} index={open} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
