export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warn" }) {
  return (
    <div className={`card ${tone === "warn" ? "border-amber-300 bg-amber-50" : ""}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-900" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** "+12%" / "−5%" so với kỳ trước; null nếu không so được. */
export function delta(cur: number, prev: number): string | null {
  if (!prev) return cur ? "mới có" : null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return `${d >= 0 ? "+" : "−"}${Math.abs(d)}% so với tháng trước`;
}
export const pct = (x: number) => `${Math.round(x * 100)}%`;
