"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { ALLOWED_TYPES, deleteObject, keyFromUrl, keyPrefix, publicUrlFor, r2Configured } from "@/lib/r2";

/** Ghi nhận file đã upload thẳng lên R2 (presigned) vào DB. */
export async function registerMediaAction(input: {
  propertyId: string;
  roomId?: string | null;
  key: string;
  contentType: string;
}): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!r2Configured()) return { error: "Chưa cấu hình Cloudflare R2" };
  const property = await getManagedProperty(user.id, input.propertyId);
  if (!property) return { error: "Không có quyền" };
  const type = ALLOWED_TYPES[input.contentType];
  if (!type) return { error: "Định dạng không được hỗ trợ" };
  if (!input.key.startsWith(keyPrefix(property.id)) || input.key.includes("..")) return { error: "Khoá file không hợp lệ" };

  let roomId: string | null = null;
  if (input.roomId) {
    const room = await prisma.room.findFirst({ where: { id: input.roomId, propertyId: property.id } });
    if (!room) return { error: "Phòng không hợp lệ" };
    roomId = room.id;
  }
  const last = await prisma.propertyMedia.aggregate({ where: { propertyId: property.id }, _max: { sortOrder: true } });
  await prisma.propertyMedia.create({
    data: {
      propertyId: property.id,
      roomId,
      url: publicUrlFor(input.key),
      mediaType: type.media,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath(`/host/properties/${property.id}`);
  revalidatePath(`/broker/properties/${property.id}`);
  return {};
}

export async function deleteMediaAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const media = await prisma.propertyMedia.findUnique({ where: { id } });
  if (!media || !(await getManagedProperty(user.id, media.propertyId))) return { error: "Không có quyền" };
  await prisma.propertyMedia.delete({ where: { id } });
  const key = keyFromUrl(media.url);
  if (key && r2Configured()) await deleteObject(key).catch(() => {});
  revalidatePath(`/host/properties/${media.propertyId}`);
  revalidatePath(`/broker/properties/${media.propertyId}`);
}
