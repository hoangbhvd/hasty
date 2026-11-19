import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { ChatError, markRead } from "@/lib/chat";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  try {
    await markRead(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChatError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
