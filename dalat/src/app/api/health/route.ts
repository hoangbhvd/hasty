import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Healthcheck cho Docker/nginx/uptime monitor. Không trả thông tin nhạy cảm. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
