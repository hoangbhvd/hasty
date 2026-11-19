import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { getBookingForParty } from "@/lib/booking-finance";
import { ALLOWED_TYPES, billPrefix, keyPrefix, presignUpload, r2Configured } from "@/lib/r2";

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("media").default("media"), propertyId: z.uuid(), contentType: z.string(), size: z.number().int().positive() }),
  z.object({ kind: z.literal("bill"), bookingId: z.uuid(), contentType: z.string(), size: z.number().int().positive() }),
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!r2Configured()) return NextResponse.json({ error: "Chưa cấu hình Cloudflare R2" }, { status: 503 });

  const raw = await req.json().catch(() => null);
  const parsed = body.safeParse(raw && typeof raw === "object" && !("kind" in raw) ? { ...raw, kind: "media" } : raw);
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  const p = parsed.data;

  const type = ALLOWED_TYPES[p.contentType];
  if (!type) return NextResponse.json({ error: "Chỉ hỗ trợ JPG, PNG, WebP, MP4, MOV" }, { status: 400 });
  if (p.kind === "bill" && type.media !== "IMAGE") return NextResponse.json({ error: "Ảnh bill phải là JPG, PNG hoặc WebP" }, { status: 400 });
  if (p.size > type.maxBytes) return NextResponse.json({ error: `File quá lớn (tối đa ${type.maxBytes / 1024 / 1024}MB)` }, { status: 400 });

  if (p.kind === "bill") {
    if (!(await getBookingForParty(user.id, p.bookingId))) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    return NextResponse.json(await presignUpload(billPrefix(p.bookingId), p.contentType));
  }
  if (!(await getManagedProperty(user.id, p.propertyId))) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  return NextResponse.json(await presignUpload(keyPrefix(p.propertyId), p.contentType));
}
