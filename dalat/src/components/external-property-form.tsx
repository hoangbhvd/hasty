"use client";

import { useEffect, useRef } from "react";
import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/form-fields";
import { AREA_LABEL, enumOptions } from "@/lib/labels";
import type { FormState } from "@/app/(auth)/actions";

export type ExternalDefaults = {
  name?: string; area?: string; googleMapsUrl?: string | null; externalHostName?: string | null; externalHostPhone?: string | null;
  address?: string | null; baseWeekdayNet?: number | null; baseWeekendNet?: number | null; caretakerPhone?: string | null; checkinGuide?: string | null;
};

/** Dùng cho cả thêm mới (action = createExternalPropertyAction) và sửa (action đã bind id). */
export function ExternalPropertyForm({
  action, defaults = {}, submitLabel = "Lưu homestay", onDone,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  defaults?: ExternalDefaults;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const { state, pending, disabled, ref: formRef, onSubmit } = useSafeForm(action);
  const ok = useRef(false);
  useEffect(() => {
    if (state && !state.error && !ok.current) { ok.current = true; onDone?.(); }
    if (state?.error) ok.current = false;
  }, [state, onDone]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <Field label="Tên homestay" htmlFor="ext-name"><Input id="ext-name" name="name" defaultValue={defaults.name} className="h-11 text-base" required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Khu vực"><Select name="area" defaultValue={defaults.area ?? "TRUNG_TAM"} options={enumOptions(AREA_LABEL)} /></Field>
        <Field label="Link Google Maps"><Input name="googleMapsUrl" type="url" defaultValue={defaults.googleMapsUrl ?? ""} className="h-11 text-base" /></Field>
        <Field label="Tên chủ nhà"><Input name="externalHostName" defaultValue={defaults.externalHostName ?? ""} className="h-11 text-base" /></Field>
        <Field label="SĐT chủ nhà"><Input name="externalHostPhone" type="tel" defaultValue={defaults.externalHostPhone ?? ""} className="h-11 text-base" /></Field>
        <Field label="Net CN–T5 (đ)"><Input name="baseWeekdayNet" type="number" min="0" step="1" inputMode="numeric" defaultValue={defaults.baseWeekdayNet ?? ""} className="h-11 text-base" /></Field>
        <Field label="Net T6–T7 (đ)"><Input name="baseWeekendNet" type="number" min="0" step="1" inputMode="numeric" defaultValue={defaults.baseWeekendNet ?? ""} className="h-11 text-base" /></Field>
        <Field label="Địa chỉ"><Input name="address" defaultValue={defaults.address ?? ""} maxLength={300} className="h-11 text-base" /></Field>
        <Field label="SĐT quản gia"><Input name="caretakerPhone" type="tel" defaultValue={defaults.caretakerPhone ?? ""} className="h-11 text-base" /></Field>
      </div>
      <Field label="Hướng dẫn check-in"><Textarea name="checkinGuide" defaultValue={defaults.checkinGuide ?? ""} className="min-h-20" /></Field>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm font-medium text-green-800">{state.message}</p>}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={disabled}>{pending ? "Đang lưu…" : submitLabel}</Button>
    </form>
  );
}
