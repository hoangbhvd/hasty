import { headers } from "next/headers";
import { getVoucherResult } from "@/lib/voucher";
import { RenderError, renderVoucher, type Format } from "@/lib/voucher-render";
import { clientIp, hit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** GET /api/voucher/[token]/export?format=pdf|png — không cần đăng nhập, token voucher là quyền truy cập. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const f = new URL(req.url).searchParams.get("format");
  if (f !== "pdf" && f !== "png") return Response.json({ error: "format phải là pdf hoặc png" }, { status: 400 });
  const format: Format = f;

  const r = await getVoucherResult(token);
  if (r.kind === "missing") return Response.json({ error: "Không tìm thấy" }, { status: 404 });
  if (r.kind === "expired") return Response.json({ error: "Link đã hết hạn" }, { status: 410 });

  // Chromium tốn tài nguyên: giới hạn theo IP để không bị lạm dụng
  const v = await hit(`rl:voucher-export:${clientIp(await headers())}`, { limit: 20, windowSec: 600 });
  if (!v.allowed) return Response.json({ error: "Thao tác quá nhanh, vui lòng thử lại sau" }, { status: 429, headers: { "Retry-After": String(v.retryAfterSec) } });

  try {
    const layout = format === "png" && r.data.config.template_id !== "DALAT_BOUTIQUE" ? "card" : "a4";
    const body = await renderVoucher(token, format, layout);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "image/png",
        "Content-Disposition": `attachment; filename="BC-${r.data.bookingCode}.${format}"`,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    if (e instanceof RenderError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
