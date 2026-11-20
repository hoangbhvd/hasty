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

  const vtemplate = `3.75rem repeat(${rows.length}, minmax(6.5rem, 1fr))`;

  return (
    <>
    {/* Mobile: ngày xếp DỌC (mỗi hàng 1 đêm), cột = Nguyên căn / từng phòng. Booking nhiều đêm là 1 khối liền. */}
    <div className="overflow-x-auto rounded border border-black bg-white shadow-brutal-sm md:hidden" role="region" aria-label="Lịch đặt phòng (dọc)" tabIndex={0}>
      <div className="grid min-w-full" style={{ gridTemplateColumns: vtemplate, gridTemplateRows: `auto repeat(${days}, 2.75rem)` }}>
        <div className="sticky left-0 top-0 z-30 border-b border-r border-black bg-muted p-2 text-xs font-bold" style={{ gridColumn: 1, gridRow: 1 }}>Ngày</div>
        {rows.map((r, ci) => (
          <div key={r.key} className="truncate border-b border-r border-black bg-muted p-2 text-xs font-bold last:border-r-0" style={{ gridColumn: ci + 2, gridRow: 1 }}>{r.label}</div>
        ))}
        {cols.map((c, i) => {
          const s = toDateOnly(c);
          const weekend = [5, 6].includes(c.getUTCDay());
          return (
            <div key={s} className="contents">
              <div
                className={`money-num sticky left-0 z-20 flex flex-col justify-center border-b border-r border-black/60 px-2 text-xs ${s === today ? "bg-primary font-bold" : weekend ? "bg-secondary/40" : "bg-white"}`}
                style={{ gridColumn: 1, gridRow: i + 2 }}
              >
                <span>{WD[c.getUTCDay()]}</span>
                <span>{s.slice(8)}/{s.slice(5, 7)}</span>
              </div>
              {rows.map((row, ci) => (
                <div key={row.key} style={{ gridColumn: ci + 2, gridRow: i + 2 }} className={`border-b border-r border-black/15 last:border-r-0 ${weekend ? "bg-secondary/15" : ""}`} />
              ))}
            </div>
          );
        })}
        {rows.map((row, ci) =>
          row.segs.map(({ b, start, end, lock }) => (
            <a
              key={`v-${b.id}-${row.key}`}
              href={`#b-${b.id}`}
              style={{ gridColumn: ci + 2, gridRow: `${start + 2} / ${end + 2}` }}
              title={`${b.guestName}${b.brokerName ? ` · CTV ${b.brokerName}` : ""}${lock ? " (khoá chéo)" : ""}`}
              className={`z-[1] m-0.5 flex items-start rounded border border-black px-1.5 py-1 text-xs font-semibold text-black ${
                lock ? "bg-cross-locked font-medium text-black/70" : STATUS_STYLE[b.status]
              }`}
            >
              <span className="sticky top-9 line-clamp-2 break-words">{lock ? `🔒 ${b.guestName}` : b.guestName}</span>
            </a>
          )),
        )}
      </div>
    </div>

    {/* Desktop: lịch ngang */}
    <div className="hidden overflow-x-auto rounded border border-black bg-white shadow-brutal-sm md:block" role="region" aria-label="Lịch đặt phòng" tabIndex={0}>
      <div className="min-w-max">
        <div className="grid border-b border-black bg-muted text-center text-xs" style={{ gridTemplateColumns: template }}>
          <div className="sticky left-0 z-10 border-r border-black bg-muted p-2 text-left font-bold">Phòng</div>
          {cols.map((c) => {
            const s = toDateOnly(c);
            const weekend = [5, 6].includes(c.getUTCDay());
            return (
              <div key={s} className={`money-num py-1 ${weekend ? "bg-secondary/25" : ""} ${s === today ? "bg-primary font-bold" : ""}`}>
                <div>{WD[c.getUTCDay()]}</div>
                <div>{s.slice(8)}/{s.slice(5, 7)}</div>
              </div>
            );
          })}
        </div>

        {rows.map((row) => (
          <div key={row.key} className="relative grid h-11 border-b border-black last:border-b-0" style={{ gridTemplateColumns: template }}>
            <div className="sticky left-0 z-10 flex items-center truncate border-r border-black bg-white px-2 text-sm font-semibold">{row.label}</div>
            {cols.map((c, i) => (
              <div key={i} style={{ gridColumn: i + 2, gridRow: 1 }} className={`border-r border-black/15 ${[5, 6].includes(c.getUTCDay()) ? "bg-secondary/15" : ""}`} />
            ))}
            {row.segs.map(({ b, start, end, lock }) => (
              <a
                key={`${b.id}-${row.key}`}
                href={`#b-${b.id}`}
                style={{ gridColumn: `${start + 2} / ${end + 2}`, gridRow: 1 }}
                title={`${b.guestName}${b.brokerName ? ` · CTV ${b.brokerName}` : ""}${lock ? " (khoá chéo)" : ""}`}
                className={`z-[1] m-0.5 flex items-center truncate rounded border border-black px-1.5 text-xs font-semibold text-black ${
                  lock ? "bg-cross-locked font-medium text-black/70" : STATUS_STYLE[b.status]
                }`}
              >
                {lock ? `🔒 ${b.guestName}` : b.guestName}
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
