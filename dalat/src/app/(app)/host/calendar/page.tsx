import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { occupyingWhere } from "@/lib/availability";
import { addDays, parseDateOnly, todayVn } from "@/lib/format";
import { Gantt, type GanttBooking } from "@/components/gantt";
import { BookingList, bookingInclude, toRow } from "@/components/booking-list";

const DAYS = 28;

export default async function HostCalendarPage({ searchParams }: { searchParams: Promise<{ property?: string; from?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const properties = await prisma.property.findMany({
    where: { sourceType: "HOST_MANAGED", hostId: user.id },
    orderBy: { name: "asc" },
    include: { rooms: { orderBy: { name: "asc" } } },
  });
  if (properties.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Lịch</h1>
        <p className="text-muted-foreground">Bạn chưa có căn nào. <Link className="underline" href="/host/properties/new">Thêm căn</Link> để xem lịch.</p>
      </div>
    );
  }
  const property = properties.find((p) => p.id === sp.property) ?? properties[0];
  const fromStr = sp.from && parseDateOnly(sp.from) ? sp.from : todayVn();
  const from = parseDateOnly(fromStr)!;
  const to = parseDateOnly(addDays(fromStr, DAYS))!;

  const now = new Date();
  const [occ, others] = await Promise.all([
    prisma.booking.findMany({
      where: { propertyId: property.id, ...occupyingWhere(from, to, now) },
      orderBy: { checkIn: "asc" },
      include: bookingInclude,
    }),
    prisma.booking.count({ where: { propertyId: property.id, status: "CANCELLED", checkOut: { gt: from }, checkIn: { lt: to } } }),
  ]);
  const gantt: GanttBooking[] = occ.map((b) => ({
    id: b.id, guestName: b.guestName, status: b.status, bookingType: b.bookingType,
    checkIn: b.checkIn, checkOut: b.checkOut, roomIds: b.rooms.map((r) => r.roomId), brokerName: b.broker?.fullName ?? null,
  }));

  const nav = (f: string, p = property.id) => `/host/calendar?property=${p}&from=${f}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Lịch</h1>
        <Link href={`/host/bookings/new?propertyId=${property.id}`} className="inline-flex h-11 items-center brutal-btn bg-primary px-4 text-sm text-black">
          + Tạo booking
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chọn căn">
        {properties.map((p) => (
          <Link key={p.id} href={nav(fromStr, p.id)} role="tab" aria-selected={p.id === property.id}
            className={`h-10 rounded-full border border-black px-4 text-sm leading-10 text-black ${p.id === property.id ? "bg-primary font-semibold" : "bg-white hover:bg-muted"}`}>
            {p.name}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Link href={nav(addDays(fromStr, -14))} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">← 14 ngày</Link>
        <Link href={nav(todayVn())} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">Hôm nay</Link>
        <Link href={nav(addDays(fromStr, 14))} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">14 ngày →</Link>
      </div>

      <Gantt from={from} days={DAYS} today={todayVn()} rooms={property.allowIndividualRooms ? property.rooms.map((r) => ({ id: r.id, name: r.name })) : []} bookings={gantt} />
      <p className="text-xs text-muted-foreground">Ô sọc 🔒 là lịch bị khoá chéo do booking nguyên căn / phòng lẻ. Cột cam là đêm T6–T7. {others > 0 && `Có ${others} booking đã huỷ trong khoảng này (ẩn).`}</p>

      <section className="space-y-2">
        <h2 className="font-semibold">Booking trong khoảng này</h2>
        <BookingList rows={occ.map(toRow)} viewer="HOST" showProperty={false} />
      </section>
    </div>
  );
}
