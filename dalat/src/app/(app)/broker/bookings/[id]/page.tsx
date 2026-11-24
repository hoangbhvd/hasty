import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { BookingDetail } from "@/components/booking-detail";
import { getBookingForParty } from "@/lib/booking-finance";
import { coHostBookingView } from "@/lib/staff-booking";
import { BookingActions } from "@/components/booking-actions";
import { Badge, BOOKING_TONE } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/components/booking-list";
import { formatDateTimeVi, formatDateVi, formatVnd, guestsText } from "@/lib/format";

function Row({ k, val }: { k: string; val: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-1"><dt>{k}</dt><dd className="money-num text-right font-semibold">{val}</dd></div>;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  if (await getBookingForParty(user.id, id)) return <BookingDetail userId={user.id} bookingId={id} viewer="BROKER" />;

  // Không phải booking của mình: chỉ Co-host của căn mới xem được
  const v = await coHostBookingView(user.id, id);
  if (!v) notFound();
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/broker/calendar" className="text-sm text-muted-foreground">← Quay lại</Link>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <h1 className="text-2xl font-bold">{v.guestName}</h1>
          <Badge tone={BOOKING_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
        </div>
        <p className="font-mono text-sm text-muted-foreground">{v.code} · Co-host xem</p>
      </div>
      <section className="space-y-2 rounded border border-black bg-white p-4 shadow-brutal-sm">
        <dl className="divide-y divide-black/10 text-sm">
          <Row k="Căn" val={v.property} />
          <Row k="Hạng phòng" val={v.roomText || "—"} />
          <Row k="Nhận → trả phòng" val={`${formatDateVi(v.checkIn)} → ${formatDateVi(v.checkOut)}`} />
          <Row k="Số khách" val={guestsText(v.guestCount, v.childCount)} />
          {v.guestPhone && <Row k="SĐT khách" val={<a href={`tel:${v.guestPhone}`} className="underline">{v.guestPhone}</a>} />}
          {v.guestNote && <Row k="Ghi chú" val={v.guestNote} />}
          <Row k="Người tạo" val={v.createdBy} />
          {v.holdExpiresAt && v.status === "HOLDING" && <Row k="Giữ đến" val={formatDateTimeVi(v.holdExpiresAt)} />}
          <Row k="Tổng tiền khách" val={formatVnd(v.total)} />
          {v.hostNet !== null && <Row k="Giá Net chủ thu" val={formatVnd(v.hostNet)} />}
        </dl>
        <BookingActions id={v.id} status={v.status} />
      </section>
    </div>
  );
}
