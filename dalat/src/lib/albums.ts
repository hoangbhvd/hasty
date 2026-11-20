// Bộ ảnh/video theo album của căn (spec "Property Media Albums"). Không import server-only để test được.
import { prisma } from "@/lib/db";

import type { AlbumDto, GalleryDto, MediaDto } from "@/lib/albums-core";
export * from "@/lib/albums-core";

const mediaSelect = { id: true, url: true, thumbUrl: true, mediaType: true, albumId: true, room: { select: { name: true } } } as const;
type Row = { id: string; url: string; thumbUrl: string | null; mediaType: "IMAGE" | "VIDEO"; albumId: string | null; room: { name: string } | null };
const dto = (m: Row): MediaDto => ({ id: m.id, url: m.url, thumb: m.thumbUrl ?? m.url, type: m.mediaType, albumId: m.albumId, roomName: m.room?.name ?? null });

/** Toàn bộ kho ảnh của căn, chia theo album. `only`: chỉ 1 album ("general" = Ảnh chung). */
export async function loadGallery(propertyId: string, only?: { albumId: string } | { general: true }): Promise<GalleryDto | null> {
  const p = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true, name: true, galleryToken: true,
      albums: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, roomId: true, shareToken: true, room: { select: { name: true } }, media: { orderBy: { sortOrder: "asc" }, select: mediaSelect } } },
      media: { where: { albumId: null }, orderBy: { sortOrder: "asc" }, select: mediaSelect },
    },
  });
  if (!p) return null;
  let albums: AlbumDto[] = p.albums.map((a) => ({ id: a.id, name: a.name, roomId: a.roomId, roomName: a.room?.name ?? null, shareToken: a.shareToken, media: a.media.map(dto) }));
  let general = p.media.map(dto);
  if (only && "albumId" in only) { albums = albums.filter((a) => a.id === only.albumId); general = []; }
  if (only && "general" in only) albums = [];
  return { propertyId: p.id, propertyName: p.name, galleryToken: p.galleryToken, general, albums };
}

/** Link công khai /gallery/[token]: token của cả căn hoặc của 1 album. Chỉ trả tên căn + file (không giá, SĐT, địa chỉ, tên chủ). */
export async function loadPublicGallery(token: string): Promise<(GalleryDto & { scope: "PROPERTY" | "ALBUM" }) | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return null;
  const byProp = await prisma.property.findUnique({ where: { galleryToken: token }, select: { id: true } });
  if (byProp) { const g = await loadGallery(byProp.id); return g && { ...g, scope: "PROPERTY" }; }
  const album = await prisma.propertyAlbum.findUnique({ where: { shareToken: token }, select: { id: true, propertyId: true } });
  if (album) { const g = await loadGallery(album.propertyId, { albumId: album.id }); return g && { ...g, scope: "ALBUM" }; }
  return null;
}

