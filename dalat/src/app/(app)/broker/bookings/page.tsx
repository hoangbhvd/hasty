import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { BookingList, bookingInclude, toRow } from "@/components/booking-list";

export default async function BrokerBookingsPage() {
  const user = await requireUser();
  const rows = (await prisma.booking.findMany({
    where: { brokerId: user.id },
    orderBy: { checkIn: "desc" },
    take: 100,
    include: bookingInclude,
  })).map(toRow);

  const holding = rows.filter((r) => r.status === "HOLDING");
  const active = rows.filter((r) => r.status === "CONFIRMED" || r.status === "CHECKED_IN");
  const done = rows.filter((r) => r.status === "CHECKED_OUT" || r.status === "CANCELLED");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Booking của tôi</h1>
      {holding.length > 0 && <section className="space-y-2"><h2 className="font-semibold">Đang giữ phòng</h2><BookingList rows={holding} viewer="BROKER" /></section>}
      <section className="space-y-2"><h2 className="font-semibold">Sắp tới / đang ở</h2><BookingList rows={active} viewer="BROKER" /></section>
      {done.length > 0 && <section className="space-y-2"><h2 className="font-semibold">Đã xong / đã huỷ</h2><BookingList rows={done} viewer="BROKER" /></section>}
    </div>
  );
}
