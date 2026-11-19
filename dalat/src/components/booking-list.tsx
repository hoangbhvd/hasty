import { BookingActions } from "@/components/booking-actions";
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
export const STATUS_STYLE: Record<string, string> = {
  HOLDING: "bg-amber-100 text-amber-900 border-amber-300",
  CONFIRMED: "bg-green-100 text-green-900 border-green-300",
  CHECKED_IN: "bg-blue-100 text-blue-900 border-blue-300",
  CHECKED_OUT: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

export function BookingList({ rows, viewer, showProperty = true }: { rows: BookingRow[]; viewer: "HOST" | "BROKER"; showProperty?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Chưa có booking.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((b) => (
        <li key={b.id} id={`b-${b.id}`} className="scroll-mt-20 space-y-2 p-3 target:bg-muted/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">
              {b.guestName} <span className="text-sm font-normal text-muted-foreground">· {b.bookingCode}</span>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {showProperty && <>{b.propertyName} · </>}
            {formatDateVi(b.checkIn)} → {formatDateVi(b.checkOut)} · {b.guestCount} khách
            {b.bookingType === "ROOMS" && b.roomNames.length > 0 && <> · {b.roomNames.join(", ")}</>}
            {b.manualRoomInfo && <> · {b.manualRoomInfo}</>}
            {b.guestPhone && <> · {b.guestPhone}</>}
            {viewer === "HOST" && b.brokerName && <> · CTV {b.brokerName}</>}
          </div>
          <div className="text-sm">
            Khách trả: <strong>{formatVnd(b.guestTotalPrice)}</strong>
            {viewer === "HOST" ? <> · Chủ nhận: {formatVnd(b.hostNetPrice)}</> : <> · Net: {formatVnd(b.hostNetPrice)} · Hoa hồng: {formatVnd(b.commissionAmount)}</>}
          </div>
          {b.status === "HOLDING" && b.holdExpiresAt && (
            <div className="text-sm text-amber-800">Giữ đến {formatDateTimeVi(b.holdExpiresAt)}</div>
          )}
          <BookingActions id={b.id} status={b.status} />
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
