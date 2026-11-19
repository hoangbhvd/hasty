const vnd = new Intl.NumberFormat("vi-VN");

export function formatVnd(n: unknown): string {
  if (n === null || n === undefined || n === "") return "—";
  return vnd.format(Number(n)) + "đ";
}

/** Cột @db.Date được Prisma đọc/ghi theo UTC 00:00 → dùng chuỗi yyyy-mm-dd, không đi qua múi giờ. */
export function parseDateOnly(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

export const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

export function formatDateVi(d: Date): string {
  const [y, m, day] = toDateOnly(d).split("-");
  return `${day}/${m}/${y}`;
}

/** Hôm nay theo giờ Việt Nam, dạng yyyy-mm-dd. */
export function todayVn(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export function formatDateTimeVi(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  }).format(d);
}

export function addDays(dateOnly: string, n: number): string {
  const d = parseDateOnly(dateOnly)!;
  return toDateOnly(new Date(d.getTime() + n * 86_400_000));
}
