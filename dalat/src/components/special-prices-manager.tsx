"use client";

import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/action-button";
import { Field, Select } from "@/components/form-fields";
import { TIER_LABEL, enumOptions } from "@/lib/labels";
import { addSpecialPriceAction, deleteSpecialPriceAction } from "@/app/(app)/host/properties/actions";

type Row = { id: string; date: string; roomName: string | null; tier: string | null; netPrice: string };

export function SpecialPricesManager({
  propertyId, rooms, rows,
}: {
  propertyId: string;
  rooms: { id: string; name: string }[];
  rows: Row[];
}) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(addSpecialPriceAction.bind(null, propertyId), { resetOnSuccess: true });
  return (
    <div className="space-y-4">
      <form ref={ref} onSubmit={onSubmit} className="space-y-3 rounded border border-dashed border-black bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Từ ngày"><Input name="from" type="date" className="h-11 text-base" required /></Field>
          <Field label="Đến ngày" hint="Bỏ trống nếu chỉ 1 ngày"><Input name="to" type="date" className="h-11 text-base" /></Field>
          <Field label="Giá Net (đ)"><Input name="netPrice" type="number" min="0" step="1000" inputMode="numeric" className="h-11 text-base" required /></Field>
          <Field label="Áp dụng cho">
            <Select name="roomId" defaultValue="" options={[{ value: "", label: "Nguyên căn" }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]} />
          </Field>
          <Field label="Hạng đối tác">
            <Select name="brokerTier" defaultValue="" options={[{ value: "", label: "Tất cả" }, ...enumOptions(TIER_LABEL)]} />
          </Field>
        </div>
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <Button type="submit" className="h-10" disabled={disabled}>{pending ? "Đang lưu…" : "+ Thêm giá ngày lễ / giá riêng"}</Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có giá riêng từ hôm nay trở đi.</p>
      ) : (
        <ul className="divide-y divide-black rounded border border-black bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <div>
                <div className="font-medium">{r.date} · {r.netPrice}</div>
                <div className="text-muted-foreground">{r.roomName ?? "Nguyên căn"}{r.tier ? ` · ${r.tier}` : ""}</div>
              </div>
              <ActionButton action={() => deleteSpecialPriceAction(r.id)} ariaLabel={`Xoá giá ngày ${r.date}`} className="bg-destructive">Xoá</ActionButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
