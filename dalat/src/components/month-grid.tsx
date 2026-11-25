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
 * Booking là MỘT THANH liền chạy qua các đêm nó chiếm (ngày check-in → đêm trước ngày check-out).
 * Khi thanh vắt sang tuần sau thì tiếp tục ở hàng dưới (đầu thanh phẳng + mũi tên ‹ ›, nhắc lại tên khách).
 */
export function MonthGrid({ month, today, items, newHref, canCreate }: {
  month: string; today: string; items: GridItem[];
  /** Có thì ngày trống (từ hôm nay trở đi, không có đêm nào bị chiếm) bấm được để tạo booking bắt đầu ngày đó. */
  newHref?: (date: string) => string;
  /** Ghi đè điều kiện "ngày trống" (mặc định: không booking nào chiếm đêm đó) — dùng khi lịch gộp nhiều căn. */
  canCreate?: (date: string) => boolean;
}) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // T2 = 0
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const pos = (d: Date) => Math.round((d.getTime() - first.getTime()) / DAY) + lead; // vị trí ô trong lưới
  const lo = lead, hi = lead + daysInMonth - 1;

  // Mỗi booking → khoảng ô [a, b] (b = đêm cuối), cắt theo tháng đang xem
  const spans = items
    .map((it) => ({ it, a: pos(it.checkIn), b: pos(it.checkOut) - 1 }))
    .filter((x) => x.b >= x.a && x.b >= lo && x.a <= hi)
    .sort((p, q) => p.a - q.a || q.b - p.b);

  const busyPos = new Set<number>();
  for (const x of spans) for (let k = Math.max(x.a, lo); k <= Math.min(x.b, hi); k++) busyPos.add(k);

  const weeks = Array.from({ length: total / 7 }, (_, w) => {
    const w0 = w * 7, w1 = w0 + 6;
    const lanes: number[] = []; // lanes[k] = ô cuối đã dùng của làn k
    const bars = spans.filter((x) => x.a <= w1 && x.b >= w0).map((x) => {
      const start = Math.max(x.a, w0, lo), end = Math.min(x.b, w1, hi);
      let lane = lanes.findIndex((last) => last < start);
      if (lane < 0) { lane = lanes.length; lanes.push(end); } else lanes[lane] = end;
      return { ...x, start, end, lane, w0 };
    });
    return { w0, bars, laneCount: Math.max(lanes.length, 1) };
  });

  return (
    <div className="overflow-hidden rounded border border-black bg-white shadow-brutal-sm" role="grid" aria-label={`Lịch tháng ${m}/${y}`}>
      <div className="grid grid-cols-7 border-b border-black bg-muted text-center text-xs font-bold" role="row">
        {WD.map((w, i) => <div key={w} role="columnheader" className={`py-1.5 ${i >= 5 ? "text-red-700" : ""}`}>{w}</div>)}
      </div>
      {weeks.map(({ w0, bars, laneCount }) => (
        <div key={w0} role="row" className="grid grid-cols-7 border-b border-black/15 last:border-b-0"
          style={{ gridTemplateRows: `auto repeat(${laneCount}, 1.5rem) 0.25rem` }}>
          {Array.from({ length: 7 }, (_, c) => {
            const p = w0 + c;
            const inMonth = p >= lo && p <= hi;
            const date = inMonth ? toDateOnly(new Date(first.getTime() + (p - lead) * DAY)) : "";
            const cell = `min-h-16 border-r border-black/15 last:border-r-0 md:min-h-24 ${!inMonth ? "bg-muted/40" : c >= 5 ? "bg-secondary/15" : ""}`;
            const style = { gridColumn: c + 1, gridRow: `1 / span ${laneCount + 2}` };
            return newHref && inMonth && date >= today && (canCreate ? canCreate(date) : !busyPos.has(p))
              ? (
                <Link key={c} role="gridcell" href={newHref(date)} style={style} aria-label={`Tạo booking từ ngày ${date.slice(8)}/${date.slice(5, 7)}`}
                  className={`${cell} group flex items-end justify-end p-1 hover:bg-primary/25 focus-visible:bg-primary/25`}>
                  <span aria-hidden className="text-lg leading-none font-bold opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60 max-md:opacity-25">+</span>
                </Link>
              )
              : <div key={c} role="gridcell" style={style} className={cell} />;
          })}
          {Array.from({ length: 7 }, (_, c) => {
            const p = w0 + c;
            if (p < lo || p > hi) return null;
            const s = toDateOnly(new Date(first.getTime() + (p - lead) * DAY));
            return (
              <div key={`n${c}`} style={{ gridColumn: c + 1, gridRow: 1 }} className="pointer-events-none z-[1] p-0.5 md:p-1">
                <span className={`money-num text-[11px] font-semibold md:text-xs ${s === today ? "inline-block rounded-full bg-primary px-1.5" : ""}`}>{Number(s.slice(8))}</span>
              </div>
            );
          })}
          {bars.map(({ it, a, b, start, end, lane }) => {
            const contFrom = a < start; // đã bắt đầu từ tuần/tháng trước
            const contTo = b > end;     // còn kéo dài sang sau
            const cls = `z-[2] mx-px my-px flex min-w-0 items-center overflow-hidden border border-black px-1 text-[10px] leading-tight text-black md:text-xs ${contFrom ? "rounded-l-none border-l-0" : "rounded-l"} ${contTo ? "rounded-r-none border-r-0" : "rounded-r"} ${it.busy ? "bg-cross-locked text-black/70" : STATUS_STYLE[it.status] ?? "bg-muted"} ${contFrom ? "font-medium" : "font-bold"}`;
            const style = { gridColumn: `${start - w0 + 1} / ${end - w0 + 2}`, gridRow: lane + 2 };
            const text = <span className="truncate">{contFrom && "‹ "}{it.busy ? "🔒" : it.label}{contTo && " ›"}</span>;
            return it.href
              ? <Link key={`${it.id}-${w0}`} href={it.href} title={it.title ?? it.label} style={style} className={cls}>{text}</Link>
              : <div key={`${it.id}-${w0}`} title={it.title} style={style} className={cls}>{text}</div>;
          })}
        </div>
      ))}
    </div>
  );
}
