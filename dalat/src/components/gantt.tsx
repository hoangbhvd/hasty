import { toDateOnly } from "@/lib/format";
import { STATUS_STYLE } from "@/components/booking-list";

export type GanttBooking = {
  id: string; guestName: string; status: string; bookingType: "WHOLE_UNIT" | "ROOMS" | "EXTERNAL_MANUAL";
  checkIn: Date; checkOut: Date; roomIds: string[]; brokerName: string | null;
};

const DAY = 86_400_000;
const CELL = 44;
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Lịch ngang: cột = đêm, hàng = Nguyên căn + từng phòng. Booking của hàng kia hiện dạng ô sọc (khoá chéo). */
export function Gantt({
  from, days, today, rooms, bookings,
}: {
  from: Date; days: number; today: string;
  rooms: { id: string; name: string }[];
  bookings: GanttBooking[];
}) {
  const cols = Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * DAY));
  const template = `140px repeat(${days}, ${CELL}px)`;
  const idx = (d: Date) => Math.round((d.getTime() - from.getTime()) / DAY);

  type Seg = { b: GanttBooking; start: number; end: number; lock: boolean };
  const seg = (b: GanttBooking, lock: boolean): Seg | null => {
    const start = Math.max(idx(b.checkIn), 0);
    const end = Math.min(idx(b.checkOut), days);
    return end > start ? { b, start, end, lock } : null;
  };

  const rows: { key: string; label: string; segs: Seg[] }[] = [
    {
      key: "whole", label: "Nguyên căn",
      segs: bookings.flatMap((b) => seg(b, b.bookingType === "ROOMS") ?? []),
    },
    ...rooms.map((r) => ({
      key: r.id, label: r.name,
      segs: bookings.flatMap((b) =>
        b.bookingType === "WHOLE_UNIT" ? seg(b, true) ?? [] : b.roomIds.includes(r.id) ? seg(b, false) ?? [] : []),
    })),
  ];

  return (
    <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Lịch đặt phòng" tabIndex={0}>
      <div className="min-w-max">
        <div className="grid border-b bg-muted/40 text-center text-xs" style={{ gridTemplateColumns: template }}>
          <div className="sticky left-0 z-10 bg-muted p-2 text-left font-medium">Phòng</div>
          {cols.map((c) => {
            const s = toDateOnly(c);
            const weekend = [5, 6].includes(c.getUTCDay());
            return (
              <div key={s} className={`py-1 ${weekend ? "bg-orange-50" : ""} ${s === today ? "font-bold text-primary" : ""}`}>
                <div>{WD[c.getUTCDay()]}</div>
                <div>{s.slice(8)}/{s.slice(5, 7)}</div>
              </div>
            );
          })}
        </div>

        {rows.map((row) => (
          <div key={row.key} className="relative grid h-11 border-b last:border-b-0" style={{ gridTemplateColumns: template }}>
            <div className="sticky left-0 z-10 flex items-center truncate border-r bg-background px-2 text-sm font-medium">{row.label}</div>
            {cols.map((c, i) => (
              <div key={i} style={{ gridColumn: i + 2, gridRow: 1 }} className={`border-r ${[5, 6].includes(c.getUTCDay()) ? "bg-orange-50/60" : ""}`} />
            ))}
            {row.segs.map(({ b, start, end, lock }) => (
              <a
                key={`${b.id}-${row.key}`}
                href={`#b-${b.id}`}
                style={{ gridColumn: `${start + 2} / ${end + 2}`, gridRow: 1 }}
                title={`${b.guestName}${b.brokerName ? ` · CTV ${b.brokerName}` : ""}${lock ? " (khoá chéo)" : ""}`}
                className={`z-[1] m-0.5 flex items-center truncate rounded border px-1.5 text-xs ${
                  lock
                    ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.08)_4px,rgba(0,0,0,0.08)_8px)] text-muted-foreground"
                    : STATUS_STYLE[b.status]
                }`}
              >
                {lock ? `🔒 ${b.guestName}` : b.guestName}
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
