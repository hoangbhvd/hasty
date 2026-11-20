import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getDirectoryItem } from "@/lib/directory";
import { PropertyCover } from "@/components/avatar";
import { CollabButton } from "@/components/collab-button";
import { amenityTags, sellMode } from "@/components/directory-card";
import { AREA_LABEL, ROAD_LABEL } from "@/lib/labels";

export default async function DiscoverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await getDirectoryItem(user.id, id);
  if (!p) notFound();
  const tags = amenityTags(p.amenities);
  const photos = p.images.length ? p.images : p.cover ? [p.cover] : [];

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/broker/discover" className="text-sm text-muted-foreground">← Khám phá Homestay</Link>
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <p className="text-sm text-muted-foreground">Chủ nhà: {p.hostName}</p>
      </div>
      {photos.length === 0 ? <PropertyCover name={p.name} /> : (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <li key={u} className={i === 0 ? "col-span-2" : ""}><img src={u} alt={`${p.name} ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full rounded border border-black object-cover" /></li>
          ))}
        </ul>
      )}
      <dl className="grid gap-3 rounded border border-black bg-white p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Khu vực</dt><dd className="font-medium">{AREA_LABEL[p.area as keyof typeof AREA_LABEL]}{p.distanceKm != null ? ` · ${p.distanceKm} km ra chợ Đà Lạt` : ""}</dd></div>
        <div><dt className="text-muted-foreground">Đường xe vào</dt><dd className="font-medium">{ROAD_LABEL[p.roadAccess as keyof typeof ROAD_LABEL]}</dd></div>
        <div><dt className="text-muted-foreground">Hình thức bán</dt><dd className="font-medium">{sellMode(p)}</dd></div>
        <div><dt className="text-muted-foreground">Sức chứa</dt><dd className="font-medium">{p.capacity ? `${p.capacity} khách` : "—"}{p.roomCount ? ` · ${p.roomCount} phòng` : ""}</dd></div>
        {tags.length > 0 && <div className="sm:col-span-2"><dt className="text-muted-foreground">Tiện ích</dt><dd>{tags.join(" · ")}</dd></div>}
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Khoảng giá tham khảo</dt><dd className="money-num font-medium">{p.priceRange ?? "Liên hệ chủ nhà"}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">🔒 Giá Net chi tiết, lịch trống, kho ảnh/video gốc, SĐT quản gia và địa chỉ chính xác chỉ mở khi chủ nhà duyệt cộng tác.</p>
      <CollabButton hostId={p.hostId} link={p.link} />
    </div>
  );
}
