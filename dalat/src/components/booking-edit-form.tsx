"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import { Field } from "@/components/form-fields";
import { useSafeForm } from "@/lib/use-safe-form";
import { editBookingAction } from "@/app/(app)/bookings/actions";

type Init = { guestName: string; guestPhone: string; guestCount: number; guestNote: string; manualRoomInfo: string; external: boolean };

function Form({ bookingId, init, onDone }: { bookingId: string; init: Init; onDone: () => void }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(editBookingAction.bind(null, bookingId));
  useEffect(() => { if (state && !state.error) onDone(); }, [state, onDone]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <Field label="Tên khách" htmlFor="e-name"><Input id="e-name" name="guestName" defaultValue={init.guestName} className="h-11 text-base" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="SĐT khách" htmlFor="e-phone"><Input id="e-phone" name="guestPhone" type="tel" defaultValue={init.guestPhone} className="h-11 text-base" /></Field>
        <Field label="Số khách" htmlFor="e-cnt"><Input id="e-cnt" name="guestCount" type="number" min="1" defaultValue={init.guestCount} className="h-11 text-base" required /></Field>
      </div>
      {init.external && <Field label="Phòng / hạng phòng" htmlFor="e-room"><Input id="e-room" name="manualRoomInfo" defaultValue={init.manualRoomInfo} className="h-11 text-base" /></Field>}
      <Field label="Ghi chú" htmlFor="e-note"><Input id="e-note" name="guestNote" defaultValue={init.guestNote} className="h-11 text-base" /></Field>
      <p className="text-xs text-muted-foreground">Ngày ở, phòng và giá không đổi ở đây. Cần đổi thì huỷ rồi tạo booking mới.</p>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu thay đổi"}</Button>
    </form>
  );
}

export function BookingEditButton({ bookingId, init }: { bookingId: string; init: Init }) {
  return <Modal trigger="✏️ Sửa thông tin" title="Sửa thông tin booking">{(close) => <Form bookingId={bookingId} init={init} onDone={close} />}</Modal>;
}
