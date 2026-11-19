export type Tier = "STANDARD" | "VIP" | "AGENCY";
export type SpecialRow = { roomId: string | null; date: Date; netPrice: number; brokerTier: Tier | null };

const DAY = 86_400_000;

/** Danh sách các đêm [checkIn, checkOut) — mỗi phần tử là ngày bắt đầu đêm (UTC 00:00 của cột DATE). */
export function nightsBetween(checkIn: Date, checkOut: Date): Date[] {
  const n = Math.round((checkOut.getTime() - checkIn.getTime()) / DAY);
  return Array.from({ length: Math.max(n, 0) }, (_, i) => new Date(checkIn.getTime() + i * DAY));
}

/** Đêm T6 và T7 tính giá cuối tuần; CN–T5 tính giá ngày thường. */
export function isWeekendNight(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 5 || dow === 6;
}

type Base = { weekday: number | null; weekend: number | null };

/** Giá Net 1 đêm cho 1 đối tượng (căn hoặc phòng). roomId = null nghĩa là nguyên căn. */
export function nightPrice(
  base: Base,
  specials: SpecialRow[],
  roomId: string | null,
  night: Date,
  tier: Tier | null,
): number | null {
  const t = night.getTime();
  const same = specials.filter((s) => s.roomId === roomId && s.date.getTime() === t);
  const hit = (tier && same.find((s) => s.brokerTier === tier)) || same.find((s) => s.brokerTier === null);
  if (hit) return hit.netPrice;
  return isWeekendNight(night) ? base.weekend : base.weekday;
}

export type Quote = {
  total: number;
  nights: number;
  perNight: { date: Date; amount: number }[];
  /** Tên đối tượng còn thiếu giá (chưa cấu hình) */
  missing: string[];
};

export function quote(args: {
  checkIn: Date;
  checkOut: Date;
  tier: Tier | null;
  specials: SpecialRow[];
  /** whole = null → tính giá nguyên căn; hoặc danh sách phòng */
  whole: { name: string; base: Base } | null;
  rooms: { id: string; name: string; base: Base }[];
}): Quote {
  const nights = nightsBetween(args.checkIn, args.checkOut);
  const targets = args.whole
    ? [{ id: null as string | null, name: args.whole.name, base: args.whole.base }]
    : args.rooms.map((r) => ({ id: r.id as string | null, name: r.name, base: r.base }));
  const missing = new Set<string>();
  const perNight = nights.map((date) => {
    let amount = 0;
    for (const t of targets) {
      const p = nightPrice(t.base, args.specials, t.id, date, args.tier);
      if (p === null) missing.add(t.name);
      else amount += p;
    }
    return { date, amount };
  });
  return { total: perNight.reduce((s, n) => s + n.amount, 0), nights: nights.length, perNight, missing: [...missing] };
}
