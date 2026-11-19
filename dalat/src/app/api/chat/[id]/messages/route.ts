import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { ChatError, getMessages, sendText } from "@/lib/chat";

const uuid = z.uuid();

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  try {
    return NextResponse.json({ messages: await getMessages(user.id, id) });
  } catch (e) {
    if (e instanceof ChatError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof body?.text !== "string") return NextResponse.json({ error: "Thiếu nội dung" }, { status: 400 });
  try {
    return NextResponse.json({ message: await sendText(user.id, id, body.text) });
  } catch (e) {
    if (e instanceof ChatError) return NextResponse.json({ error: e.message }, { status: e.message.includes("Không tìm thấy") ? 404 : 400 });
    throw e;
  }
}
