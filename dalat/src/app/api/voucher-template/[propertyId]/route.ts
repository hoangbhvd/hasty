import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { parseVoucherConfig } from "@/lib/voucher-config";
import { PdfmeError, fetchBasePdf } from "@/lib/voucher-pdfme";

/** PDF nền của căn, cho trình thiết kế kéo thả (cùng origin nên không cần CORS cho bucket). Chỉ chủ căn. */
export async function GET(_: Request, ctx: { params: Promise<{ propertyId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { propertyId } = await ctx.params;
  if (!z.uuid().safeParse(propertyId).success) return Response.json({ error: "Không hợp lệ" }, { status: 400 });
  const p = await getManagedProperty(user.id, propertyId);
  if (!p) return Response.json({ error: "Không có quyền" }, { status: 403 });
  const url = parseVoucherConfig(p.voucherConfig).pdfme_config.base_pdf_url;
  if (!url) return Response.json({ error: "Chưa có PDF nền" }, { status: 404 });
  try {
    return new Response(new Uint8Array(await fetchBasePdf(url)), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof PdfmeError) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
