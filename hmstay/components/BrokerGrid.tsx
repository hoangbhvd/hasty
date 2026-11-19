import { dow } from "@/lib/format";
import { Month, todayStr } from "@/lib/calendar";

export type GridItem = { prop_id: string; check_in: string; check_out: string; label: string; title: string; tone: "own" | "confirmed" | "deposit" | "holding" };
export type GridProp = { id: string; name: string };

const TONE: Record<GridItem["tone"], string> = {
  own: "bg-violet-500 text-white", confirmed: "bg-emerald-500 text-white", deposit: "bg-blue-500 text-white", holding: "bg-amber-400 text-amber-950",
};
export const BROKER_TONES: [GridItem["tone"], string][] = [
  ["own", "Cơ sở tự quản"], ["confirmed", "Đã chốt (cơ sở của chủ)"], ["deposit", "Đã báo cọc"], ["holding", "Đang giữ chỗ"],
];
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Xếp booking của một cơ sở vào các "làn": booking chồng ngày nằm ở làn khác nhau. */
function lanes(items: GridItem[]): GridItem[][] {
  const out: GridItem[][] = [];
  for (const it of [...items].sort((a, b) => a.check_in.localeCompare(b.check_in) || a.check_out.localeCompare(b.check_out))) {
    const lane = out.find((l) => l[l.length - 1].check_out <= it.check_in);
    if (lane) lane.push(it); else out.push([it]);
  }
  return out.length ? out : [[]];
}

/** Cơ sở theo chiều ngang, ngày theo chiều dọc; booking nhiều đêm gộp ô theo chiều dọc. */
export function BrokerGrid({ props, m, items }: { props: GridProp[]; m: Month; items: GridItem[] }) {
  const today = todayStr();
  const last = m.days[m.days.length - 1];
  const cols = props.flatMap((p) => lanes(items.filter((i) => i.prop_id === p.id)).map((l, k) => ({ key: `${p.id}:${k}`, prop: p, lane: l, first: k === 0 })));
  const span = (p: GridProp) => cols.filter((c) => c.prop.id === p.id).length;
  const skip: Record<string, number> = {};
  return (
    <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 w-14 border-b border-r border-slate-200 bg-white px-1 py-2 text-left">Ngày</th>
            {props.map((p) => (
              <th key={p.id} colSpan={span(p)} className="sticky top-0 z-10 min-w-32 border-b border-l border-slate-200 bg-white px-2 py-2 text-left font-medium">{p.name}</th>
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
                {cols.map((c) => {
                  if (skip[c.key] > 0) { skip[c.key]--; return null; }
                  const b = c.lane.find((x) => x.check_in <= d && d < x.check_out);
                  const edge = c.first ? "border-l" : "border-l border-l-slate-50";
                  if (b) {
                    const rows = (b.check_out > last ? m.days.length : m.days.indexOf(b.check_out)) - i;
                    skip[c.key] = rows - 1;
                    return (
                      <td key={c.key} rowSpan={rows} className={`border-b ${edge} border-slate-100 p-0.5 align-top`} title={b.title}>
                        <div style={{ minHeight: rows * 36 - 4 }} className={`whitespace-pre-line rounded px-1.5 py-1 ${TONE[b.tone]}`}>{b.label}</div>
                      </td>
                    );
                  }
                  return <td key={c.key} className={`border-b ${edge} border-slate-100 ${wk ? "bg-slate-50" : ""} ${d === today ? "bg-teal-50" : ""}`} />;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
