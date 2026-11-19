import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { BookingPlanner } from "@/components/booking-planner";

export default async function HostNewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string; checkIn?: string; checkOut?: string; type?: string; rooms?: string | string[] }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const properties = await prisma.property.findMany({
    where: { sourceType: "HOST_MANAGED", hostId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/host/calendar" className="text-sm text-muted-foreground">← Lịch</Link>
      <h1 className="text-2xl font-semibold">Tạo booking thủ công</h1>
      <p className="text-sm text-muted-foreground">Dành cho khách lẻ / khách từ OTA. Booking vào thẳng trạng thái “Đã xác nhận”.</p>
      {properties.length === 0 ? (
        <p className="text-muted-foreground">Bạn chưa có căn nào.</p>
      ) : (
        <BookingPlanner
          as="HOST" userId={user.id} basePath="/host/bookings/new" properties={properties}
          params={{ ...sp, rooms: sp.rooms === undefined ? undefined : Array.isArray(sp.rooms) ? sp.rooms : [sp.rooms] }}
        />
      )}
    </div>
  );
}
