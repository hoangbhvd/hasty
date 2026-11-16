import { addDays } from "./format";

export type Month = { key: string; label: string; days: string[]; start: string; endExclusive: string; prev: string; next: string };

/** m dạng "YYYY-MM"; sai định dạng thì lấy tháng hiện tại. */
export function parseMonth(m: string | undefined): Month {
  const now = new Date();
  let y = now.getUTCFullYear(), mo = now.getUTCMonth() + 1;
  const hit = m && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(m);
  if (hit) { y = Number(hit[1]); mo = Number(hit[2]); }
  const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const pad = (x: number) => String(x).padStart(2, "0");
  const start = `${y}-${pad(mo)}-01`;
  const days = Array.from({ length: n }, (_, i) => `${y}-${pad(mo)}-${pad(i + 1)}`);
  const shift = (d: number) => { const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; };
  return { key: `${y}-${pad(mo)}`, label: `Tháng ${mo}/${y}`, days, start, endExclusive: addDays(days[n - 1], 1), prev: shift(-1), next: shift(1) };
}

export const todayStr = () => new Date().toISOString().slice(0, 10);
