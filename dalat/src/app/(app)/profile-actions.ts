"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { IMAGE_EXT, avatarKey, coverKey, logoKey, publicUrlFor, r2Configured } from "@/lib/r2";
import type { FormState } from "@/app/(auth)/actions";

const ext = (contentType: string) => IMAGE_EXT[contentType];
/** Thêm ?v= để trình duyệt/CDN tải lại ảnh khi ghi đè cùng key. */
const versioned = (key: string) => `${publicUrlFor(key)}?v=${Date.now()}`;

export async function registerAvatarAction(contentType: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!r2Configured()) return { error: "Chưa cấu hình Cloudflare R2" };
  const e = ext(contentType);
  if (!e) return { error: "Định dạng không hợp lệ" };
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: versioned(avatarKey(user.id, e)) } });
  revalidatePath("/", "layout");
  return {};
}

export async function registerCoverAction(propertyId: string, contentType: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!r2Configured()) return { error: "Chưa cấu hình Cloudflare R2" };
  const e = ext(contentType);
  if (!e || !z.uuid().safeParse(propertyId).success) return { error: "Dữ liệu không hợp lệ" };
  const p = await getManagedProperty(user.id, propertyId);
  if (!p) return { error: "Không có quyền" };
  await prisma.property.update({ where: { id: p.id }, data: { coverImageUrl: versioned(coverKey(p.id, e)) } });
  revalidatePath("/", "layout");
  return {};
}

/** Chọn 1 ảnh có sẵn trong album làm ảnh đại diện (không cần upload lại). */
export async function setCoverFromMediaAction(mediaId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const m = await prisma.propertyMedia.findUnique({ where: { id: mediaId } });
  if (!m || m.mediaType !== "IMAGE" || !(await getManagedProperty(user.id, m.propertyId))) return { error: "Không có quyền" };
  await prisma.property.update({ where: { id: m.propertyId }, data: { coverImageUrl: m.url } });
  revalidatePath("/", "layout");
  return {};
}

export async function saveBrokerBioAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const bio = String(fd.get("brokerBio") ?? "").trim();
  if (bio.length > 500) return { error: "Giới thiệu tối đa 500 ký tự" };
  await prisma.user.update({ where: { id: user.id }, data: { brokerBio: bio || null } });
  revalidatePath("/account");
  return { message: "Đã lưu" };
}

/** Xác nhận logo đã tải lên R2; trả URL (có ?v=) để form Voucher Studio giữ trong ô ẩn, lưu thật khi bấm "Lưu thiết kế". */
export async function registerLogoAction(propertyId: string, contentType: string): Promise<{ error?: string; url?: string }> {
  const user = await requireUser();
  if (!r2Configured()) return { error: "Chưa cấu hình Cloudflare R2" };
  const e = ext(contentType);
  if (!e || !z.uuid().safeParse(propertyId).success) return { error: "Dữ liệu không hợp lệ" };
  const p = await getManagedProperty(user.id, propertyId);
  if (!p) return { error: "Không có quyền" };
  return { url: versioned(logoKey(p.id, e)) };
}
