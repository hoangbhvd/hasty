// Dựng PDF A4 / PNG của Booking Confirmation bằng Gotenberg (Chromium headless).
// Gotenberg mở trang /voucher/[token]/render (cùng React view với trang công khai) qua mạng nội bộ Docker.
export class RenderError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

export type Format = "pdf" | "png";
/** A4 ở 96 dpi. PNG vẽ ở zoom 2 để chữ nét khi zoom trên Zalo. */
export const A4_PX = { w: 794, h: 1123 };
export const PNG_SCALE = 2;

const cfg = () => ({
  gotenberg: process.env.GOTENBERG_URL?.replace(/\/$/, ""),
  base: (process.env.VOUCHER_RENDER_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, ""),
});

export const renderConfigured = () => { const c = cfg(); return !!(c.gotenberg && c.base); };

/** "a4": tờ A4 (PDF, và PNG của mẫu Boutique). "card": thẻ dọc như trên điện thoại, ảnh cao theo nội dung (PNG của các mẫu còn lại). */
export type Layout = "a4" | "card";
export const CARD_PX = 450;

export function renderUrl(token: string, format: Format, layout: Layout) {
  const q = format === "png" ? `?scale=${PNG_SCALE}${layout === "card" ? "&layout=card" : ""}` : "";
  return `${cfg().base}/voucher/${token}/render${q}`;
}

export async function renderVoucher(token: string, format: Format, layout: Layout = "a4"): Promise<Buffer> {
  const c = cfg();
  if (!c.gotenberg || !c.base) throw new RenderError("Chưa cấu hình Gotenberg (GOTENBERG_URL, VOUCHER_RENDER_BASE_URL)", 503);

  const fd = new FormData();
  fd.set("url", renderUrl(token, format, layout));
  // Chờ cả font lẫn ảnh (logo, ảnh bìa, QR) tải xong rồi mới chụp
  fd.set("waitForExpression", "document.fonts.status === 'loaded' && Array.from(document.images).every((i) => i.complete)");
  fd.set("waitDelay", "300ms");
  let endpoint: string;
  if (format === "pdf") {
    endpoint = "/forms/chromium/convert/url";
    fd.set("paperWidth", "8.27"); fd.set("paperHeight", "11.7");
    for (const m of ["marginTop", "marginBottom", "marginLeft", "marginRight"]) fd.set(m, "0");
    fd.set("preferCssPageSize", "true"); fd.set("printBackground", "true");
  } else {
    endpoint = "/forms/chromium/screenshot/url";
    const card = layout === "card";
    fd.set("width", String((card ? CARD_PX : A4_PX.w) * PNG_SCALE)); fd.set("height", String(card ? 200 : A4_PX.h * PNG_SCALE)); // thẻ: khung nhỏ, chụp cả trang nên cao theo nội dung
    // clip=true: đúng 1 khung A4; clip=false: chụp cả trang (thẻ dọc cao theo nội dung)
    fd.set("format", "png"); fd.set("omitBackground", "false"); fd.set("clip", card ? "false" : "true");
  }
  let res: Response;
  try {
    res = await fetch(c.gotenberg + endpoint, { method: "POST", body: fd, signal: AbortSignal.timeout(40_000) });
  } catch {
    throw new RenderError("Không kết nối được dịch vụ dựng PDF/PNG");
  }
  if (!res.ok) throw new RenderError(`Dịch vụ dựng PDF/PNG lỗi (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
