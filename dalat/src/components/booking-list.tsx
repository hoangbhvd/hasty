import Link from "next/link";
import { BookingActions } from "@/components/booking-actions";
import { Badge, BOOKING_TONE } from "@/components/ui/badge";
import { formatDateTimeVi, formatDateVi, formatVnd } from "@/lib/format";

export type BookingRow = {
  id: string; bookingCode: string; status: string; bookingType: string; guestName: string; guestPhone: string | null;
  guestCount: number; checkIn: Date; checkOut: Date; holdExpiresAt: Date | null;
  guestTotalPrice: unknown; hostNetPrice: unknown; commissionAmount: unknown;
  propertyName: string; roomNames: string[]; brokerName: string | null; manualRoomInfo: string | null;
};

export const STATUS_LABEL: Record<string, string> = {
  HOLDING: "Đang giữ", CONFIRMED: "Đã xác nhận", CHECKED_IN: "Đang ở", CHECKED_OUT: "Đã trả phòng", CANCELLED: "Đã huỷ",
};
/** Màu thanh booking trên lịch (cùng bảng màu với Badge trạng thái). */
export const STATUS_STYLE: Record<string, string> = {
  HOLDING: "bg-status-holding",
  CONFIRMED: "bg-status-confirmed-bg",
  CHECKED_IN: "bg-status-checked-in",
  CHECKED_OUT: "bg-muted",
  CANCELLED: "bg-status-cancelled",
};

export function BookingList({ rows, viewer, showProperty = true }: { rows: BookingRow[]; viewer: "HOST" | "BROKER"; showProperty?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Chưa có booking.</p>;
  return (
    <ul className="divide-y divide-black rounded border border-black bg-white">
      {rows.map((b) => (
        <li key={b.id} id={`b-${b.id}`} className="scroll-mt-20 space-y-2 p-3 target:bg-muted/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">
              {b.guestName} <span className="font-mono text-sm font-normal text-muted-foreground">· {b.bookingCode}</span>
            </div>
            <Badge tone={BOOKING_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {showProperty && <>{b.propertyName} · </>}
            {formatDateVi(b.checkIn)} → {formatDateVi(b.checkOut)} · {b.guestCount} khách
            {b.bookingType === "ROOMS" && b.roomNames.length > 0 && <> · {b.roomNames.join(", ")}</>}
            {b.manualRoomInfo && <> · {b.manualRoomInfo}</>}
            {b.guestPhone && <> · {b.guestPhone}</>}
            {viewer === "HOST" && b.brokerName && <> · CTV {b.brokerName}</>}
          </div>
          <div className="money-num text-sm">
            Khách trả: <strong>{formatVnd(b.guestTotalPrice)}</strong>
            {viewer === "HOST" ? <> · Chủ nhận: {formatVnd(b.hostNetPrice)}</> : <> · Net: {formatVnd(b.hostNetPrice)} · Hoa hồng: {formatVnd(b.commissionAmount)}</>}
          </div>
          {b.status === "HOLDING" && b.holdExpiresAt && (
            <div className="money-num text-sm font-semibold">⏱ Giữ đến {formatDateTimeVi(b.holdExpiresAt)}</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <BookingActions id={b.id} status={b.status} />
            <Link href={`/${viewer === "HOST" ? "host" : "broker"}/bookings/${b.id}`} className="brutal-btn inline-flex h-9 items-center bg-white px-3 text-sm text-black">Chi tiết · Thanh toán</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const bookingInclude = {
  property: { select: { name: true } },
  rooms: { include: { room: { select: { name: true } } } },
  broker: { select: { fullName: true } },
} as const;

export function toRow(b: {
  id: string; bookingCode: string; status: string; bookingType: string; guestName: string; guestPhone: string | null;
  guestCount: number; checkIn: Date; checkOut: Date; holdExpiresAt: Date | null; manualRoomInfo: string | null;
  guestTotalPrice: unknown; hostNetPrice: unknown; commissionAmount: unknown;
  property: { name: string }; rooms: { room: { name: string } }[]; broker: { fullName: string } | null;
}): BookingRow {
  return { ...b, propertyName: b.property.name, roomNames: b.rooms.map((r) => r.room.name), brokerName: b.broker?.fullName ?? null };
}
