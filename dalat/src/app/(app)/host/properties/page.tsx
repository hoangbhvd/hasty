import Link from "next/link";
import { PropertyCover } from "@/components/avatar";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AREA_LABEL } from "@/lib/labels";
import { formatVnd } from "@/lib/format";

export default async function HostPropertiesPage() {
  const user = await requireUser();
  const props = await prisma.property.findMany({
    where: { sourceType: "HOST_MANAGED", hostId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { rooms: true, media: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Căn của tôi</h1>
        <Link href="/host/properties/new" className="inline-flex h-11 items-center gap-1 brutal-btn bg-primary px-4 text-sm text-black">
          <Plus className="size-4" /> Thêm căn
        </Link>
      </div>
      {props.length === 0 ? (
        <p className="text-muted-foreground">Chưa có căn nào. Bấm “Thêm căn” để bắt đầu.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {props.map((p) => (
            <li key={p.id}>
              <Link href={`/host/properties/${p.id}`} className="block space-y-1 overflow-hidden rounded border border-black bg-white shadow-brutal-sm md:brutal-card hover:bg-muted">
                <PropertyCover url={p.coverImageUrl} name={p.name} className="border-0 border-b" />
                <div className="space-y-1 p-4">
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-muted-foreground">
                  {AREA_LABEL[p.area]} · {p._count.rooms} phòng · {p._count.media} ảnh/video
                </div>
                <div className="money-num text-sm">Net: {formatVnd(p.baseWeekdayNet)} / {formatVnd(p.baseWeekendNet)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
