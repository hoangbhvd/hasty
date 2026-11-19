"use client";

import { useEffect, useRef } from "react";
import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/form-fields";
import { AREA_LABEL, enumOptions } from "@/lib/labels";
import { createExternalPropertyAction } from "@/app/(app)/broker/properties/actions";

export function ExternalPropertyForm({ onDone }: { onDone: () => void }) {
  const { state, pending, disabled, ref: formRef, onSubmit } = useSafeForm(createExternalPropertyAction);
  const ok = useRef(false);
  useEffect(() => {
    if (state && !state.error && !ok.current) { ok.current = true; onDone(); }
    if (state?.error) ok.current = false;
  }, [state, onDone]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <Field label="Tên homestay" htmlFor="ext-name"><Input id="ext-name" name="name" className="h-11 text-base" required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Khu vực"><Select name="area" defaultValue="TRUNG_TAM" options={enumOptions(AREA_LABEL)} /></Field>
        <Field label="Link Google Maps"><Input name="googleMapsUrl" type="url" className="h-11 text-base" /></Field>
        <Field label="Tên chủ nhà"><Input name="externalHostName" className="h-11 text-base" /></Field>
        <Field label="SĐT chủ nhà"><Input name="externalHostPhone" type="tel" className="h-11 text-base" /></Field>
        <Field label="Net CN–T5 (đ)"><Input name="baseWeekdayNet" type="number" min="0" step="1000" inputMode="numeric" className="h-11 text-base" /></Field>
        <Field label="Net T6–T7 (đ)"><Input name="baseWeekendNet" type="number" min="0" step="1000" inputMode="numeric" className="h-11 text-base" /></Field>
        <Field label="SĐT quản gia"><Input name="caretakerPhone" type="tel" className="h-11 text-base" /></Field>
      </div>
      <Field label="Hướng dẫn check-in"><Textarea name="checkinGuide" className="min-h-20" /></Field>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu homestay"}</Button>
    </form>
  );
}
