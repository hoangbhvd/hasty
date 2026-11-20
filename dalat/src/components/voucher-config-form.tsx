"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Field, Select, Textarea } from "@/components/form-fields";
import { useSafeForm } from "@/lib/use-safe-form";
import { saveVoucherConfigAction } from "@/app/(app)/voucher-actions";
import { SAMPLE_TEXTS, TEMPLATE_IDS, TEMPLATE_LABEL, type VoucherConfig } from "@/lib/voucher-config";

const BLOCKS: [keyof VoucherConfig["blocks"], string][] = [
  ["show_cover_image", "Ảnh bìa"], ["show_price_table", "Bảng giá"], ["show_vietqr", "Mã VietQR thanh toán"],
  ["show_google_maps", "Nút Google Maps"], ["show_caretaker_phone", "SĐT quản gia"], ["show_surcharge_policy", "Chính sách phụ thu"],
  ["show_terms_conditions", "Điều khoản & điều kiện"], ["show_cancellation_policy", "Điều khoản huỷ"],
];

export function VoucherConfigForm({
  propertyId, config, images, previewToken,
}: {
  propertyId: string;
  config: VoucherConfig;
  images: { url: string }[];
  previewToken: string | null;
}) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(saveVoucherConfigAction.bind(null, propertyId));
  const formRef = useRef<HTMLFormElement | null>(null);
  const setRef = (el: HTMLFormElement | null) => { formRef.current = el; ref.current = el; };

  function fillSamples() {
    const f = formRef.current;
    if (!f) return;
    for (const [k, v] of Object.entries(SAMPLE_TEXTS)) (f.elements.namedItem(k) as HTMLTextAreaElement).value = v;
  }

  const b = config.branding;
  return (
    <form ref={setRef} onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mẫu giao diện" htmlFor="template_id">
          <Select id="template_id" name="template_id" defaultValue={config.template_id}
            options={TEMPLATE_IDS.map((id) => ({ value: id, label: TEMPLATE_LABEL[id] }))} />
        </Field>
        <Field label="Tên thương hiệu" htmlFor="brand_name"><Input id="brand_name" name="brand_name" defaultValue={b.brand_name} maxLength={60} className="h-11 text-base" /></Field>
        <Field label="Tiêu đề phiếu" htmlFor="header_title"><Input id="header_title" name="header_title" defaultValue={config.custom_texts.header_title} maxLength={80} className="h-11 text-base" /></Field>
        <Field label="Khung ảnh" htmlFor="image_frame_style">
          <Select id="image_frame_style" name="image_frame_style" defaultValue={b.image_frame_style} options={[{ value: "ARCH", label: "Vòm cong" }, { value: "RECTANGLE", label: "Chữ nhật" }, { value: "ROUNDED", label: "Bo góc" }]} />
        </Field>
        <Field label="Màu chủ đạo" htmlFor="primary_color"><input id="primary_color" name="primary_color" type="color" defaultValue={b.primary_color} className="brutal-input h-11 w-full p-1" /></Field>
        <Field label="Màu nền phiếu" htmlFor="background_color"><input id="background_color" name="background_color" type="color" defaultValue={b.background_color} className="brutal-input h-11 w-full p-1" /></Field>
        <Field label="Kiểu chữ" htmlFor="font_style" hint="Mẫu Receipt Compact luôn dùng chữ biên lai (mono)">
          <Select id="font_style" name="font_style" defaultValue={b.font_style} options={[{ value: "MODERN", label: "Hiện đại (Sans)" }, { value: "CLASSIC", label: "Cổ điển (Serif)" }, { value: "MONO", label: "Biên lai (Mono)" }]} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Ảnh bìa (chọn từ ảnh của căn)</legend>
        {images.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có ảnh. Tải ảnh lên ở mục “Ảnh & video” để chọn làm ảnh bìa.</p> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <label className="flex aspect-square cursor-pointer items-center justify-center rounded border border-black bg-white text-xs has-[:checked]:bg-primary">
              <input type="radio" name="cover_image_url" value="" defaultChecked={!b.cover_image_url} className="sr-only" /> Không dùng
            </label>
            {images.map((im) => (
              <label key={im.url} className="relative block aspect-square cursor-pointer overflow-hidden rounded border border-black has-[:checked]:outline-4 has-[:checked]:outline-offset-1 has-[:checked]:outline-black">
                <input type="radio" name="cover_image_url" value={im.url} defaultChecked={b.cover_image_url === im.url} className="sr-only" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="Ảnh bìa" loading="lazy" className="size-full object-cover" />
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Các khối hiển thị</legend>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          {BLOCKS.map(([k, label]) => <Check key={k} name={k} label={label} defaultChecked={config.blocks[k]} />)}
        </div>
      </fieldset>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Nội dung chính sách</h3>
          <Button type="button" variant="outline" className="h-9" onClick={fillSamples}>Chèn mẫu gợi ý</Button>
        </div>
        <Field label="Chính sách phụ thu phát sinh" htmlFor="surcharge_policy"><Textarea id="surcharge_policy" name="surcharge_policy" defaultValue={config.custom_texts.surcharge_policy} maxLength={4000} /></Field>
        <Field label="Các điều khoản và điều kiện" htmlFor="terms_conditions"><Textarea id="terms_conditions" name="terms_conditions" defaultValue={config.custom_texts.terms_conditions} maxLength={4000} className="min-h-40" /></Field>
        <Field label="Điều khoản huỷ booking" htmlFor="cancellation_policy"><Textarea id="cancellation_policy" name="cancellation_policy" defaultValue={config.custom_texts.cancellation_policy} maxLength={4000} /></Field>
        <Field label="Lời chào cuối phiếu" htmlFor="footer_greeting"><Textarea id="footer_greeting" name="footer_greeting" defaultValue={config.custom_texts.footer_greeting} maxLength={600} className="min-h-20" /></Field>
      </div>

      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      {state && !state.error && <p role="status" className="text-sm font-medium text-green-800">Đã lưu mẫu voucher</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="h-12" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu mẫu voucher"}</Button>
        {previewToken ? (
          <a href={`/voucher/${previewToken}`} target="_blank" rel="noopener noreferrer" className="brutal-btn inline-flex h-12 items-center bg-white px-4 text-sm text-black">Xem thử (booking gần nhất)</a>
        ) : <span className="text-xs text-muted-foreground">Tạo booking đầu tiên để xem thử phiếu.</span>}
      </div>
    </form>
  );
}
