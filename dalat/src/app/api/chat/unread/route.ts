import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { totalUnread } from "@/lib/chat";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  return NextResponse.json({ count: await totalUnread(user.id) });
}
