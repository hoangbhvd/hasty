"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/action-button";
import { Field, Select } from "@/components/form-fields";
import { AREA_LABEL, ROAD_LABEL, enumOptions } from "@/lib/labels";
import { useSafeForm } from "@/lib/use-safe-form";
import { chooseOfferAction, closeRequestAction, createOfferAction, createRequestAction } from "@/app/(app)/requests-actions";

export function NewRequestForm({ minDate }: { minDate: string }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(createRequestAction, { resetOnSuccess: true });
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
      <h2 className="font-bold">🔥 Tìm phòng gấp</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Check-in" htmlFor="r-in"><Input id="r-in" name="checkIn" type="date" min={minDate} className="h-11 text-base" required /></Field>
        <Field label="Check-out" htmlFor="r-out"><Input id="r-out" name="checkOut" type="date" min={minDate} className="h-11 text-base" required /></Field>
        <Field label="Số khách" htmlFor="r-g"><Input id="r-g" name="guestCount" type="number" min="1" defaultValue={2} className="h-11 text-base" required /></Field>
        <Field label="Khu vực" htmlFor="r-a"><Select id="r-a" name="area" options={[{ value: "", label: "Bất kỳ" }, ...enumOptions(AREA_LABEL)]} /></Field>
        <Field label="Xe cần vào được" htmlFor="r-r"><Select id="r-r" name="roadAccess" options={[{ value: "", label: "Bất kỳ" }, ...enumOptions(ROAD_LABEL)]} /></Field>
        <Field label="Net tối đa / đêm (đ)" htmlFor="r-b"><Input id="r-b" name="maxBudget" type="number" min="0" inputMode="numeric" className="h-11 text-base" /></Field>
        <Field label="Giữ yêu cầu trong" htmlFor="r-h"><Select id="r-h" name="hoursValid" defaultValue="24" options={[{ value: "2", label: "2 giờ" }, { value: "6", label: "6 giờ" }, { value: "12", label: "12 giờ" }, { value: "24", label: "24 giờ" }, { value: "48", label: "48 giờ" }]} /></Field>
        <div className="sm:col-span-2"><Field label="Ghi chú" htmlFor="r-n"><Input id="r-n" name="note" maxLength={500} className="h-11 text-base" /></Field></div>
      </div>
      <p className="text-xs text-muted-foreground">Chỉ chủ nhà đã duyệt bạn và có căn trống phù hợp mới nhận được thông báo.</p>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      {state && !state.error && <p role="status" className="text-sm font-medium text-green-800">Đã gửi yêu cầu</p>}
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={disabled}>{pending ? "Đang gửi…" : "Gửi yêu cầu"}</Button>
    </form>
  );
}

export function CloseRequestButton({ id }: { id: string }) {
  return <ActionButton action={() => closeRequestAction(id)} confirm="Đóng yêu cầu này?" className="bg-white">Đóng yêu cầu</ActionButton>;
}

export function ChooseOfferButton({ id }: { id: string }) {
  return <ActionButton action={() => chooseOfferAction(id)} confirm="Chốt đề xuất này và sang bước đặt phòng? Yêu cầu sẽ được đóng." className="bg-primary">Chốt &amp; đặt phòng</ActionButton>;
}

export function OfferForm({ requestId, propertyId, defaultPrice, existing }: { requestId: string; propertyId: string; defaultPrice: number | null; existing: { price: number; note: string | null } | null }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(createOfferAction.bind(null, requestId, propertyId));
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-2 border-t border-black/20 pt-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <Field label="Giá Net cả kỳ (đ)" htmlFor={`o-${propertyId}`}><Input id={`o-${propertyId}`} name="price" type="number" min="0" inputMode="numeric" defaultValue={existing?.price ?? defaultPrice ?? ""} className="h-11 text-base" required /></Field>
        <Field label="Ghi chú" htmlFor={`n-${propertyId}`}><Input id={`n-${propertyId}`} name="note" defaultValue={existing?.note ?? ""} maxLength={500} className="h-11 text-base" /></Field>
        <Button type="submit" className="h-11" disabled={disabled}>{pending ? "Đang gửi…" : existing ? "Cập nhật" : "Gửi đề xuất"}</Button>
      </div>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      {state && !state.error && <p role="status" className="text-sm font-medium text-green-800">Đã gửi đề xuất</p>}
    </form>
  );
}
