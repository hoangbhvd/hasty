import Link from "next/link";
import { formatVnd } from "@/lib/format";

export function Kpi({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "primary" | "warn" }) {
  return (
    <div className={`rounded border border-black p-3 shadow-brutal-sm ${tone === "primary" ? "bg-primary" : tone === "warn" ? "bg-status-holding" : "bg-white"}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="money-num text-xl font-extrabold">{formatVnd(value)}</div>
      {hint && <div className="text-[11px] text-black/70">{hint}</div>}
    </div>
  );
}

export function MonthNav({ base, month, prev, next }: { base: string; month: string; prev: string; next: string }) {
  const [y, m] = month.split("-");
  const btn = "brutal-btn inline-flex h-10 items-center bg-white px-3 text-sm text-black";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`${base}?month=${prev}`} className={btn} aria-label="Tháng trước">←</Link>
      <span className="money-num min-w-28 text-center font-bold">Tháng {m}/{y}</span>
      <Link href={`${base}?month=${next}`} className={btn} aria-label="Tháng sau">→</Link>
    </div>
  );
}
