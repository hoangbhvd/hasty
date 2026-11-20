import Link from "next/link";
import { PropertyCover } from "@/components/avatar";
import { CollabButton } from "@/components/collab-button";
import { AREA_LABEL, ROAD_LABEL } from "@/lib/labels";
import type { DirectoryItem } from "@/lib/directory";

export function amenityTags(a: DirectoryItem["amenities"]) {
  return [a.bbQ && "BBQ", a.ac && "Máy lạnh", a.pet_friendly && "Thú cưng", a.karaoke && "Karaoke", ...(a.views ?? []).map((v) => `View ${v}`)].filter(Boolean) as string[];
}

export function sellMode(p: Pick<DirectoryItem, "allowWhole" | "allowRooms">) {
  return p.allowWhole && p.allowRooms ? "Nguyên căn & phòng lẻ" : p.allowRooms ? "Phòng lẻ" : "Nguyên căn";
}

export function DirectoryCard({ p }: { p: DirectoryItem }) {
  const tags = amenityTags(p.amenities);
  return (
    <li className="overflow-hidden rounded border border-black bg-white shadow-brutal-sm md:brutal-card">
      <Link href={`/broker/discover/${p.id}`} className="block">
        <PropertyCover url={p.cover ?? p.images[0]} name={p.name} className="border-0 border-b" />
        <div className="space-y-1 p-3">
          <div className="font-semibold">{p.name}</div>
          <div className="text-sm text-muted-foreground">
            {AREA_LABEL[p.area as keyof typeof AREA_LABEL]}{p.distanceKm != null ? ` · ${p.distanceKm} km tới chợ` : ""} · {ROAD_LABEL[p.roadAccess as keyof typeof ROAD_LABEL]}
          </div>
          <div className="text-sm">{sellMode(p)}{p.capacity ? ` · ${p.capacity} khách` : ""}{p.roomCount ? ` · ${p.roomCount} phòng` : ""}</div>
          {tags.length > 0 && <div className="text-xs text-muted-foreground">{tags.join(" · ")}</div>}
          <div className="money-num text-sm font-medium">{p.priceRange ?? "Liên hệ chủ nhà"}</div>
        </div>
      </Link>
      <div className="border-t border-black p-3"><CollabButton hostId={p.hostId} link={p.link} /></div>
    </li>
  );
}
