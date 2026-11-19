"use client";

import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Textarea } from "@/components/form-fields";
import { createBookingAction } from "@/app/(app)/bookings/actions";

export function BookingCreateForm({
  as, propertyId, bookingType, roomIds, checkIn, checkOut, defaultGuestTotal, external, canHold,
}: {
  as: "HOST" | "BROKER";
  propertyId: string;
  bookingType: "WHOLE_UNIT" | "ROOMS";
  roomIds: string[];
  checkIn: string;
  checkOut: string;
  defaultGuestTotal?: number;
  external: boolean;
  canHold: boolean;
}) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(createBookingAction);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="as" value={as} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="bookingType" value={bookingType} />
      <input type="hidden" name="checkIn" value={checkIn} />
      <input type="hidden" name="checkOut" value={checkOut} />
      {roomIds.map((r) => <input key={r} type="hidden" name="roomIds" value={r} />)}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên khách" htmlFor="guestName"><Input id="guestName" name="guestName" className="h-11 text-base" required /></Field>
        <Field label="SĐT khách" htmlFor="guestPhone"><Input id="guestPhone" name="guestPhone" type="tel" inputMode="tel" className="h-11 text-base" /></Field>
        <Field label="Số khách" htmlFor="guestCount"><Input id="guestCount" name="guestCount" type="number" min="1" defaultValue={2} inputMode="numeric" className="h-11 text-base" required /></Field>
        <Field label={as === "HOST" ? "Tổng tiền khách (đ)" : "Giá bán cho khách (đ)"} htmlFor="guestTotalPrice" hint={as === "BROKER" ? "Chênh lệch so với giá Net là hoa hồng của bạn" : undefined}>
          <Input id="guestTotalPrice" name="guestTotalPrice" type="number" min="0" step="1000" inputMode="numeric" defaultValue={defaultGuestTotal} className="h-11 text-base" required={external || defaultGuestTotal === undefined} />
        </Field>
        {external && (
          <>
            <Field label="Giá chủ thu về - Net (đ)" htmlFor="hostNetPrice"><Input id="hostNetPrice" name="hostNetPrice" type="number" min="0" step="1000" inputMode="numeric" className="h-11 text-base" required /></Field>
            <Field label="Phòng / hạng phòng" htmlFor="manualRoomInfo"><Input id="manualRoomInfo" name="manualRoomInfo" className="h-11 text-base" /></Field>
          </>
        )}
      </div>
      <Field label="Ghi chú" htmlFor="guestNote"><Textarea id="guestNote" name="guestNote" className="min-h-20" /></Field>

      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" name="mode" value="CONFIRM" size="lg" className="h-12 flex-1" disabled={disabled}>
          {pending ? "Đang xử lý…" : "Tạo booking"}
        </Button>
        {canHold && (
          <Button type="submit" name="mode" value="HOLD" variant="outline" size="lg" className="h-12 flex-1" disabled={disabled}>
            Giữ phòng 30 phút
          </Button>
        )}
      </div>
    </form>
  );
}
