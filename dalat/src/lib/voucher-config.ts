import { z } from "zod";

export const TEMPLATE_IDS = ["DALAT_BOUTIQUE", "GUMROAD_BRUTAL", "LUXURY_MINIMAL", "RECEIPT_COMPACT"] as const;
/** Cả 4 mẫu đều đã có giao diện (xem components/voucher-view.tsx). */
export const AVAILABLE_TEMPLATES = TEMPLATE_IDS;

export const TEMPLATE_LABEL: Record<(typeof TEMPLATE_IDS)[number], string> = {
  DALAT_BOUTIQUE: "Đà Lạt Boutique (mặc định)",
  GUMROAD_BRUTAL: "Gumroad Brutal (vé / biên lai đậm)",
  LUXURY_MINIMAL: "Luxury Minimal (tối giản, sang trọng)",
  RECEIPT_COMPACT: "Receipt Compact (biên lai gọn)",
};
export const FRAME_STYLES = ["ARCH", "RECTANGLE", "ROUNDED"] as const;
export const FONT_STYLES = ["MODERN", "CLASSIC", "MONO"] as const;

export type VoucherConfig = {
  template_id: (typeof TEMPLATE_IDS)[number];
  branding: {
    brand_name: string;
    cover_image_url: string | null;
    image_frame_style: (typeof FRAME_STYLES)[number];
    primary_color: string;
    background_color: string;
    font_style: (typeof FONT_STYLES)[number];
  };
  blocks: {
    show_cover_image: boolean;
    show_caretaker_phone: boolean;
    show_price_table: boolean;
    show_vietqr: boolean;
    show_google_maps: boolean;
    show_surcharge_policy: boolean;
    show_terms_conditions: boolean;
    show_cancellation_policy: boolean;
  };
  custom_texts: {
    header_title: string;
    surcharge_policy: string;
    terms_conditions: string;
    cancellation_policy: string;
    footer_greeting: string;
  };
};

export const DEFAULT_VOUCHER_CONFIG: VoucherConfig = {
  template_id: "DALAT_BOUTIQUE",
  branding: {
    brand_name: "",
    cover_image_url: null,
    image_frame_style: "ARCH",
    primary_color: "#B08978",
    background_color: "#FFFFFF",
    font_style: "MODERN",
  },
  blocks: {
    show_cover_image: true,
    show_caretaker_phone: true,
    show_price_table: true,
    show_vietqr: true, // Phase 4: VietQR động bật mặc định; chủ căn có thể tắt
    show_google_maps: true,
    show_surcharge_policy: true,
    show_terms_conditions: true,
    show_cancellation_policy: true,
  },
  custom_texts: {
    header_title: "XÁC NHẬN ĐẶT PHÒNG",
    surcharge_policy: "",
    terms_conditions: "",
    cancellation_policy: "",
    footer_greeting: "Xin cảm ơn và hân hạnh được phục vụ quý khách\nChúc quý khách có chuyến nghỉ dưỡng tuyệt vời\nHẹn gặp quý khách tại Đà Lạt",
  },
};

/** Nội dung gợi ý (bấm nút "Chèn mẫu gợi ý" trong form thiết kế). */
export const SAMPLE_TEXTS = {
  surcharge_policy:
    "1. Giá trên không bao gồm VAT.\n2. Quý khách vui lòng đi đúng số người quy định, phát sinh phụ thu 150.000/người/đêm. Quý khách vui lòng tự dọn dẹp khu vực bếp và sân BBQ sau khi sử dụng hoặc có thể thuê dọn dẹp và trả phí 500.000 - 1.000.000/lần (tùy mức độ).",
  terms_conditions:
    "1. Quý khách vui lòng mang theo CMND/CCCD/Passport để làm thủ tục đăng ký lưu trú theo quy định.\n2. Không ồn ào sau 21h. Không sử dụng loa kéo & karaoke sau 22h.\n3. Nghiêm cấm tàng trữ, sử dụng chất gây nghiện - chất ma túy tại nơi lưu trú. Nếu phát hiện chúng tôi sẽ lập tức từ chối lưu trú không hoàn tiền.\n4. Nhận và trả phòng đúng giờ quy định. Trường hợp check-in sớm hoặc check-out trễ nếu home chưa có khách đặt, home sẽ hỗ trợ từ 1 - 3h (tùy tình trạng nhà).\n5. Quý khách vui lòng kiểm tra nhà khi nhận, nếu có hư hỏng xảy ra trong quá trình lưu trú xin đền bù theo thiệt hại.\n6. Tài sản tư trang có giá trị quý khách vui lòng tự bảo quản.\n7. Nhà không nhận thú cưng.\n8. Không hút thuốc trong nhà, không đem đồ ăn có mùi vào phòng.",
  cancellation_policy:
    "1. Áp dụng chính sách không hoàn hủy booking. Trong trường hợp hủy sẽ mất 100% tiền cọc.\n2. Không hoàn tiền nếu quý khách đặt phòng nhưng không đến hoặc hủy booking sớm hơn thời hạn lưu trú.\n3. Hủy booking, không nhận nhà khi có lý do đột xuất, hãy liên hệ sớm nhất có thể, home sẽ sắp xếp dời lịch cho quý khách.\n4. Quý khách vui lòng thanh toán đầy đủ theo thông tin đặt phòng. Số tiền thanh toán sẽ không thay đổi dù có điều chỉnh số ngày lưu trú.",
} as const;

const HEX = /^#[0-9a-fA-F]{6}$/; // chỉ nhận hex — giá trị này được đưa vào style, không để chuỗi tuỳ ý lọt vào CSS
const TEXT_MAX = 4000;

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const text = (v: unknown, d: string, max = TEXT_MAX) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : d);
const oneOf = <T extends readonly string[]>(v: unknown, list: T, d: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : d;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Đọc cấu hình từ DB/form: trường nào sai thì dùng mặc định, không bao giờ ném lỗi. */
export function parseVoucherConfig(raw: unknown): VoucherConfig {
  const d = DEFAULT_VOUCHER_CONFIG;
  const r = obj(raw), b = obj(r.branding), k = obj(r.blocks), t = obj(r.custom_texts);
  const cover = typeof b.cover_image_url === "string" && /^https:\/\//.test(b.cover_image_url) && b.cover_image_url.length <= 500 ? b.cover_image_url : null;
  return {
    template_id: oneOf(r.template_id, TEMPLATE_IDS, d.template_id),
    branding: {
      brand_name: text(b.brand_name, d.branding.brand_name, 60),
      cover_image_url: cover,
      image_frame_style: oneOf(b.image_frame_style, FRAME_STYLES, d.branding.image_frame_style),
      primary_color: hex(b.primary_color, d.branding.primary_color),
      background_color: hex(b.background_color, d.branding.background_color),
      font_style: oneOf(b.font_style, FONT_STYLES, d.branding.font_style),
    },
    blocks: Object.fromEntries(
      (Object.keys(d.blocks) as (keyof VoucherConfig["blocks"])[]).map((key) => [key, bool(k[key], d.blocks[key])]),
    ) as VoucherConfig["blocks"],
    custom_texts: {
      header_title: text(t.header_title, d.custom_texts.header_title, 80),
      surcharge_policy: text(t.surcharge_policy, d.custom_texts.surcharge_policy),
      terms_conditions: text(t.terms_conditions, d.custom_texts.terms_conditions),
      cancellation_policy: text(t.cancellation_policy, d.custom_texts.cancellation_policy),
      footer_greeting: text(t.footer_greeting, d.custom_texts.footer_greeting, 600),
    },
  };
}

export const voucherFormSchema = z.object({ propertyId: z.uuid() });
