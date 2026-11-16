import { currentUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { renderConfirmation, SAMPLE_VARS } from "@/lib/confirmation";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const tpl = await withUser(uid, async (q) => (await q<{ html: string; css: string }>("select html, css from booking_templates where id=$1", [id]))[0]);
  if (!tpl) return new Response("Not found", { status: 404 });
  const r = renderConfirmation(tpl.html, tpl.css, SAMPLE_VARS);
  return new Response(r.html, { headers: r.headers });
}
