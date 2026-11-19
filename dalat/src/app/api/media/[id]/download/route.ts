import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canViewProperty } from "@/lib/access";
import { keyFromUrl } from "@/lib/r2";

/** Tải file gốc (ảnh sạch) — chỉ Host chủ, Broker tạo, hoặc Broker liên kết đã duyệt. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });

  const media = await prisma.propertyMedia.findUnique({ where: { id } });
  if (!media || !(await canViewProperty(user.id, media.propertyId))) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  const key = keyFromUrl(media.url);
  if (!key) return NextResponse.json({ error: "File không hợp lệ" }, { status: 404 });

  const upstream = await fetch(media.url);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "Không tải được file" }, { status: 502 });

  const filename = key.split("/").pop()!;
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
