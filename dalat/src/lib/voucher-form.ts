// Chuyển dữ liệu form Voucher Studio thành VoucherConfig. Thuần (không DB) nên dùng được cả ở trình duyệt (xem trước trực tiếp) lẫn server (lưu).
import { DEFAULT_VOUCHER_CONFIG, parseVoucherConfig, type PdfmeConfig, type VoucherConfig } from "@/lib/voucher-config";

export function configFromForm(fd: FormData, extra: { cover: string | null; logo: string | null; mode?: VoucherConfig["mode"]; pdfme?: PdfmeConfig }): VoucherConfig {
  const s = (k: string) => String(fd.get(k) ?? "");
  const blocks = Object.fromEntries(Object.keys(DEFAULT_VOUCHER_CONFIG.blocks).map((k) => [k, fd.get(k) === "on"]));
  return parseVoucherConfig({
    mode: extra.mode ?? "TEMPLATE",
    pdfme_config: extra.pdfme ?? DEFAULT_VOUCHER_CONFIG.pdfme_config,
    template_id: s("template_id"),
    branding: {
      logo_url: extra.logo, logo_position: s("logo_position"), logo_size_px: s("logo_size_px"),
      brand_name: s("brand_name").trim(), cover_image_url: extra.cover, image_frame_style: s("image_frame_style"),
      primary_color: s("primary_color"), background_color: s("background_color"), font_style: s("font_style"),
    },
    blocks,
    stay_times: { checkin_time: s("checkin_time"), checkout_time: s("checkout_time") },
    custom_texts: {
      header_title: s("header_title").trim() || DEFAULT_VOUCHER_CONFIG.custom_texts.header_title,
      surcharge_policy: s("surcharge_policy"), terms_conditions: s("terms_conditions"),
      cancellation_policy: s("cancellation_policy"), footer_greeting: s("footer_greeting"),
    },
  });
}
