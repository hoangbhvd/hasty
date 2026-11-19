import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { ALLOWED_TYPES, presignUpload, r2Configured } from "@/lib/r2";

const body = z.object({
  propertyId: z.uuid(),
  contentType: z.string(),
  size: z.number().int().positive(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!r2Configured()) return NextResponse.json({ error: "Chưa cấu hình Cloudflare R2" }, { status: 503 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { propertyId, contentType, size } = parsed.data;

  const type = ALLOWED_TYPES[contentType];
  if (!type) return NextResponse.json({ error: "Chỉ hỗ trợ JPG, PNG, WebP, MP4, MOV" }, { status: 400 });
  if (size > type.maxBytes) {
    return NextResponse.json({ error: `File quá lớn (tối đa ${type.maxBytes / 1024 / 1024}MB)` }, { status: 400 });
  }
  if (!(await getManagedProperty(user.id, propertyId))) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  }
  return NextResponse.json(await presignUpload(propertyId, contentType));
}
