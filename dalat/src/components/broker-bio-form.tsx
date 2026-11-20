"use client";

import { useSafeForm } from "@/lib/use-safe-form";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/form-fields";
import { saveBrokerBioAction } from "@/app/(app)/profile-actions";

/** Giới thiệu bản thân / kênh bán hàng — chủ nhà thấy khi duyệt yêu cầu cộng tác. */
export function BrokerBioForm({ bio }: { bio: string }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(saveBrokerBioAction);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-2">
      <Field label="Giới thiệu CTV (kênh bán hàng: Facebook, TikTok, Zalo…)" htmlFor="brokerBio">
        <Textarea id="brokerBio" name="brokerBio" defaultValue={bio} maxLength={500} placeholder="VD: Chạy ads villa Đà Lạt, tệp khách gia đình cuối tuần" />
      </Field>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state && !state.error && <p role="status" className="text-sm text-green-700">Đã lưu</p>}
      <Button type="submit" className="h-11" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu giới thiệu"}</Button>
    </form>
  );
}
