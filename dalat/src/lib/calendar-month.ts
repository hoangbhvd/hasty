import { parseDateOnly } from "@/lib/format";

/** Tháng hiển thị trên lịch: `YYYY-MM` hợp lệ, không thì tháng hiện tại (today = yyyy-mm-dd). */
export function parseMonth(m: string | undefined, today: string): { month: string; from: Date; days: number } {
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
  const [y, mo] = month.split("-").map(Number);
  return { month, from: parseDateOnly(`${month}-01`)!, days: new Date(Date.UTC(y, mo, 0)).getUTCDate() };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
