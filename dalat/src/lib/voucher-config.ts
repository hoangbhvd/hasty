import { z } from "zod";

export const TEMPLATE_IDS = ["COTTOWN", "DALAT_BOUTIQUE", "GUMROAD_BRUTAL", "LUXURY_MINIMAL", "RECEIPT_COMPACT"] as const;
/** Cả 4 mẫu đều đã có giao diện (xem components/voucher-view.tsx). */
export const AVAILABLE_TEMPLATES = TEMPLATE_IDS;

export const TEMPLATE_LABEL: Record<(typeof TEMPLATE_IDS)[number], string> = {
  COTTOWN: "Cottown (mẫu có sẵn: ảnh khung vòm, bố cục A4)",
  DALAT_BOUTIQUE: "Đà Lạt Boutique (mặc định)",
  GUMROAD_BRUTAL: "Gumroad Brutal (vé / biên lai đậm)",
  LUXURY_MINIMAL: "Luxury Minimal (tối giản, sang trọng)",
  RECEIPT_COMPACT: "Receipt Compact (biên lai gọn)",
};
/** Các mẫu bố cục A4 dọc 2 cột (xuất PDF/PNG đúng khổ A4, không có VietQR thanh toán). */
export const isA4Template = (id: string) => id === "DALAT_BOUTIQUE" || id === "COTTOWN";
export const FRAME_STYLES = ["ARCH", "RECTANGLE", "ROUNDED"] as const;
export const FONT_FAMILIES = ["PLUS_JAKARTA", "BE_VIETNAM", "PLAYFAIR_SERIF"] as const;
export const FONT_LABEL: Record<(typeof FONT_FAMILIES)[number], string> = {
  PLUS_JAKARTA: "Plus Jakarta Sans (hiện đại)",
  BE_VIETNAM: "Be Vietnam Pro (chuẩn tiếng Việt)",
  PLAYFAIR_SERIF: "Playfair Display (cổ điển, có chân)",
};
/** CSS font-family cho từng lựa chọn (biến do next/font khai báo ở app/layout.tsx). */
export const FONT_CSS: Record<(typeof FONT_FAMILIES)[number], string> = {
  PLUS_JAKARTA: "var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif",
  BE_VIETNAM: "var(--font-be-vietnam), ui-sans-serif, system-ui, sans-serif",
  PLAYFAIR_SERIF: "var(--font-playfair), ui-serif, Georgia, serif",
};

/** Các khối của phiếu, theo thứ tự hiển thị mặc định. */
export const BLOCK_IDS = ["HEADER", "GUEST_INFO", "PRICE_TABLE", "VIETQR", "POLICIES", "FOOTER"] as const;
export type BlockId = (typeof BLOCK_IDS)[number];
export const BLOCK_LABEL: Record<BlockId, string> = {
  HEADER: "Đầu phiếu (logo, ảnh, tên, tiêu đề)", GUEST_INFO: "Thông tin khách & lưu trú", PRICE_TABLE: "Bảng giá & thanh toán",
  VIETQR: "Mã VietQR", POLICIES: "3 khối chính sách", FOOTER: "Lời cảm ơn cuối phiếu",
};

/** Danh sách hợp lệ: bỏ id lạ/trùng, id thiếu được thêm vào cuối theo thứ tự mặc định. */
export function normalizeBlockOrder(v: unknown): BlockId[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const seen = new Set<BlockId>();
  for (const x of raw) { const id = String(x).trim() as BlockId; if ((BLOCK_IDS as readonly string[]).includes(id)) seen.add(id); }
  for (const id of BLOCK_IDS) seen.add(id);
  return [...seen];
}
export const LOGO_POSITIONS = ["LEFT", "CENTER", "RIGHT"] as const;
export const LOGO_MIN_PX = 40, LOGO_MAX_PX = 140;
export const VOUCHER_MODES = ["TEMPLATE", "CUSTOM_PDFME"] as const;

/** Ô biến động của chế độ 2 (pdfme). `name` là khoá biến, vị trí/cỡ chữ tính bằng mm trên khổ A4 (210×297). */
export type PdfmeSchema = {
  name: string; type: "text" | "image" | "qrcode"; position: { x: number; y: number }; width: number; height: number;
  fontSize?: number; fontColor?: string; alignment?: "left" | "center" | "right"; fontName?: string; bold?: boolean;
};
/**
 * Biến `{{ten-bien}}` được gõ sẵn trong PDF nền (Canva) và tự nhận diện khi tải lên.
 * Vị trí (mm, gốc trên-trái) là của chữ trong PDF; `cover` là màu nền lấy mẫu quanh chữ để che đi chữ `{{...}}` khi xuất phiếu.
 * `field` là dữ liệu chủ nhà chọn để điền vào biến (null = chưa chọn: chỉ che, không điền).
 */
export const PDFME_FONTS = ["BeVietnamPro", "BeVietnamPro-Bold", "PlayfairDisplay", "Montserrat", "Montserrat-Bold"] as const;
export type PdfmeFontName = (typeof PDFME_FONTS)[number];
export type PdfmeVar = { tag: string; field: string | null; x: number; y: number; w: number; h: number; fontSize: number; cover: string; room: number; align: "left" | "center"; color: string; font: PdfmeFontName };
export type PdfmeConfig = { base_pdf_url: string | null; schemas: PdfmeSchema[]; vars: PdfmeVar[] };
export const PDF_VAR_TAG = /^[A-Za-z0-9_-]{1,40}$/;

export type VoucherConfig = {
  /** TEMPLATE = mẫu HTML có sẵn (mặc định); CUSTOM_PDFME = PDF nền tự thiết kế + ô biến động kéo thả. */
  mode: (typeof VOUCHER_MODES)[number];
  pdfme_config: PdfmeConfig;
  template_id: (typeof TEMPLATE_IDS)[number];
  /** Thứ tự các khối trên phiếu (xem BLOCK_IDS). */
  block_order: BlockId[];
  branding: {
    logo_url: string | null;
    logo_position: (typeof LOGO_POSITIONS)[number];
    logo_size_px: number;
    brand_name: string;
    cover_image_url: string | null;
    image_frame_style: (typeof FRAME_STYLES)[number];
    primary_color: string;
    background_color: string;
    font_family: (typeof FONT_FAMILIES)[number];
  };
  blocks: {
    show_logo: boolean;
    /** Hiện tên cơ sở (tên thương hiệu / tên căn) trên phiếu */
    show_property_name: boolean;
    show_cover_image: boolean;
    show_caretaker_phone: boolean;
    show_price_table: boolean;
    show_vietqr: boolean;
    show_google_maps: boolean;
    show_surcharge_policy: boolean;
    show_terms_conditions: boolean;
    show_cancellation_policy: boolean;
  };
  stay_times: { checkin_time: string; checkout_time: string }; // "HH:mm"
  custom_texts: {
    header_title: string;
    surcharge_policy: string;
    terms_conditions: string;
    cancellation_policy: string;
    footer_greeting: string;
  };
};

export const DEFAULT_VOUCHER_CONFIG: VoucherConfig = {
  mode: "TEMPLATE",
  pdfme_config: { base_pdf_url: null, schemas: [], vars: [] },
  template_id: "DALAT_BOUTIQUE",
  block_order: [...BLOCK_IDS],
  branding: {
    logo_url: null,
    logo_position: "CENTER",
    logo_size_px: 72,
    brand_name: "",
    cover_image_url: null,
    image_frame_style: "ARCH",
    primary_color: "#C49C89",
    background_color: "#FFFFFF",
    font_family: "PLUS_JAKARTA",
  },
  blocks: {
    show_logo: true,
    show_property_name: true,
    show_cover_image: true,
    show_caretaker_phone: true,
    show_price_table: true,
    show_vietqr: true, // Phase 4: VietQR động bật mặc định; chủ căn có thể tắt
    show_google_maps: true,
    show_surcharge_policy: true,
    show_terms_conditions: true,
    show_cancellation_policy: true,
  },
  stay_times: { checkin_time: "14:00", checkout_time: "12:00" },
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

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (v: unknown, d: string) => (typeof v === "string" && TIME.test(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const text = (v: unknown, d: string, max = TEXT_MAX) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : d);
const oneOf = <T extends readonly string[]>(v: unknown, list: T, d: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : d;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Biến động cho phép trong chế độ 2 (chỉ dữ liệu khách thấy được — tuyệt đối không có giá Net/hoa hồng). */
export const PDFME_FIELDS = [
  { name: "guest_name", label: "Tên khách", sample: "Nguyễn Văn Ánh" },
  { name: "guest_phone", label: "SĐT khách", sample: "0900 111 222" },
  { name: "guest_count", label: "Số khách", sample: "4 người lớn, 2 trẻ em" },
  { name: "booking_code", label: "Mã booking", sample: "DL-2606-889" },
  { name: "room_info", label: "Hình thức thuê", sample: "Nguyên căn" },
  { name: "check_in_str", label: "Check-in", sample: "14H 12/06/2026" },
  { name: "check_out_str", label: "Check-out", sample: "12H 14/06/2026" },
  { name: "nights_count", label: "Số đêm", sample: "2" },
  { name: "price_per_night", label: "Giá 1 đêm", sample: "2.000.000đ" },
  { name: "nightly_prices", label: "Giá từng đêm (mỗi đêm 1 dòng)", sample: "T6 12/06: 2.200.000đ\nT7 13/06: 2.500.000đ" },
  { name: "guest_total_price", label: "Thành tiền", sample: "4.000.000đ" },
  { name: "deposit_paid", label: "Đã cọc", sample: "1.000.000đ" },
  { name: "remaining_amount", label: "Còn lại", sample: "3.000.000đ" },
  { name: "caretaker_or_broker_phone", label: "SĐT quản gia / hỗ trợ", sample: "0933 444 555" },
  { name: "property_address", label: "Địa chỉ", sample: "12 Hẻm Thông, P.3, Đà Lạt" },
  { name: "vietqr_image", label: "Mã VietQR", sample: "", image: true },
] as const;
export type PdfmeFieldName = (typeof PDFME_FIELDS)[number]["name"];

const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d; };

export function parsePdfme(raw: unknown): PdfmeConfig {
  const o = obj(raw);
  const url = typeof o.base_pdf_url === "string" && /^https:\/\//.test(o.base_pdf_url) && o.base_pdf_url.length <= 500 ? o.base_pdf_url : null;
  const names = new Map<string, boolean>(PDFME_FIELDS.map((f) => [f.name, "image" in f]));
  const schemas: PdfmeSchema[] = [];
  for (const it of Array.isArray(o.schemas) ? o.schemas.slice(0, 40) : []) {
    const s = obj(it);
    const name = typeof s.name === "string" ? s.name : "";
    if (!names.has(name)) continue; // chỉ nhận biến trong danh sách cho phép
    const pos = obj(s.position);
    schemas.push({
      name, type: names.get(name) ? "image" : "text",
      position: { x: num(pos.x, 0, 0, 210), y: num(pos.y, 0, 0, 297) },
      width: num(s.width, 40, 5, 210), height: num(s.height, 8, 3, 297),
      fontSize: num(s.fontSize, 12, 6, 48), fontColor: hex(s.fontColor, "#000000"),
      alignment: oneOf(s.alignment, ["left", "center", "right"] as const, "left"),
      fontName: oneOf(s.fontName, PDFME_FONTS, "BeVietnamPro"),
    });
  }
  const vars: PdfmeVar[] = [];
  const seen = new Set<string>();
  for (const it of Array.isArray(o.vars) ? o.vars.slice(0, 40) : []) {
    const v = obj(it);
    const tag = typeof v.tag === "string" && PDF_VAR_TAG.test(v.tag) ? v.tag : "";
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    vars.push({
      tag, field: typeof v.field === "string" && names.has(v.field) ? v.field : null,
      x: num(v.x, 0, 0, 210), y: num(v.y, 0, 0, 297), w: num(v.w, 40, 2, 210), h: num(v.h, 8, 2, 297),
      fontSize: num(v.fontSize, 12, 6, 48), cover: hex(v.cover, "#FFFFFF"),
      room: num(v.room, num(v.w, 40, 2, 210), 0, 210), align: v.align === "center" ? "center" : "left",
      color: hex(v.color, "#000000"), font: oneOf(v.font, PDFME_FONTS, "BeVietnamPro"),
    });
  }
  return { base_pdf_url: url, schemas, vars };
}

/** Đọc cấu hình từ DB/form: trường nào sai thì dùng mặc định, không bao giờ ném lỗi. */
export function parseVoucherConfig(raw: unknown): VoucherConfig {
  const d = DEFAULT_VOUCHER_CONFIG;
  const r = obj(raw), b = obj(r.branding), k = obj(r.blocks), t = obj(r.custom_texts), st = obj(r.stay_times);
  const https = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) && v.length <= 500 ? v : null);
  const cover = https(b.cover_image_url);
  const px = Number(b.logo_size_px);
  return {
    mode: oneOf(r.mode, VOUCHER_MODES, d.mode),
    pdfme_config: parsePdfme(r.pdfme_config),
    template_id: oneOf(r.template_id, TEMPLATE_IDS, d.template_id),
    block_order: normalizeBlockOrder(r.block_order),
    branding: {
      logo_url: https(b.logo_url),
      logo_position: oneOf(b.logo_position, LOGO_POSITIONS, d.branding.logo_position),
      logo_size_px: Number.isFinite(px) ? Math.min(Math.max(Math.round(px), LOGO_MIN_PX), LOGO_MAX_PX) : d.branding.logo_size_px,
      brand_name: text(b.brand_name, d.branding.brand_name, 60),
      cover_image_url: cover,
      image_frame_style: oneOf(b.image_frame_style, FRAME_STYLES, d.branding.image_frame_style),
      primary_color: hex(b.primary_color, d.branding.primary_color),
      background_color: hex(b.background_color, d.branding.background_color),
      // font_style (MODERN/CLASSIC/MONO) là tên cũ: đổi sang font_family tương ứng để cấu hình đã lưu vẫn đúng
      font_family: oneOf(b.font_family ?? ({ CLASSIC: "PLAYFAIR_SERIF" } as Record<string, string>)[String(b.font_style)], FONT_FAMILIES, d.branding.font_family),
    },
    blocks: Object.fromEntries(
      (Object.keys(d.blocks) as (keyof VoucherConfig["blocks"])[]).map((key) => [key, bool(k[key], d.blocks[key])]),
    ) as VoucherConfig["blocks"],
    stay_times: { checkin_time: time(st.checkin_time, d.stay_times.checkin_time), checkout_time: time(st.checkout_time, d.stay_times.checkout_time) },
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
