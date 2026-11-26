"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import { Field } from "@/components/form-fields";
import { NightlyFieldset, nightsOf, useNightlyPrices } from "@/components/nightly-price-fields";
import { useSafeForm } from "@/lib/use-safe-form";
import { editBookingAction } from "@/app/(app)/bookings/actions";

type Init = { guestName: string; guestPhone: string; guestCount: number; childCount: number; guestNote: string; manualRoomInfo: string; external: boolean; checkInTime: string; checkOutTime: string;
  price: { checkIn: string; checkOut: string; total: number; hostNet: number; nightly: number[] | null; asBroker: boolean } };

function Form({ bookingId, init, onDone }: { bookingId: string; init: Init; onDone: () => void }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(editBookingAction.bind(null, bookingId));
  const pr = init.price;
  const n = nightsOf(pr.checkIn, pr.checkOut);
  const p = useNightlyPrices(pr.checkIn, pr.checkOut, Array.from({ length: n }, (_, i) =>
    pr.nightly?.length === n ? pr.nightly[i] : i === n - 1 ? pr.total - Math.floor(pr.total / n) * (n - 1) : Math.floor(pr.total / n)));
  useEffect(() => { if (state && !state.error) onDone(); }, [state, onDone]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <Field label="Tên khách" htmlFor="e-name"><Input id="e-name" name="guestName" defaultValue={init.guestName} className="h-11 text-base" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="SĐT khách" htmlFor="e-phone"><Input id="e-phone" name="guestPhone" type="tel" defaultValue={init.guestPhone} className="h-11 text-base" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Người lớn" htmlFor="e-cnt"><Input id="e-cnt" name="guestCount" type="number" min="1" defaultValue={init.guestCount} className="h-11 text-base" required /></Field>
          <Field label="Trẻ em" htmlFor="e-child"><Input id="e-child" name="childCount" type="number" min="0" defaultValue={init.childCount} className="h-11 text-base" /></Field>
        </div>
      </div>
      {init.external && <Field label="Phòng / hạng phòng" htmlFor="e-room"><Input id="e-room" name="manualRoomInfo" defaultValue={init.manualRoomInfo} className="h-11 text-base" /></Field>}
      <Field label="Ghi chú" htmlFor="e-note"><Input id="e-note" name="guestNote" defaultValue={init.guestNote} className="h-11 text-base" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Giờ nhận phòng" htmlFor="e-cin"><Input id="e-cin" name="checkInTime" type="time" defaultValue={init.checkInTime} className="h-11 text-base" required /></Field>
        <Field label="Giờ trả phòng" htmlFor="e-cout"><Input id="e-cout" name="checkOutTime" type="time" defaultValue={init.checkOutTime} className="h-11 text-base" required /></Field>
      </div>
      {p.csv && <input type="hidden" name="nightlyPrices" value={p.csv} />}
      <Field label={pr.asBroker ? "Giá bán cho khách (đ)" : "Tổng tiền khách (đ)"} htmlFor="e-total" hint={pr.asBroker ? `Không thấp hơn giá Net (${pr.hostNet.toLocaleString("vi-VN")}đ); chênh lệch là hoa hồng của bạn` : undefined}>
        <Input id="e-total" name="guestTotalPrice" type="number" min="0" step="1" inputMode="numeric" value={p.total} onChange={(e) => p.setTotal(e.target.value)} className="h-11 text-base" required />
      </Field>
      {pr.asBroker && init.external && <Field label="Giá chủ thu về - Net (đ)" htmlFor="e-net"><Input id="e-net" name="hostNetPrice" type="number" min="0" step="1" inputMode="numeric" defaultValue={pr.hostNet} className="h-11 text-base" required /></Field>}
      <NightlyFieldset checkIn={pr.checkIn} p={p} />
      <p className="text-xs text-muted-foreground">Ngày ở và phòng không đổi ở đây. Cần đổi thì huỷ rồi tạo booking mới.</p>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu thay đổi"}</Button>
    </form>
  );
}

export function BookingEditButton({ bookingId, init }: { bookingId: string; init: Init }) {
  return <Modal trigger="✏️ Sửa thông tin" title="Sửa thông tin booking">{(close) => <Form bookingId={bookingId} init={init} onDone={close} />}</Modal>;
}
