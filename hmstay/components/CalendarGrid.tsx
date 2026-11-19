import Link from "next/link";
import { dow } from "@/lib/format";
import { Month, todayStr } from "@/lib/calendar";

export type CalUnit = { id: string; name: string };
export type CalBlock = { unit_id: string; check_in: string; check_out: string; label: string; title: string; tone: "confirmed" | "deposit" | "holding" | "block" | "busy" | "own" };

const TONE: Record<CalBlock["tone"], string> = {
  confirmed: "bg-emerald-500 text-white", deposit: "bg-blue-500 text-white",
  holding: "bg-amber-400 text-amber-950", block: "bg-slate-500 text-white", busy: "bg-slate-300 text-slate-700", own: "bg-violet-500 text-white",
};
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function CalendarNav({ base, m }: { base: string; m: Month }) {
  return (
    <div className="flex items-center gap-2">
      <Link className="btn-ghost" href={`${base}?m=${m.prev}`}>‹</Link>
      <span className="min-w-28 text-center font-semibold">{m.label}</span>
      <Link className="btn-ghost" href={`${base}?m=${m.next}`}>›</Link>
      <Link className="btn-ghost" href={base}>Hôm nay</Link>
    </div>
  );
}

export function CalendarGrid({ units, m, blocks }: { units: CalUnit[]; m: Month; blocks: CalBlock[] }) {
  const today = todayStr();
  const last = m.days[m.days.length - 1];
  // Ngày chạy theo chiều dọc, mỗi phòng một cột; booking nhiều đêm gộp ô theo chiều dọc (rowSpan)
  const skip: Record<string, number> = {};
  return (
    <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 w-14 border-b border-r border-slate-200 bg-white px-1 py-2 text-left">Ngày</th>
            {units.map((u) => (
              <th key={u.id} className="sticky top-0 z-10 min-w-24 border-b border-l border-slate-200 bg-white px-2 py-2 text-left font-medium">{u.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.days.map((d, i) => {
            const w = dow(d);
            const wk = w === 5 || w === 6;
            return (
              <tr key={d} className="h-9">
                <th className={`sticky left-0 z-10 border-b border-r border-slate-200 px-1 py-1 text-left font-medium ${d === today ? "bg-teal-100 text-teal-900" : wk ? "bg-slate-50 text-slate-500" : "bg-white"}`}>
                  <span className="text-sm">{Number(d.slice(8))}</span> <span className="text-[10px] font-normal">{WD[w]}</span>
                </th>
                {units.map((u) => {
                  if (skip[u.id] > 0) { skip[u.id]--; return null; }
                  const b = blocks.find((x) => x.unit_id === u.id && x.check_in <= d && d < x.check_out);
                  if (b) {
                    // Chiếm các đêm check_in .. check_out-1; cắt ở cuối tháng
                    const span = (b.check_out > last ? m.days.length : m.days.indexOf(b.check_out)) - i;
                    skip[u.id] = span - 1;
                    return (
                      <td key={u.id} rowSpan={span} className="border-b border-l border-slate-100 p-0.5 align-top" title={b.title}>
                        <div style={{ minHeight: span * 36 - 4 }} className={`whitespace-pre-line rounded px-1.5 py-1 ${TONE[b.tone]}`}>{b.label}</div>
                      </td>
                    );
                  }
                  return <td key={u.id} className={`h-9 border-b border-l border-slate-100 ${wk ? "bg-slate-50" : ""} ${d === today ? "bg-teal-50" : ""}`} />;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Legend({ items }: { items: [CalBlock["tone"], string][] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
      {items.map(([t, l]) => (<span key={t} className="flex items-center gap-1"><i className={`inline-block h-3 w-3 rounded ${TONE[t].split(" ")[0]}`} />{l}</span>))}
    </div>
  );
}
