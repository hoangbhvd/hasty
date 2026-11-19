"use client";

import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/form-fields";
import { addRoomAction, deleteRoomAction, updateRoomAction } from "@/app/(app)/host/properties/actions";

type Room = { id: string; name: string; maxGuests: number; baseWeekdayNet: number | null; baseWeekendNet: number | null };

function RoomFields({ r }: { r?: Room }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Field label="Tên phòng"><Input name="name" defaultValue={r?.name} className="h-11 text-base" required /></Field>
      <Field label="Số khách tối đa"><Input name="maxGuests" type="number" min="1" inputMode="numeric" defaultValue={r?.maxGuests ?? 2} className="h-11 text-base" required /></Field>
      <Field label="Net CN–T5 (đ)"><Input name="baseWeekdayNet" type="number" min="0" step="1000" inputMode="numeric" defaultValue={r?.baseWeekdayNet ?? ""} className="h-11 text-base" /></Field>
      <Field label="Net T6–T7 (đ)"><Input name="baseWeekendNet" type="number" min="0" step="1000" inputMode="numeric" defaultValue={r?.baseWeekendNet ?? ""} className="h-11 text-base" /></Field>
    </div>
  );
}

function RoomRow({ room }: { room: Room }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(updateRoomAction.bind(null, room.id));
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3 rounded-lg border p-3">
      <RoomFields r={room} />
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" className="h-9" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu phòng"}</Button>
        <ActionButton action={() => deleteRoomAction(room.id)} confirm={`Xoá phòng "${room.name}"?`} className="text-destructive">Xoá</ActionButton>
      </div>
    </form>
  );
}

export function RoomsManager({ propertyId, rooms }: { propertyId: string; rooms: Room[] }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(addRoomAction.bind(null, propertyId), { resetOnSuccess: true });
  return (
    <div className="space-y-4">
      {rooms.length === 0 && <p className="text-sm text-muted-foreground">Chưa có phòng lẻ nào.</p>}
      {rooms.map((r) => <RoomRow key={r.id} room={r} />)}
      <form ref={ref} onSubmit={onSubmit} className="space-y-3 rounded-lg border border-dashed p-3">
        <h3 className="text-sm font-medium">Thêm phòng</h3>
        <RoomFields />
        {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" className="h-10" disabled={disabled}>{pending ? "Đang thêm…" : "+ Thêm phòng"}</Button>
      </form>
    </div>
  );
}
