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

export const validDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s).getTime());

export const STATUS_LABEL: Record<string, string> = {
  quoted: "Báo giá", holding: "Đang giữ chỗ", deposit_reported: "Đã báo cọc",
  confirmed: "Đã chốt", cancelled: "Đã huỷ", expired: "Hết hạn giữ",
};

/** Thứ trong tuần của "YYYY-MM-DD" (0 = CN). */
export const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
