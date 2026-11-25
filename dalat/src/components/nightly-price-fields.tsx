"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function nightsOf(checkIn: string, checkOut: string) {
  return Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000) || 1);
}

/** State giá từng đêm: tổng = cộng các đêm; sửa tổng thì chia đều (đêm cuối nhận phần dư). */
export function useNightlyPrices(checkIn: string, checkOut: string, initial: (number | undefined)[]) {
  const nights = nightsOf(checkIn, checkOut);
  const [nightly, setNightly] = useState<string[]>(() =>
    Array.from({ length: nights }, (_, i) => (initial[i] === undefined ? "" : String(initial[i]))));
  const filled = nightly.some((v) => v !== "");
  const total = filled ? String(nightly.reduce((s, v) => s + (Number(v) || 0), 0)) : "";
  const complete = filled && nightly.every((v) => v !== "");
  const setOne = (i: number, v: string) => setNightly((a) => a.map((x, j) => (j === i ? v : x)));
  const setAll = (v: string) => setNightly(Array.from({ length: nights }, () => v));
  const setTotal = (v: string) => {
    if (v === "") return setAll("");
    const t = Math.round(Number(v)), each = Math.floor(t / nights);
    setNightly(Array.from({ length: nights }, (_, i) => String(i === nights - 1 ? t - each * (nights - 1) : each)));
  };
  const csv = complete ? nightly.map((v) => Math.round(Number(v))).join(",") : "";
  return { nights, nightly, total, filled, csv, setOne, setAll, setTotal };
}

export function NightlyFieldset({ checkIn, p }: { checkIn: string; p: ReturnType<typeof useNightlyPrices> }) {
  const label = (i: number) => {
    const d = new Date(Date.parse(checkIn) + i * 86_400_000);
    return `${DOW[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return (
    <fieldset className="space-y-2 rounded border border-black p-3">
      <legend className="px-1 text-sm font-medium">Giá từng đêm (đ) — sửa được từng đêm</legend>
      {p.nights > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="shrink-0 text-muted-foreground">Áp cùng giá cho mọi đêm</span>
          <Input type="number" min="0" step="1" inputMode="numeric" aria-label="Giá chung cho mọi đêm" placeholder="vd 800000" className="h-10 text-base" onChange={(e) => p.setAll(e.target.value)} />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {p.nightly.map((v, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <span className="w-16 shrink-0 font-medium">{label(i)}</span>
            <Input type="number" min="0" step="1" inputMode="numeric" value={v} onChange={(e) => p.setOne(i, e.target.value)} aria-label={`Giá đêm ${label(i)}`} className="h-10 text-base" />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Tổng tiền = cộng các đêm. Sửa tổng thì chia đều cho các đêm.</p>
    </fieldset>
  );
}
