"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Field, Select, Textarea } from "@/components/form-fields";
import { useSafeForm } from "@/lib/use-safe-form";
import { saveVoucherConfigAction } from "@/app/(app)/voucher-actions";
import { BLOCK_LABEL, FONT_FAMILIES, FONT_LABEL, LOGO_MAX_PX, LOGO_MIN_PX, SAMPLE_TEXTS, TEMPLATE_IDS, TEMPLATE_LABEL, type BlockId, type VoucherConfig } from "@/lib/voucher-config";
import { configFromForm } from "@/lib/voucher-form";
import { sampleVoucher } from "@/lib/voucher-sample";
import { VoucherView } from "@/components/voucher-view";
import { compressImage } from "@/lib/image-compress";
import { registerLogoAction } from "@/app/(app)/profile-actions";

const BLOCKS: [keyof VoucherConfig["blocks"], string][] = [
  ["show_logo", "Logo"], ["show_cover_image", "Ảnh bìa"], ["show_price_table", "Bảng giá"], ["show_vietqr", "Mã VietQR thanh toán"],
  ["show_google_maps", "Bản đồ (nút / QR vị trí)"], ["show_caretaker_phone", "SĐT quản gia"], ["show_surcharge_policy", "Chính sách phụ thu"],
  ["show_terms_conditions", "Điều khoản & điều kiện"], ["show_cancellation_policy", "Điều khoản huỷ"],
];

/** Xem trước trực tiếp: dựng đúng VoucherView với dữ liệu giả lập, thu nhỏ vừa khung. */
function LivePreview({ config, propertyName, address }: { config: VoucherConfig; propertyName: string; address: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const natural = config.template_id === "DALAT_BOUTIQUE" ? 794 : 430;
  const zoom = w > 0 ? Math.min(w / natural, 1.2) : 1;
  return (
    <div ref={box} className="overflow-hidden rounded border border-black bg-muted p-2" aria-label="Xem trước phiếu">
      <div style={{ width: natural, zoom }} className="mx-auto bg-white">
        <VoucherView v={sampleVoucher(config, { propertyName, address })} token="preview" />
      </div>
      <p className="pt-1 text-center text-[11px] text-muted-foreground">Dữ liệu giả lập — chỉ để xem bố cục</p>
    </div>
  );
}

/** Đổi thứ tự các khối bằng nút lên/xuống (hoạt động tốt trên điện thoại, không cần kéo thả). */
function BlockOrderEditor({ order, onChange, boutique }: { order: BlockId[]; onChange: (o: BlockId[]) => void; boutique: boolean }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-sm font-medium">Thứ tự các khối</legend>
      <input type="hidden" name="block_order" value={order.join(",")} />
      <ol className="space-y-1">
        {order.map((id, i) => (
          <li key={id} className="flex items-center gap-2 rounded border border-black bg-white p-1 pl-3 text-sm">
            <span className="money-num w-5 text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1">{BLOCK_LABEL[id]}</span>
            <button type="button" aria-label={`Đưa “${BLOCK_LABEL[id]}” lên`} disabled={i === 0} onClick={() => move(i, -1)} className="brutal-btn grid size-9 place-items-center bg-white text-black disabled:opacity-40">↑</button>
            <button type="button" aria-label={`Đưa “${BLOCK_LABEL[id]}” xuống`} disabled={i === order.length - 1} onClick={() => move(i, 1)} className="brutal-btn grid size-9 place-items-center bg-white text-black disabled:opacity-40">↓</button>
          </li>
        ))}
      </ol>
      {boutique && <p className="text-xs text-muted-foreground">Mẫu Boutique: đầu phiếu và thông tin khách luôn ở trên; thứ tự áp dụng cho 2 cột phía dưới (trái: Bảng giá ↔ Chính sách; phải: Điều khoản huỷ ↔ Lời cảm ơn). Mẫu này không có mã VietQR.</p>}
    </fieldset>
  );
}

function LogoUploader({ propertyId, value, onChange, r2Ready }: { propertyId: string; value: string; onChange: (url: string) => void; r2Ready: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function pick(file: File) {
    setBusy(true); setError(undefined);
    try {
      const { blob, type } = await compressImage(file, { maxW: 400, maxH: 400, png: true });
      const res = await fetch("/api/media/presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "logo", propertyId, contentType: type, size: blob.size }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Không tải lên được");
      const put = await fetch(j.uploadUrl, { method: "PUT", headers: { "Content-Type": type }, body: blob });
      if (!put.ok) throw new Error("Tải lên R2 thất bại (kiểm tra CORS của bucket)");
      const r = await registerLogoAction(propertyId, type);
      if (r.error || !r.url) throw new Error(r.error ?? "Lỗi");
      onChange(r.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi tải logo"); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className="space-y-1">
      <input type="hidden" name="logo_url" value={value} />
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      <div className="flex flex-wrap items-center gap-2">
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Logo hiện tại" className="h-12 w-auto border border-black bg-white object-contain p-1" />
        )}
        <Button type="button" variant="outline" className="h-11" disabled={!r2Ready || busy} onClick={() => input.current?.click()}>{busy ? "Đang tải…" : value ? "Đổi logo" : "Tải logo"}</Button>
        {value && <Button type="button" variant="outline" className="h-11" onClick={() => onChange("")}>Bỏ logo</Button>}
      </div>
      {!r2Ready && <p className="text-xs text-red-700">Chưa cấu hình Cloudflare R2.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function VoucherConfigForm({
  propertyId, config, images, previews, propertyName = "Homestay của bạn", address = null, r2Ready = false,
}: {
  propertyId: string;
  config: VoucherConfig;
  images: { url: string }[];
  previews: { token: string; label: string }[];
  propertyName?: string;
  address?: string | null;
  r2Ready?: boolean;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [logo, setLogo] = useState(config.branding.logo_url ?? "");
  const [live, setLive] = useState<VoucherConfig>(config);
  const [order, setOrder] = useState<BlockId[]>(config.block_order);
  const recompute = (l = logo) => {
    const f = formRef.current;
    if (f) setLive(configFromForm(new FormData(f), { cover: String(new FormData(f).get("cover_image_url") ?? "") || null, logo: l || null }));
  };
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(saveVoucherConfigAction.bind(null, propertyId));
  const [sel, setSel] = useState(previews[0]?.token ?? "");
  const formRef = useRef<HTMLFormElement | null>(null);
  const setRef = (el: HTMLFormElement | null) => { formRef.current = el; ref.current = el; };

  function fillSamples() {
    const f = formRef.current;
    if (!f) return;
    for (const [k, v] of Object.entries(SAMPLE_TEXTS)) (f.elements.namedItem(k) as HTMLTextAreaElement).value = v;
  }

  const b = config.branding;
  return (
    <div className="md:grid md:grid-cols-2 md:gap-6">
      <div className="mb-3 grid grid-cols-2 gap-2 md:hidden" role="tablist">
        {([["edit", "Chỉnh sửa"], ["preview", "Xem trước"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); if (k === "preview") recompute(); }} className={`brutal-btn h-11 text-sm text-black ${tab === k ? "bg-primary" : "bg-white"}`}>{label}</button>
        ))}
      </div>
      <form ref={setRef} onSubmit={onSubmit} onChange={() => recompute()} className={`space-y-5 ${tab === "preview" ? "hidden md:block" : ""}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mẫu giao diện" htmlFor="template_id">
          <Select id="template_id" name="template_id" defaultValue={config.template_id}
            options={TEMPLATE_IDS.map((id) => ({ value: id, label: TEMPLATE_LABEL[id] }))} />
        </Field>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Logo homestay</span>
          <LogoUploader propertyId={propertyId} value={logo} onChange={(u) => { setLogo(u); recompute(u); }} r2Ready={r2Ready} />
        </div>
        <Field label="Vị trí logo" htmlFor="logo_position">
          <Select id="logo_position" name="logo_position" defaultValue={b.logo_position} options={[{ value: "LEFT", label: "Trái" }, { value: "CENTER", label: "Giữa" }, { value: "RIGHT", label: "Phải" }]} />
        </Field>
        <Field label={`Cỡ logo (${LOGO_MIN_PX}–${LOGO_MAX_PX}px)`} htmlFor="logo_size_px">
          <input id="logo_size_px" name="logo_size_px" type="range" min={LOGO_MIN_PX} max={LOGO_MAX_PX} defaultValue={b.logo_size_px} className="h-11 w-full accent-black" />
        </Field>
        <Field label="Tên thương hiệu" htmlFor="brand_name"><Input id="brand_name" name="brand_name" defaultValue={b.brand_name} maxLength={60} className="h-11 text-base" /></Field>
        <Field label="Giờ nhận phòng" htmlFor="checkin_time"><Input id="checkin_time" name="checkin_time" type="time" defaultValue={config.stay_times.checkin_time} required className="h-11 text-base" /></Field>
        <Field label="Giờ trả phòng" htmlFor="checkout_time"><Input id="checkout_time" name="checkout_time" type="time" defaultValue={config.stay_times.checkout_time} required className="h-11 text-base" /></Field>
        <Field label="Tiêu đề phiếu" htmlFor="header_title"><Input id="header_title" name="header_title" defaultValue={config.custom_texts.header_title} maxLength={80} className="h-11 text-base" /></Field>
        <Field label="Khung ảnh" htmlFor="image_frame_style">
          <Select id="image_frame_style" name="image_frame_style" defaultValue={b.image_frame_style} options={[{ value: "ARCH", label: "Vòm cong" }, { value: "RECTANGLE", label: "Chữ nhật" }, { value: "ROUNDED", label: "Bo góc" }]} />
        </Field>
        <Field label="Màu chủ đạo" htmlFor="primary_color"><input id="primary_color" name="primary_color" type="color" defaultValue={b.primary_color} className="brutal-input h-11 w-full p-1" /></Field>
        <Field label="Màu nền phiếu" htmlFor="background_color"><input id="background_color" name="background_color" type="color" defaultValue={b.background_color} className="brutal-input h-11 w-full p-1" /></Field>
        <Field label="Font chữ" htmlFor="font_family" hint="Mẫu Receipt Compact luôn dùng chữ biên lai (mono)">
          <Select id="font_family" name="font_family" defaultValue={b.font_family} options={FONT_FAMILIES.map((f) => ({ value: f, label: FONT_LABEL[f] }))} />
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

      <BlockOrderEditor order={order} boutique={live.template_id === "DALAT_BOUTIQUE"} onChange={(o) => { setOrder(o); setTimeout(() => recompute(), 0); }} />

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
      <div className="sticky bottom-[4.5rem] z-30 -mx-1 flex flex-wrap items-center gap-3 border-t border-black bg-background p-3 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" size="lg" className="h-12" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu thiết kế"}</Button>
        {previews.length > 0 ? (
          <span className="inline-flex items-center gap-2">
            <select aria-label="Booking xem thử" value={sel} onChange={(e) => setSel(e.target.value)} className="brutal-input h-12 max-w-56 bg-white px-2 text-sm">
              {previews.map((p) => <option key={p.token} value={p.token}>{p.label}</option>)}
            </select>
            <a href={`/voucher/${sel || previews[0].token}`} target="_blank" rel="noopener noreferrer" className="brutal-btn inline-flex h-12 items-center bg-white px-4 text-sm text-black">Xem thử (lưu trước)</a>
          </span>
        ) : <span className="text-xs text-muted-foreground">Tạo booking đầu tiên để xem thử phiếu.</span>}
      </div>
      </form>
      <div className={`md:sticky md:top-4 md:self-start ${tab === "edit" ? "hidden md:block" : ""}`}>
        <LivePreview config={live} propertyName={propertyName} address={address} />
      </div>
    </div>
  );
}
