// Chế độ 2 (CUSTOM_PDFME): ghép PDF nền (thiết kế từ Canva) với các ô biến động bằng pdfme, rồi (tuỳ chọn) rasterize trang 1 ra PNG.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { generate } from "@pdfme/generator";
import { barcodes, image, text } from "@pdfme/schemas";
import { formatDateVi, formatVnd, guestsText } from "@/lib/format";
import { hourLabel } from "@/components/voucher-boutique";
import { PDFDocument, rgb } from "pdf-lib";
import { PDFME_FIELDS, type PdfmeConfig, type PdfmeSchema, type PdfmeVar } from "@/lib/voucher-config";
import type { VoucherData } from "@/lib/voucher";

export class PdfmeError extends Error {}

const FONT_FILES = {
  BeVietnamPro: "BeVietnamPro-Regular.ttf",
  "BeVietnamPro-Bold": "BeVietnamPro-Bold.ttf",
  PlayfairDisplay: "PlayfairDisplay-Regular.ttf",
  Montserrat: "Montserrat-Regular.ttf",
  "Montserrat-Bold": "Montserrat-Bold.ttf",
} as const;

let fontCache: Promise<Record<string, { data: ArrayBuffer; fallback?: boolean }>> | undefined;
/** Font .ttf hỗ trợ đủ dấu tiếng Việt (đặt trong /public/fonts). BeVietnamPro-Regular là font mặc định (fallback). */
export function loadFonts() {
  return (fontCache ??= (async () => {
    const dir = path.join(process.cwd(), "public", "fonts");
    const out: Record<string, { data: ArrayBuffer; fallback?: boolean }> = {};
    for (const [name, file] of Object.entries(FONT_FILES)) {
      const b = await readFile(path.join(dir, file));
      out[name] = { data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ...(name === "BeVietnamPro" ? { fallback: true } : {}) };
    }
    return out;
  })());
}

/** Giá trị cho từng biến. CHỈ gồm thông tin khách được phép thấy (không giá Net / hoa hồng / công nợ). */
export function pdfmeInputs(v: VoucherData, qrDataUri: string | null): Record<string, string> {
  const d = (s: string) => formatDateVi(new Date(`${s}T00:00:00Z`));
  const c = v.config.stay_times;
  return {
    guest_name: v.guestName,
    guest_phone: v.guestPhone ?? "",
    guest_count: guestsText(v.guestCount, v.childCount),
    booking_code: v.bookingCode,
    room_info: v.roomLabel,
    check_in_str: `${hourLabel(c.checkin_time)} ${d(v.checkIn)}`,
    check_out_str: `${hourLabel(c.checkout_time)} ${d(v.checkOut)}`,
    nights_count: String(v.nights),
    price_per_night: formatVnd(v.pricePerNight),
    nightly_prices: v.nightly.map((n) => {
      const d = new Date(`${n.date}T00:00:00Z`);
      return `${["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}: ${formatVnd(n.amount)}`;
    }).join("\n"),
    guest_total_price: formatVnd(v.grandTotal),
    deposit_paid: formatVnd(v.paid),
    remaining_amount: formatVnd(Math.max(v.remaining, 0)),
    caretaker_or_broker_phone: v.caretakerPhone ?? v.supportPhone ?? "",
    property_address: v.address ?? "",
    ...(qrDataUri ? { vietqr_image: qrDataUri } : {}),
  };
}

const ALLOWED = new Set<string>(PDFME_FIELDS.map((f) => f.name));

/** Toạ độ/kiểu lưu trong config → schema của pdfme. Chỉ biến cho phép; biến ảnh không có dữ liệu thì bỏ qua. */
export function toPdfmeSchemas(schemas: PdfmeSchema[], inputs: Record<string, string>) {
  return schemas
    .filter((s) => ALLOWED.has(s.name) && inputs[s.name] !== undefined)
    .map((s) => s.type === "image"
      ? { name: s.name, type: "image", position: s.position, width: s.width, height: s.height }
      : {
          name: s.name, type: "text", position: s.position, width: s.width, height: s.height,
          fontSize: s.fontSize ?? 12, fontColor: s.fontColor ?? "#000000", alignment: s.alignment ?? "left", fontName: s.fontName ?? "BeVietnamPro",
          verticalAlignment: "middle", lineHeight: 1.2, characterSpacing: 0, fontColorOpacity: 1,
        });
}

/** Tải PDF nền; chỉ chấp nhận URL thuộc bucket R2 của mình (chống SSRF). */
export async function fetchBasePdf(url: string): Promise<Uint8Array> {
  const pub = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!pub || !url.startsWith(pub + "/")) throw new PdfmeError("PDF nền không thuộc kho lưu trữ");
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new PdfmeError("Không tải được PDF nền");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > 12 * 1024 * 1024) throw new PdfmeError("PDF nền quá lớn");
  return buf;
}

/** Che chữ {{biến}} gõ sẵn trong PDF nền bằng ô màu nền (đã lấy mẫu lúc tải lên), để dữ liệu thật điền đè lên sạch sẽ. */
export async function coverVars(base: Uint8Array, vars: PdfmeVar[]): Promise<Uint8Array> {
  if (vars.length === 0) return base;
  const doc = await PDFDocument.load(base);
  const page = doc.getPage(0);
  const { height } = page.getSize();
  const mm = 72 / 25.4;
  for (const v of vars) {
    const n = parseInt(v.cover.slice(1), 16);
    page.drawRectangle({ x: v.x * mm, y: height - (v.y + v.h) * mm, width: v.w * mm, height: v.h * mm, color: rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) });
  }
  return doc.save();
}

export async function generatePdfme(cfg: PdfmeConfig, inputs: Record<string, string>, basePdf?: Uint8Array): Promise<Buffer> {
  if (!cfg.base_pdf_url && !basePdf) throw new PdfmeError("Chưa có PDF nền");
  const base = await coverVars(basePdf ?? (await fetchBasePdf(cfg.base_pdf_url!)), cfg.vars);
  const schemas = toPdfmeSchemas(cfg.schemas, inputs);
  const pdf = await generate({
    template: { basePdf: base, schemas: [schemas] } as never,
    inputs: [inputs],
    plugins: { text, image, qrcode: barcodes.qrcode },
    options: { font: await loadFonts() },
  });
  return Buffer.from(pdf);
}

/** Trang 1 của PDF → PNG sắc nét (scale 2). */
export async function pdfToPng(pdf: Buffer): Promise<Buffer> {
  const { pdf: open } = await import("pdf-to-img");
  const doc = await open(pdf, { scale: 2 });
  try { return await doc.getPage(1); } finally { await doc.destroy(); }
}

export { imageToA4Pdf } from "@/lib/pdf-wrap";

/** Tải ảnh VietQR (URL nội bộ chứa số tài khoản — chỉ dùng phía server) và đổi thành data URI để nhúng vào PDF. Lỗi thì bỏ QR, không làm hỏng phiếu. */
export async function qrDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}
