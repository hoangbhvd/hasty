// Phần thuần (không DB) của bộ ảnh — dùng được ở cả component client.
export type MediaDto = { id: string; url: string; thumb: string; type: "IMAGE" | "VIDEO"; albumId: string | null; roomName: string | null };
export type AlbumDto = { id: string; name: string; roomId: string | null; roomName: string | null; shareToken: string; media: MediaDto[] };
export type GalleryDto = { propertyId: string; propertyName: string; galleryToken: string; general: MediaDto[]; albums: AlbumDto[] };

/** Album và Ảnh chung thành danh sách tab thống nhất (Ảnh chung luôn đứng đầu nếu có file). */
export function galleryTabs(g: GalleryDto): { key: string; name: string; media: MediaDto[]; albumId: string | null; shareToken: string | null }[] {
  return [
    ...(g.general.length > 0 || g.albums.length === 0 ? [{ key: "general", name: "Ảnh chung", media: g.general, albumId: null, shareToken: null }] : []),
    ...g.albums.map((a) => ({ key: a.id, name: a.roomName ? `${a.name} · ${a.roomName}` : a.name, media: a.media, albumId: a.id, shareToken: a.shareToken })),
  ];
}
