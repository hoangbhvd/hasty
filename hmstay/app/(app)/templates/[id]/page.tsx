import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { VARIABLES } from "@/lib/confirmation";
import EditorLoader from "./EditorLoader";

export default async function EditTemplate({ params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const tpl = await withUser(uid, async (q) => (await q<{ id: string; name: string; html: string; css: string; project: unknown }>(
    "select id, name, html, css, project from booking_templates where id=$1", [id]))[0]);
  if (!tpl) notFound();
  return (
    <div className="space-y-3">
      <Link href="/templates" className="text-sm text-teal-700 underline">← Danh sách mẫu</Link>
      <EditorLoader id={tpl.id} name={tpl.name} project={tpl.project} html={tpl.html} css={tpl.css} variables={VARIABLES.map(({ key, label }) => ({ key, label }))} />
    </div>
  );
}
