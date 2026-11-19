import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getBrokerVisibleProperty } from "@/lib/access";
import { MediaManager } from "@/components/media-manager";
import { ActionButton } from "@/components/action-button";
import { AREA_LABEL, ROAD_LABEL, SLOPE_LABEL } from "@/lib/labels";
import { formatVnd } from "@/lib/format";
import { r2Configured } from "@/lib/r2";
import { VoucherConfigForm } from "@/components/voucher-config-form";
import { parseVoucherConfig } from "@/lib/voucher-config";
import { deleteExternalPropertyAction } from "../actions";
import { openChatAction } from "@/app/(app)/chat-actions";

type Amen = { bbQ?: boolean; ac?: boolean; pet_friendly?: boolean; karaoke?: boolean; views?: string[] };

export default async function BrokerPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const visible = await getBrokerVisibleProperty(user.id, id);
  if (!visible) notFound();

  const [p, rooms, media] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id }, include: { host: { select: { fullName: true } } } }),
    prisma.room.findMany({ where: { propertyId: id }, orderBy: { name: "asc" } }),
    prisma.propertyMedia.findMany({ where: { propertyId: id }, orderBy: { sortOrder: "asc" }, include: { room: true } }),
  ]);
  const external = p.sourceType === "BROKER_EXTERNAL";
  const lastBooking = external ? await prisma.booking.findFirst({ where: { propertyId: id }, orderBy: { createdAt: "desc" }, select: { voucherToken: true } }) : null;
  const am = (p.amenities ?? {}) as Amen;
  const tags = [am.bbQ && "BBQ", am.ac && "Máy lạnh", am.pet_friendly && "Thú cưng", am.karaoke && "Karaoke", ...(am.views ?? []).map((v) => `View ${v}`)].filter(Boolean) as string[];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/broker/properties" className="text-sm text-muted-foreground">← Homestay</Link>
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <p className="text-muted-foreground">
          {AREA_LABEL[p.area]} · {ROAD_LABEL[p.roadAccess]} · {SLOPE_LABEL[p.slopeLevel]}
          {external ? ` · Chủ: ${p.externalHostName ?? "—"} ${p.externalHostPhone ?? ""}` : ` · Chủ: ${p.host?.fullName ?? ""}`}
        </p>
      </div>

      {!external && p.hostId && (
        <form action={openChatAction.bind(null, p.hostId, "BROKER")}>
          <button type="submit" className="brutal-btn inline-flex h-11 items-center bg-white px-4 text-sm text-black">💬 Nhắn chủ nhà</button>
        </form>
      )}

      <dl className="grid gap-3 rounded border border-black bg-white shadow-brutal-sm md:brutal-card p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Net CN–T5</dt><dd className="font-medium">{formatVnd(p.baseWeekdayNet)}</dd></div>
        <div><dt className="text-muted-foreground">Net T6–T7</dt><dd className="font-medium">{formatVnd(p.baseWeekendNet)}</dd></div>
        {tags.length > 0 && <div className="sm:col-span-2"><dt className="text-muted-foreground">Tiện ích</dt><dd>{tags.join(" · ")}</dd></div>}
        {p.googleMapsUrl && <div className="sm:col-span-2"><dt className="text-muted-foreground">Google Maps</dt><dd><a href={p.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="underline">Mở bản đồ</a></dd></div>}
        {p.checkinGuide && <div className="sm:col-span-2"><dt className="text-muted-foreground">Hướng dẫn check-in</dt><dd className="whitespace-pre-line">{p.checkinGuide}</dd></div>}
        {p.houseRules && <div className="sm:col-span-2"><dt className="text-muted-foreground">Nội quy</dt><dd className="whitespace-pre-line">{p.houseRules}</dd></div>}
      </dl>

      {rooms.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Phòng lẻ</h2>
          <ul className="divide-y divide-black rounded border border-black bg-white text-sm">
            {rooms.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 p-3">
                <span>{r.name} · tối đa {r.maxGuests} khách</span>
                <span>{formatVnd(r.baseWeekdayNet)} / {formatVnd(r.baseWeekendNet)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Ảnh & video</h2>
        <MediaManager
          propertyId={id}
          canEdit={external}
          r2Ready={r2Configured()}
          rooms={[]}
          items={media.map((m) => ({ id: m.id, url: m.url, type: m.mediaType, roomName: m.room?.name ?? null }))}
        />
      </section>

      {external && (
        <section className="space-y-3">
          <h2 className="font-semibold">Mẫu Booking Confirmation</h2>
          <VoucherConfigForm
            propertyId={id}
            config={parseVoucherConfig(p.voucherConfig)}
            images={media.filter((m) => m.mediaType === "IMAGE").map((m) => ({ url: m.url }))}
            previewToken={lastBooking?.voucherToken ?? null}
          />
        </section>
      )}

      {external && (
        <ActionButton action={deleteExternalPropertyAction.bind(null, id)} confirm={`Xoá "${p.name}"?`} className="bg-destructive">
          Xoá homestay này
        </ActionButton>
      )}
    </div>
  );
}
