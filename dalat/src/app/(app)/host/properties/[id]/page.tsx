import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getHostProperty } from "@/lib/access";
import { PropertyForm, type PropertyDefaults } from "@/components/property-form";
import { RoomsManager } from "@/components/rooms-manager";
import { SpecialPricesManager } from "@/components/special-prices-manager";
import { MediaManager } from "@/components/media-manager";
import { ImageUploader } from "@/components/image-uploader";
import { PropertyCover } from "@/components/avatar";
import { ActionButton } from "@/components/action-button";
import { formatVnd, parseDateOnly, todayVn, toDateOnly } from "@/lib/format";
import { TIER_LABEL } from "@/lib/labels";
import { r2Configured } from "@/lib/r2";
import { VoucherConfigForm } from "@/components/voucher-config-form";
import { parseVoucherConfig } from "@/lib/voucher-config";
import { deletePropertyAction, updatePropertyAction } from "../actions";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await getHostProperty(user.id, id))) notFound();

  const [p, rooms, media, specials, recentBookings] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id } }),
    prisma.room.findMany({ where: { propertyId: id }, orderBy: { name: "asc" } }),
    prisma.propertyMedia.findMany({ where: { propertyId: id }, orderBy: { sortOrder: "asc" }, include: { room: true } }),
    prisma.specialPrice.findMany({
      where: { propertyId: id, date: { gte: parseDateOnly(todayVn())! } },
      orderBy: { date: "asc" },
      take: 200,
      include: { room: true },
    }),
    prisma.booking.findMany({ where: { propertyId: id }, orderBy: { createdAt: "desc" }, take: 8, select: { voucherToken: true, bookingCode: true, guestName: true } }),
  ]);

  const defaults: PropertyDefaults = {
    ...p,
    baseWeekdayNet: p.baseWeekdayNet ? Number(p.baseWeekdayNet) : null,
    baseWeekendNet: p.baseWeekendNet ? Number(p.baseWeekendNet) : null,
    amenities: p.amenities as PropertyDefaults["amenities"],
  };
  const roomList = rooms.map((r) => ({
    id: r.id, name: r.name, maxGuests: r.maxGuests,
    baseWeekdayNet: r.baseWeekdayNet ? Number(r.baseWeekdayNet) : null,
    baseWeekendNet: r.baseWeekendNet ? Number(r.baseWeekendNet) : null,
  }));

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/host/properties" className="text-sm text-muted-foreground">← Căn của tôi</Link>
        <h1 className="text-2xl font-semibold">{p.name}</h1>
      </div>

      <PropertyForm action={updatePropertyAction.bind(null, id)} defaults={defaults} submitLabel="Lưu thay đổi" />

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Phòng lẻ</h2>
        {!p.allowIndividualRooms && <p className="text-sm text-muted-foreground">Căn này chưa bật “Bán phòng lẻ”. Bật ở form trên nếu muốn bán theo phòng.</p>}
        <RoomsManager propertyId={id} rooms={roomList} />
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Giá ngày lễ / giá riêng</h2>
        <SpecialPricesManager
          propertyId={id}
          rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
          rows={specials.map((s) => ({
            id: s.id, date: toDateOnly(s.date), roomName: s.room?.name ?? null,
            tier: s.brokerTier ? TIER_LABEL[s.brokerTier] : null, netPrice: formatVnd(s.netPrice),
          }))}
        />
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Ảnh & video</h2>
        <div className="flex items-end gap-3">
          <PropertyCover url={p.coverImageUrl} name={p.name} className="w-40 shrink-0" />
          <ImageUploader kind="cover" propertyId={id} label={p.coverImageUrl ? "Đổi ảnh đại diện căn" : "Tải ảnh đại diện căn"} r2Ready={r2Configured()} />
        </div>
        <MediaManager
          coverUrl={p.coverImageUrl}
          propertyId={id}
          canEdit
          r2Ready={r2Configured()}
          rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
          items={media.map((m) => ({ id: m.id, url: m.url, type: m.mediaType, roomName: m.room?.name ?? null }))}
        />
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Mẫu Booking Confirmation</h2>
        <p className="text-sm text-muted-foreground">Phiếu xác nhận gửi khách (xuất PNG / PDF A4). Không bao giờ hiển thị giá Net.</p>
        <VoucherConfigForm
          propertyId={id}
          config={parseVoucherConfig(p.voucherConfig)}
          images={media.filter((m) => m.mediaType === "IMAGE").map((m) => ({ url: m.url }))}
          previews={recentBookings.map((x) => ({ token: x.voucherToken, label: `${x.bookingCode} · ${x.guestName}` }))}
        />
      </section>

      <section className="border-t pt-6">
        <ActionButton action={deletePropertyAction.bind(null, id)} confirm={`Xoá căn "${p.name}"? Không thể hoàn tác.`} className="bg-destructive">
          Xoá căn này
        </ActionButton>
      </section>
    </div>
  );
}
