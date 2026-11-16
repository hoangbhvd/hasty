import { currentUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { loadConfirmationVars, renderConfirmation, STARTER_CSS, STARTER_HTML } from "@/lib/confirmation";

const UUID = /^[0-9a-f-]{36}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const vars = await loadConfirmationVars(uid, id);
  if (!vars) return new Response("Not found", { status: 404 });

  const t = new URL(req.url).searchParams.get("t");
  let html = STARTER_HTML, css = STARTER_CSS;
  if (t && t !== "default") {
    if (!UUID.test(t)) return new Response("Not found", { status: 404 });
    const tpl = await withUser(uid, async (q) => (await q<{ html: string; css: string }>("select html, css from booking_templates where id=$1", [t]))[0]);
    if (!tpl) return new Response("Not found", { status: 404 });
    ({ html, css } = tpl);
  }
  const r = renderConfirmation(html, css, vars);
  return new Response(r.html, { headers: r.headers });
}
