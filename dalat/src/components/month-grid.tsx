import Link from "next/link";
import { toDateOnly } from "@/lib/format";
import { STATUS_STYLE } from "@/lib/status-style";

export type GridItem = {
  id: string; label: string; status: string; checkIn: Date; checkOut: Date;
  /** Có href thì chip bấm được; không (lịch kín của người khác) thì chỉ hiện ô sọc. */
  href?: string; busy?: boolean; title?: string;
};

const DAY = 86_400_000;
const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/**
 * Lịch tháng dạng lưới như lịch thường: 7 cột (T2→CN), mỗi hàng một tuần, mỗi ô một ngày.
 * Booking hiện ở mọi đêm nó chiếm (từ ngày check-in đến đêm trước ngày check-out).
 */
export function MonthGrid({ month, today, items }: { month: string; today: string; items: GridItem[] }) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // T2 = 0
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getTime() + i * DAY)),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="overflow-hidden rounded border border-black bg-white shadow-brutal-sm" role="grid" aria-label={`Lịch tháng ${m}/${y}`}>
      <div className="grid grid-cols-7 border-b border-black bg-muted text-center text-xs font-bold" role="row">
        {WD.map((w, i) => <div key={w} role="columnheader" className={`py-1.5 ${i >= 5 ? "text-red-700" : ""}`}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="min-h-20 border-b border-r border-black/15 bg-muted/40 md:min-h-28" />;
          const s = toDateOnly(d);
          const day = items.filter((b) => b.checkIn.getTime() <= d.getTime() && d.getTime() < b.checkOut.getTime());
          const weekend = i % 7 >= 5;
          return (
            <div key={s} role="gridcell" className={`min-h-20 min-w-0 space-y-0.5 border-b border-r border-black/15 p-0.5 md:min-h-28 md:p-1 ${weekend ? "bg-secondary/15" : ""}`}>
              <div className={`money-num mb-0.5 text-[11px] font-semibold md:text-xs ${s === today ? "inline-block rounded-full bg-primary px-1.5" : ""}`}>{Number(s.slice(8))}</div>
              {day.map((b) => {
                const startsHere = b.checkIn.getTime() === d.getTime();
                const cls = `block truncate rounded border border-black px-1 py-px text-[10px] leading-tight text-black md:text-xs ${b.busy ? "bg-cross-locked text-black/70" : STATUS_STYLE[b.status] ?? "bg-muted"} ${startsHere ? "font-bold" : "font-medium"}`;
                const text = b.busy ? "🔒" : b.label;
                return b.href
                  ? <Link key={b.id} href={b.href} title={b.title ?? b.label} className={cls}>{text}</Link>
                  : <div key={b.id} title={b.title} className={cls}>{text}</div>;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
