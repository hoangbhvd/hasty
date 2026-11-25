"use client";

import { useState } from "react";
import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Textarea } from "@/components/form-fields";
import { createBookingAction } from "@/app/(app)/bookings/actions";

export function BookingCreateForm({
  as, propertyId, bookingType, roomIds, checkIn, checkOut, defaultGuestTotal, defaultNightly, external, canHold, canInstant = true,
}: {
  as: "HOST" | "BROKER";
  propertyId: string;
  bookingType: "WHOLE_UNIT" | "ROOMS";
  roomIds: string[];
  checkIn: string;
  checkOut: string;
  defaultGuestTotal?: number;
  /** Giá gợi ý từng đêm (theo bảng giá Net), nếu có */
  defaultNightly?: number[];
  external: boolean;
  canHold: boolean;
  /** false: CTV thường — chỉ được "Giữ phòng 30 phút" */
  canInstant?: boolean;
}) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(createBookingAction);
  const nights = Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000) || 1);
  const [nightly, setNightly] = useState<string[]>(() =>
    Array.from({ length: nights }, (_, i) => {
      const v = defaultNightly?.length === nights ? defaultNightly[i] : defaultGuestTotal !== undefined ? Math.round(defaultGuestTotal / nights) : undefined;
      return v === undefined ? "" : String(v);
    }));
  // Tổng = cộng giá từng đêm; để trống hết thì không gửi (server dùng giá Net)
  const filled = nightly.some((v) => v !== "");
  const total = filled ? String(nightly.reduce((s, v) => s + (Number(v) || 0), 0)) : "";
  const setOne = (i: number, v: string) => setNightly((a) => a.map((x, j) => (j === i ? v : x)));
  const setAll = (v: string) => setNightly(Array.from({ length: nights }, () => v));
  const setTotal = (v: string) => {
    if (v === "") return setAll("");
    const t = Math.round(Number(v)), each = Math.floor(t / nights);
    setNightly(Array.from({ length: nights }, (_, i) => String(i === nights - 1 ? t - each * (nights - 1) : each)));
  };
  const dayLabel = (i: number) => {
    const d = new Date(Date.parse(checkIn) + i * 86_400_000);
    return `${["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="as" value={as} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="bookingType" value={bookingType} />
      <input type="hidden" name="checkIn" value={checkIn} />
      <input type="hidden" name="checkOut" value={checkOut} />
      {filled && nightly.every((v) => v !== "") && <input type="hidden" name="nightlyPrices" value={nightly.map((v) => Math.round(Number(v))).join(",")} />}
      {roomIds.map((r) => <input key={r} type="hidden" name="roomIds" value={r} />)}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên khách" htmlFor="guestName"><Input id="guestName" name="guestName" className="h-11 text-base" required /></Field>
        <Field label="SĐT khách" htmlFor="guestPhone"><Input id="guestPhone" name="guestPhone" type="tel" inputMode="tel" className="h-11 text-base" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Người lớn" htmlFor="guestCount"><Input id="guestCount" name="guestCount" type="number" min="1" defaultValue={2} inputMode="numeric" className="h-11 text-base" required /></Field>
          <Field label="Trẻ em" htmlFor="childCount"><Input id="childCount" name="childCount" type="number" min="0" defaultValue={0} inputMode="numeric" className="h-11 text-base" /></Field>
        </div>
        <Field label={as === "HOST" ? "Tổng tiền khách (đ)" : "Giá bán cho khách (đ)"} htmlFor="guestTotalPrice" hint={as === "BROKER" ? "Chênh lệch so với giá Net là hoa hồng của bạn" : undefined}>
          <Input id="guestTotalPrice" name="guestTotalPrice" type="number" min="0" step="1" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} className="h-11 text-base" required={external || defaultGuestTotal === undefined} />
        </Field>
        {external && (
          <>
            <Field label="Giá chủ thu về - Net (đ)" htmlFor="hostNetPrice"><Input id="hostNetPrice" name="hostNetPrice" type="number" min="0" step="1" inputMode="numeric" defaultValue={defaultGuestTotal} className="h-11 text-base" required /></Field>
            <Field label="Phòng / hạng phòng" htmlFor="manualRoomInfo"><Input id="manualRoomInfo" name="manualRoomInfo" className="h-11 text-base" /></Field>
          </>
        )}
      </div>
      <fieldset className="space-y-2 rounded border border-black p-3">
        <legend className="px-1 text-sm font-medium">Giá từng đêm (đ) — sửa được từng đêm</legend>
        {nights > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-muted-foreground">Áp cùng giá cho mọi đêm</span>
            <Input type="number" min="0" step="1" inputMode="numeric" aria-label="Giá chung cho mọi đêm" placeholder="vd 800000" className="h-10 text-base" onChange={(e) => setAll(e.target.value)} />
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {nightly.map((v, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 font-medium">{dayLabel(i)}</span>
              <Input type="number" min="0" step="1" inputMode="numeric" value={v} onChange={(e) => setOne(i, e.target.value)} aria-label={`Giá đêm ${dayLabel(i)}`} className="h-10 text-base" />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Tổng tiền = cộng các đêm. Sửa tổng thì chia đều cho các đêm.</p>
      </fieldset>
      <Field label="Ghi chú" htmlFor="guestNote"><Textarea id="guestNote" name="guestNote" className="min-h-20" /></Field>

      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        {canInstant && (
          <Button type="submit" name="mode" value="CONFIRM" size="lg" className="h-12 flex-1" disabled={disabled}>
            {pending ? "Đang xử lý…" : canHold ? "Đặt ngay" : "Tạo booking"}
          </Button>
        )}
        {canHold && (
          <Button type="submit" name="mode" value={"HOLD"} variant={canInstant ? "outline" : "default"} size="lg" className="h-12 flex-1" disabled={disabled}>
            Giữ phòng 30 phút
          </Button>
        )}
      </div>
    </form>
  );
}
