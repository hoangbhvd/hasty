export const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "đ";

const parse = (d: string) => new Date(d + "T00:00:00Z");
export const addDays = (d: string, n: number) => {
  const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
};
export const nightsBetween = (a: string, b: string) =>
  Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

/** Đêm thứ 6 và thứ 7 tính giá cuối tuần. */
export function priceStay(checkIn: string, checkOut: string, weekday: number, weekend: number) {
  let total = 0;
  const n = nightsBetween(checkIn, checkOut);
  for (let i = 0; i < n; i++) {
    const dow = parse(addDays(checkIn, i)).getUTCDay();
    total += dow === 5 || dow === 6 ? weekend : weekday;
  }
  return total;
}

export type Season = { start_date: string; end_date: string; weekday_price: number; weekend_price: number };
type Base = { weekday_price: number; weekend_price: number };

/** Giá net của một đêm: mùa nào chứa đêm đó thì dùng (mùa đứng sau trong mảng thắng), không thì giá mặc định. */
export function nightPrice(date: string, base: Base, seasons: Season[] = []): number {
  let price = { weekday: base.weekday_price, weekend: base.weekend_price };
  for (const s of seasons) if (s.start_date <= date && date <= s.end_date) price = { weekday: s.weekday_price, weekend: s.weekend_price };
  const w = parse(date).getUTCDay();
  return w === 5 || w === 6 ? price.weekend : price.weekday;
}

/** Tổng giá net cả kỳ có tính giá theo mùa. `seasons` sắp theo thời điểm tạo tăng dần. */
export function priceStayWithSeasons(checkIn: string, checkOut: string, base: Base, seasons: Season[] = []) {
  let total = 0;
  const n = nightsBetween(checkIn, checkOut);
  for (let i = 0; i < n; i++) total += nightPrice(addDays(checkIn, i), base, seasons);
  return total;
}

export const validDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s).getTime());

export const STATUS_LABEL: Record<string, string> = {
  quoted: "Báo giá", holding: "Đang giữ chỗ", deposit_reported: "Đã báo cọc",
  confirmed: "Đã chốt", cancelled: "Đã huỷ", expired: "Hết hạn giữ",
};

/** Thứ trong tuần của "YYYY-MM-DD" (0 = CN). */
export const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();

/** "2026-12-04" -> "04/12/2026" */
export const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** 1000000 -> "1.000.000" (không kèm đơn vị) */
export const money = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));
