import { getVoucherQrUrl } from "@/lib/voucher";

/**
 * Proxy ảnh VietQR cùng origin: html-to-image cần ảnh cùng origin (hoặc CORS) mới xuất PNG được.
 * Không cần đăng nhập — token voucher chính là quyền truy cập.
 */
export async function GET(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = await getVoucherQrUrl(token);
  if (!url) return new Response("Not found", { status: 404 });
  try {
    const up = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!up.ok || !up.body) return new Response("QR unavailable", { status: 502 });
    return new Response(up.body, {
      headers: { "Content-Type": up.headers.get("content-type") ?? "image/png", "Cache-Control": "private, max-age=60", "Referrer-Policy": "no-referrer" },
    });
  } catch {
    return new Response("QR unavailable", { status: 502 });
  }
}
