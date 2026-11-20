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
    {/* Mobile: ngày xếp DỌC (mỗi hàng 1 đêm), cột = Nguyên căn / từng phòng */}
    <div className="overflow-x-auto rounded border border-black bg-white shadow-brutal-sm md:hidden" role="region" aria-label="Lịch đặt phòng (dọc)" tabIndex={0}>
      <div className="min-w-max" style={{ minWidth: "100%" }}>
        <div className="sticky top-0 z-20 grid border-b border-black bg-muted text-xs font-bold" style={{ gridTemplateColumns: vtemplate }}>
          <div className="sticky left-0 z-30 border-r border-black bg-muted p-2">Ngày</div>
          {rows.map((r) => <div key={r.key} className="truncate border-r border-black/30 p-2 last:border-r-0">{r.label}</div>)}
        </div>
        {cols.map((c, i) => {
          const s = toDateOnly(c);
          const weekend = [5, 6].includes(c.getUTCDay());
          return (
            <div key={s} className="grid min-h-11 border-b border-black/60 last:border-b-0" style={{ gridTemplateColumns: vtemplate }}>
              <div className={`money-num sticky left-0 z-10 flex flex-col justify-center border-r border-black px-2 py-1 text-xs ${s === today ? "bg-primary font-bold" : weekend ? "bg-secondary/40" : "bg-white"}`}>
                <span>{WD[c.getUTCDay()]}</span>
                <span>{s.slice(8)}/{s.slice(5, 7)}</span>
              </div>
              {rows.map((row) => {
                const hit = row.segs.find((g) => g.start <= i && i < g.end);
                return (
                  <div key={row.key} className={`border-r border-black/15 p-0.5 last:border-r-0 ${weekend ? "bg-secondary/15" : ""}`}>
                    {hit && (
                      <a
                        href={`#b-${hit.b.id}`}
                        title={`${hit.b.guestName}${hit.b.brokerName ? ` · CTV ${hit.b.brokerName}` : ""}${hit.lock ? " (khoá chéo)" : ""}`}
                        className={`flex h-full min-h-9 items-center truncate rounded border border-black px-1.5 text-xs font-semibold text-black ${
                          hit.lock ? "bg-cross-locked font-medium text-black/70" : STATUS_STYLE[hit.b.status]
                        }`}
                      >
                        {hit.start === i || i === 0 ? `${hit.lock ? "🔒 " : ""}${hit.b.guestName}` : <span aria-hidden className="mx-auto text-black/50">│</span>}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
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
