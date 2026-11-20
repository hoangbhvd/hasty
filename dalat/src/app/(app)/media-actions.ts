"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { ALLOWED_TYPES, deleteObject, keyFromUrl, keyPrefix, publicUrlFor, r2Configured } from "@/lib/r2";

/** Ghi nhận file đã upload thẳng lên R2 (presigned) vào DB. */
export async function registerMediaAction(input: {
  propertyId: string;
  roomId?: string | null;
  albumId?: string | null;
  key: string;
  thumbKey?: string | null;
  contentType: string;
}): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!r2Configured()) return { error: "Chưa cấu hình Cloudflare R2" };
  const property = await getManagedProperty(user.id, input.propertyId);
  if (!property) return { error: "Không có quyền" };
  const type = ALLOWED_TYPES[input.contentType];
  if (!type) return { error: "Định dạng không được hỗ trợ" };
  if (!input.key.startsWith(keyPrefix(property.id)) || input.key.includes("..")) return { error: "Khoá file không hợp lệ" };

  let roomId: string | null = null;
  let albumId: string | null = null;
  if (input.albumId) {
    const album = await prisma.propertyAlbum.findFirst({ where: { id: input.albumId, propertyId: property.id } });
    if (!album) return { error: "Bộ ảnh không hợp lệ" };
    albumId = album.id;
    roomId = album.roomId; // bộ ảnh gắn phòng lẻ thì file tự thuộc phòng đó
  }
  if (input.thumbKey && (!input.thumbKey.startsWith(keyPrefix(property.id)) || input.thumbKey.includes(".."))) return { error: "Khoá ảnh nhỏ không hợp lệ" };
  if (!roomId && input.roomId) {
    const room = await prisma.room.findFirst({ where: { id: input.roomId, propertyId: property.id } });
    if (!room) return { error: "Phòng không hợp lệ" };
    roomId = room.id;
  }
  const last = await prisma.propertyMedia.aggregate({ where: { propertyId: property.id }, _max: { sortOrder: true } });
  await prisma.propertyMedia.create({
    data: {
      propertyId: property.id,
      roomId,
      albumId,
      url: publicUrlFor(input.key),
      thumbUrl: input.thumbKey ? publicUrlFor(input.thumbKey) : null,
      mediaType: type.media,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/host/properties/${property.id}`);
  revalidatePath(`/broker/properties/${property.id}`);
  return {};
}

export async function deleteMediaAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const media = await prisma.propertyMedia.findUnique({ where: { id } });
  if (!media || !(await getManagedProperty(user.id, media.propertyId))) return { error: "Không có quyền" };
  await prisma.propertyMedia.delete({ where: { id } });
  if (r2Configured()) for (const u of [media.url, media.thumbUrl]) { const k = u && keyFromUrl(u); if (k) await deleteObject(k).catch(() => {}); }
  revalidatePath(`/host/properties/${media.propertyId}`);
  revalidatePath(`/broker/properties/${media.propertyId}`);
}

// ───────── Bộ ảnh (album) ─────────
async function ownedAlbum(userId: string, albumId: string) {
  const a = await prisma.propertyAlbum.findUnique({ where: { id: albumId } });
  if (!a || !(await getManagedProperty(userId, a.propertyId))) return null;
  return a;
}
const refresh = (propertyId: string) => { revalidatePath(`/host/properties/${propertyId}`); revalidatePath(`/broker/properties/${propertyId}`); };

export async function createAlbumAction(propertyId: string, name: string, roomId?: string | null): Promise<{ error?: string; id?: string }> {
  const user = await requireUser();
  const property = await getManagedProperty(user.id, propertyId);
  if (!property) return { error: "Không có quyền" };
  const n = name.trim();
  if (n.length < 1 || n.length > 80) return { error: "Tên bộ ảnh 1–80 ký tự" };
  if (roomId && !(await prisma.room.findFirst({ where: { id: roomId, propertyId } }))) return { error: "Phòng không hợp lệ" };
  const last = await prisma.propertyAlbum.aggregate({ where: { propertyId }, _max: { sortOrder: true } });
  const a = await prisma.propertyAlbum.create({ data: { propertyId, name: n, roomId: roomId || null, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  refresh(propertyId);
  return { id: a.id };
}

export async function updateAlbumAction(albumId: string, patch: { name?: string; roomId?: string | null }): Promise<{ error?: string }> {
  const user = await requireUser();
  const a = await ownedAlbum(user.id, albumId);
  if (!a) return { error: "Không có quyền" };
  const data: { name?: string; roomId?: string | null } = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n.length < 1 || n.length > 80) return { error: "Tên bộ ảnh 1–80 ký tự" };
    data.name = n;
  }
  if (patch.roomId !== undefined) {
    if (patch.roomId && !(await prisma.room.findFirst({ where: { id: patch.roomId, propertyId: a.propertyId } }))) return { error: "Phòng không hợp lệ" };
    data.roomId = patch.roomId || null;
  }
  await prisma.$transaction([
    prisma.propertyAlbum.update({ where: { id: a.id }, data }),
    // đổi phòng gắn của bộ ảnh thì file bên trong đi theo
    ...(patch.roomId !== undefined ? [prisma.propertyMedia.updateMany({ where: { albumId: a.id }, data: { roomId: data.roomId ?? null } })] : []),
  ]);
  refresh(a.propertyId);
  return {};
}

/** Đổi chỗ với bộ ảnh kế bên (dir -1 = lên trên, 1 = xuống dưới). */
export async function moveAlbumAction(albumId: string, dir: -1 | 1): Promise<{ error?: string }> {
  const user = await requireUser();
  const a = await ownedAlbum(user.id, albumId);
  if (!a) return { error: "Không có quyền" };
  const all = await prisma.propertyAlbum.findMany({ where: { propertyId: a.propertyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = all.findIndex((x) => x.id === a.id), j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return {};
  const ids = all.map((x) => x.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await prisma.$transaction(ids.map((id, idx) => prisma.propertyAlbum.update({ where: { id }, data: { sortOrder: idx } })));
  refresh(a.propertyId);
  return {};
}

/** mode "MOVE": chuyển ảnh về "Ảnh chung"; "DELETE": xoá luôn ảnh trong bộ (cả file trên R2). */
export async function deleteAlbumAction(albumId: string, mode: "MOVE" | "DELETE"): Promise<{ error?: string }> {
  const user = await requireUser();
  const a = await ownedAlbum(user.id, albumId);
  if (!a) return { error: "Không có quyền" };
  if (mode === "DELETE") {
    const media = await prisma.propertyMedia.findMany({ where: { albumId: a.id } });
    await prisma.propertyMedia.deleteMany({ where: { albumId: a.id } });
    if (r2Configured()) for (const m of media) for (const u of [m.url, m.thumbUrl]) { const k = u && keyFromUrl(u); if (k) await deleteObject(k).catch(() => {}); }
  } else {
    await prisma.propertyMedia.updateMany({ where: { albumId: a.id }, data: { albumId: null, roomId: null } });
  }
  await prisma.propertyAlbum.delete({ where: { id: a.id } });
  refresh(a.propertyId);
  return {};
}

/** Chuyển 1 file sang bộ ảnh khác (null = Ảnh chung). */
export async function moveMediaToAlbumAction(mediaId: string, albumId: string | null): Promise<{ error?: string }> {
  const user = await requireUser();
  const m = await prisma.propertyMedia.findUnique({ where: { id: mediaId } });
  if (!m || !(await getManagedProperty(user.id, m.propertyId))) return { error: "Không có quyền" };
  let roomId: string | null = null;
  if (albumId) {
    const a = await prisma.propertyAlbum.findFirst({ where: { id: albumId, propertyId: m.propertyId } });
    if (!a) return { error: "Bộ ảnh không hợp lệ" };
    roomId = a.roomId;
  }
  await prisma.propertyMedia.update({ where: { id: m.id }, data: { albumId, roomId } });
  refresh(m.propertyId);
  return {};
}
