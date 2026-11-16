import Link from "next/link";
import { dow } from "@/lib/format";
import { Month, todayStr } from "@/lib/calendar";

export type CalUnit = { id: string; name: string };
export type CalBlock = { unit_id: string; check_in: string; check_out: string; label: string; title: string; tone: "confirmed" | "deposit" | "holding" | "block" | "busy" };

const TONE: Record<CalBlock["tone"], string> = {
  confirmed: "bg-emerald-500 text-white", deposit: "bg-blue-500 text-white",
  holding: "bg-amber-400 text-amber-950", block: "bg-slate-500 text-white", busy: "bg-slate-300 text-slate-700",
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
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-28 border-b border-r border-slate-200 bg-white px-2 py-2 text-left">Phòng</th>
            {m.days.map((d) => {
              const w = dow(d);
              return (
                <th key={d} className={`min-w-9 border-b border-slate-200 px-0.5 py-1 font-medium ${w === 5 || w === 6 ? "bg-slate-50 text-slate-500" : ""} ${d === today ? "bg-teal-100 text-teal-900" : ""}`}>
                  <div>{Number(d.slice(8))}</div><div className="text-[10px] font-normal">{WD[w]}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const mine = blocks.filter((b) => b.unit_id === u.id);
            const cells: React.ReactNode[] = [];
            for (let i = 0; i < m.days.length; ) {
              const d = m.days[i];
              const b = mine.find((x) => x.check_in <= d && d < x.check_out);
              if (b) {
                // Chiếm các đêm check_in .. check_out-1; cắt ở cuối tháng
                const span = (b.check_out > last ? m.days.length : m.days.indexOf(b.check_out)) - i;
                cells.push(
                  <td key={d} colSpan={span} className="border-b border-slate-100 p-0.5" title={b.title}>
                    <div className={`truncate rounded px-1.5 py-1 ${TONE[b.tone]}`}>{b.label}</div>
                  </td>,
                );
                i += span;
              } else {
                const w = dow(d);
                cells.push(<td key={d} className={`h-8 border-b border-l border-slate-100 ${w === 5 || w === 6 ? "bg-slate-50" : ""} ${d === today ? "bg-teal-50" : ""}`} />);
                i += 1;
              }
            }
            return (
              <tr key={u.id}>
                <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-2 py-1 text-left font-medium">{u.name}</th>
                {cells}
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
