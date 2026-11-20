// Chợ kết nối homestay (spec 9.2): CTV chưa liên kết chỉ thấy THÔNG TIN CƠ BẢN.
// KHÔNG trả về giá Net, lịch, SĐT quản gia, địa chỉ chi tiết, kho ảnh gốc.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type LinkState = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED";
export type DirectoryItem = {
  id: string; name: string; cover: string | null; images: string[]; area: string; distanceKm: number | null; roadAccess: string;
  capacity: number; roomCount: number; allowWhole: boolean; allowRooms: boolean;
  amenities: { bbQ?: boolean; ac?: boolean; pet_friendly?: boolean; karaoke?: boolean; views?: string[] };
  priceRange: string | null; hostId: string; hostName: string; link: LinkState;
};
export type DirectoryFilter = { area?: string; road?: string; mode?: "whole" | "rooms"; bbq?: boolean; ac?: boolean; pet?: boolean; karaoke?: boolean };

const ROAD_ORDER = ["MOTORBIKE", "CAR_7", "CAR_16", "BUS_29"] as const;

export async function listDirectory(brokerId: string, f: DirectoryFilter = {}): Promise<DirectoryItem[]> {
  const and: Prisma.PropertyWhereInput[] = [];
  if (f.area) and.push({ area: f.area as never });
  const idx = ROAD_ORDER.indexOf(f.road as never);
  if (idx >= 0) and.push({ roadAccess: { in: [...ROAD_ORDER.slice(idx)] } });
  if (f.mode === "whole") and.push({ allowWholeUnit: true });
  if (f.mode === "rooms") and.push({ allowIndividualRooms: true });
  if (f.bbq) and.push({ amenities: { path: ["bbQ"], equals: true } });
  if (f.ac) and.push({ amenities: { path: ["ac"], equals: true } });
  if (f.pet) and.push({ amenities: { path: ["pet_friendly"], equals: true } });
  if (f.karaoke) and.push({ amenities: { path: ["karaoke"], equals: true } });

  // select tường minh: không bao giờ lấy giá Net, địa chỉ, SĐT, link bản đồ…
  const props = await prisma.property.findMany({
    where: { sourceType: "HOST_MANAGED", isPublicDirectory: true, hostId: { not: brokerId }, AND: and },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, coverImageUrl: true, area: true, distanceToMarketKm: true, roadAccess: true,
      allowWholeUnit: true, allowIndividualRooms: true, amenities: true, publicPriceRange: true, hostId: true,
      host: { select: { fullName: true } },
      rooms: { select: { maxGuests: true } },
      media: { where: { mediaType: "IMAGE", roomId: null }, orderBy: { sortOrder: "asc" }, take: 5, select: { url: true } },
    },
  });
  const links = await prisma.hostBrokerLink.findMany({ where: { brokerId, hostId: { in: [...new Set(props.flatMap((p) => (p.hostId ? [p.hostId] : [])))] } }, select: { hostId: true, status: true } });
  const state = new Map(links.map((l) => [l.hostId, l.status as LinkState]));
  return props.map((p) => ({
    id: p.id, name: p.name, cover: p.coverImageUrl, images: p.media.map((m) => m.url), area: p.area, distanceKm: p.distanceToMarketKm, roadAccess: p.roadAccess,
    capacity: p.rooms.reduce((s, r) => s + r.maxGuests, 0), roomCount: p.rooms.length, allowWhole: p.allowWholeUnit, allowRooms: p.allowIndividualRooms,
    amenities: (p.amenities ?? {}) as DirectoryItem["amenities"], priceRange: p.publicPriceRange, hostId: p.hostId ?? "", hostName: p.host?.fullName ?? "",
    link: state.get(p.hostId ?? "") ?? "NONE",
  }));
}

export async function getDirectoryItem(brokerId: string, id: string): Promise<DirectoryItem | null> {
  return (await listDirectory(brokerId)).find((p) => p.id === id) ?? null;
}
