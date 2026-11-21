import Link from "next/link";
import { toDateOnly } from "@/lib/format";
import { STATUS_STYLE } from "@/components/booking-list";
import type { CalBlock, CalProperty } from "@/lib/broker-calendar";

const DAY = 86_400_000;
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/**
 * Lịch CTV: hàng = ngày (đêm), cột = các homestay ĐƯỢC CHỌN. Càng nhiều căn, cột càng hẹp (chỉ còn màu);
 * booking nhiều đêm là 1 khối liền. Ô "Kín" = lịch bị người khác chiếm (không lộ chi tiết).
 */
export function PropertyCalendar({
  from, days, today, properties, blocks,
}: { from: Date; days: number; today: string; properties: CalProperty[]; blocks: CalBlock[] }) {
  const n = properties.length;
  const compact = n > 4;
  const cols = Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * DAY));
  const colIndex = new Map(properties.map((p, i) => [p.id, i]));
  const idx = (d: Date) => Math.round((d.getTime() - from.getTime()) / DAY);
  const template = `3.5rem repeat(${n}, minmax(${compact ? "0" : "5.5rem"}, 1fr))`;
  const rowH = compact ? "2.25rem" : "2.75rem";

  return (
    <div className="overflow-x-auto rounded border border-black bg-white shadow-brutal-sm" role="region" aria-label="Lịch các homestay" tabIndex={0}>
      <div className="grid w-full" style={{ gridTemplateColumns: template, gridTemplateRows: `auto repeat(${days}, ${rowH})` }}>
        <div className="sticky left-0 top-0 z-30 border-b border-r border-black bg-muted p-1.5 text-xs font-bold" style={{ gridColumn: 1, gridRow: 1 }}>Ngày</div>
        {properties.map((p, ci) => (
          <div
            key={p.id} title={p.name}
            className="overflow-hidden border-b border-r border-black bg-muted p-1 text-xs font-bold last:border-r-0"
            style={{ gridColumn: ci + 2, gridRow: 1 }}
          >
            {compact
              ? <span className="mx-auto block max-h-24 truncate [writing-mode:vertical-rl] rotate-180">{p.name}</span>
              : <span className="block truncate">{p.name}</span>}
          </div>
        ))}
        {cols.map((c, i) => {
          const s = toDateOnly(c);
          const weekend = [5, 6].includes(c.getUTCDay());
          return (
            <div key={s} className="contents">
              <div
                className={`money-num sticky left-0 z-20 flex flex-col justify-center border-b border-r border-black/60 px-1.5 text-xs leading-tight ${s === today ? "bg-primary font-bold" : weekend ? "bg-secondary/40" : "bg-white"}`}
                style={{ gridColumn: 1, gridRow: i + 2 }}
              >
                <span>{WD[c.getUTCDay()]}</span><span>{s.slice(8)}/{s.slice(5, 7)}</span>
              </div>
              {properties.map((p, ci) => (
                <div key={p.id} style={{ gridColumn: ci + 2, gridRow: i + 2 }} className={`border-b border-r border-black/15 last:border-r-0 ${weekend ? "bg-secondary/15" : ""}`} />
              ))}
            </div>
          );
        })}
        {blocks.map((b, k) => {
          const ci = colIndex.get(b.propertyId);
          const start = Math.max(idx(b.checkIn), 0);
          const end = Math.min(idx(b.checkOut), days);
          if (ci === undefined || end <= start) return null;
          const busy = b.guestName === null; // kín: không có thông tin khách
          const label = busy ? "Kín" : [b.guestName, b.guestPhone].filter(Boolean).join(" · ");
          const cls = `z-[1] m-px flex items-start overflow-hidden rounded border border-black text-xs font-semibold text-black ${compact ? "px-0 py-0.5" : "px-1.5 py-1"} ${busy ? "bg-cross-locked font-medium text-black/70" : STATUS_STYLE[b.status] ?? "bg-muted"}`;
          const style = { gridColumn: ci + 2, gridRow: `${start + 2} / ${end + 2}` };
          const title = `${properties[ci].name} · ${label}${busy ? " (đã có người đặt)" : ""}`;
          const text = compact ? null : <span className="sticky top-9 line-clamp-3 break-words">{busy ? "🔒 Kín" : <>{b.guestName}{b.guestPhone && <><br /><span className="font-normal">{b.guestPhone}</span></>}</>}</span>;
          return busy
            ? <div key={k} style={style} title={title} className={cls}>{text}</div>
            : <Link key={k} href={`/broker/bookings/${b.bookingId}`} style={style} title={title} className={cls}>{text}</Link>;
        })}
      </div>
    </div>
  );
}
