"use client";

import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Field, Select, Textarea } from "@/components/form-fields";
import { AREA_LABEL, ROAD_LABEL, SLOPE_LABEL, VIEW_OPTIONS, enumOptions } from "@/lib/labels";
import type { FormState } from "@/app/(auth)/actions";

export type PropertyDefaults = {
  name?: string; description?: string | null; area?: string; distanceToMarketKm?: number | null;
  roadAccess?: string; slopeLevel?: string; address?: string | null; googleMapsUrl?: string | null; checkinGuide?: string | null;
  caretakerPhone?: string | null; houseRules?: string | null; allowWholeUnit?: boolean; allowIndividualRooms?: boolean;
  baseWeekdayNet?: number | null; baseWeekendNet?: number | null;
  amenities?: { bbQ?: boolean; ac?: boolean; pet_friendly?: boolean; karaoke?: boolean; views?: string[] };
};

export function PropertyForm({
  action, defaults = {}, submitLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  defaults?: PropertyDefaults;
  submitLabel: string;
}) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(action);
  const a = defaults.amenities ?? {};
  const saved = state && !state.error && state !== undefined;

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-4">
        <h2 className="font-semibold">Thông tin chung</h2>
        <Field label="Tên căn" htmlFor="name">
          <Input id="name" name="name" defaultValue={defaults.name} className="h-11 text-base" required />
        </Field>
        <Field label="Mô tả" htmlFor="description">
          <Textarea id="description" name="description" defaultValue={defaults.description ?? ""} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Check name="allowWholeUnit" label="Bán nguyên căn" defaultChecked={defaults.allowWholeUnit ?? true} />
          <Check name="allowIndividualRooms" label="Bán phòng lẻ" defaultChecked={defaults.allowIndividualRooms ?? false} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Đặc thù Đà Lạt</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Khu vực" htmlFor="area">
            <Select id="area" name="area" defaultValue={defaults.area ?? "TRUNG_TAM"} options={enumOptions(AREA_LABEL)} />
          </Field>
          <Field label="Cách Chợ Đà Lạt (km)" htmlFor="distanceToMarketKm">
            <Input id="distanceToMarketKm" name="distanceToMarketKm" type="number" step="0.1" min="0" inputMode="decimal" defaultValue={defaults.distanceToMarketKm ?? ""} className="h-11 text-base" />
          </Field>
          <Field label="Xe vào được" htmlFor="roadAccess">
            <Select id="roadAccess" name="roadAccess" defaultValue={defaults.roadAccess ?? "MOTORBIKE"} options={enumOptions(ROAD_LABEL)} />
          </Field>
          <Field label="Độ dốc" htmlFor="slopeLevel">
            <Select id="slopeLevel" name="slopeLevel" defaultValue={defaults.slopeLevel ?? "FLAT"} options={enumOptions(SLOPE_LABEL)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
          <Check name="bbQ" label="BBQ" defaultChecked={a.bbQ} />
          <Check name="ac" label="Máy lạnh" defaultChecked={a.ac} />
          <Check name="pet_friendly" label="Thú cưng" defaultChecked={a.pet_friendly} />
          <Check name="karaoke" label="Karaoke" defaultChecked={a.karaoke} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">View</legend>
          <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
            {VIEW_OPTIONS.map((v) => (
              <label key={v} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="views" value={v} defaultChecked={a.views?.includes(v)} className="size-5 accent-foreground" />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Giá Net nguyên căn</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Đêm CN – T5 (đ)" htmlFor="baseWeekdayNet">
            <Input id="baseWeekdayNet" name="baseWeekdayNet" type="number" min="0" step="1000" inputMode="numeric" defaultValue={defaults.baseWeekdayNet ?? ""} className="h-11 text-base" />
          </Field>
          <Field label="Đêm T6 – T7 (đ)" htmlFor="baseWeekendNet">
            <Input id="baseWeekendNet" name="baseWeekendNet" type="number" min="0" step="1000" inputMode="numeric" defaultValue={defaults.baseWeekendNet ?? ""} className="h-11 text-base" />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Vận hành</h2>
        <Field label="Địa chỉ (hiện trên phiếu xác nhận)" htmlFor="address">
          <Input id="address" name="address" defaultValue={defaults.address ?? ""} maxLength={300} className="h-11 text-base" />
        </Field>
        <Field label="Link Google Maps" htmlFor="googleMapsUrl">
          <Input id="googleMapsUrl" name="googleMapsUrl" type="url" defaultValue={defaults.googleMapsUrl ?? ""} className="h-11 text-base" />
        </Field>
        <Field label="SĐT quản gia / người trông nhà" htmlFor="caretakerPhone">
          <Input id="caretakerPhone" name="caretakerPhone" type="tel" defaultValue={defaults.caretakerPhone ?? ""} className="h-11 text-base" />
        </Field>
        <Field label="Hướng dẫn check-in" htmlFor="checkinGuide">
          <Textarea id="checkinGuide" name="checkinGuide" defaultValue={defaults.checkinGuide ?? ""} />
        </Field>
        <Field label="Nội quy" htmlFor="houseRules">
          <Textarea id="houseRules" name="houseRules" defaultValue={defaults.houseRules ?? ""} />
        </Field>
      </section>

      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Đã lưu</p>}
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={disabled}>
        {pending ? "Đang lưu…" : submitLabel}
      </Button>
    </form>
  );
}
