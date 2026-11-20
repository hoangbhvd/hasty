"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getHostProperty } from "@/lib/access";
import { normalizePhone } from "@/lib/phone";
import { amenitiesFromForm, propertyFromForm, roomSchema, TierEnum, optMoney } from "@/lib/validators";
import { parseDateOnly } from "@/lib/format";
import type { FormState } from "@/app/(auth)/actions";

async function requireHost() {
  const user = await requireUser();
  if (!user.isHost) redirect("/broker");
  return user;
}

const phoneOrUndef = (p?: string) => (p ? (normalizePhone(p) ?? p) : null);

function propertyData(fd: FormData) {
  const parsed = propertyFromForm(fd);
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;
  return {
    data: {
      name: v.name,
      description: v.description ?? null,
      area: v.area,
      distanceToMarketKm: v.distanceToMarketKm ?? null,
      roadAccess: v.roadAccess,
      slopeLevel: v.slopeLevel,
      amenities: amenitiesFromForm(fd),
      address: v.address ?? null,
      googleMapsUrl: v.googleMapsUrl ?? null,
      checkinGuide: v.checkinGuide ?? null,
      caretakerPhone: phoneOrUndef(v.caretakerPhone),
      houseRules: v.houseRules ?? null,
      allowWholeUnit: v.allowWholeUnit,
      allowIndividualRooms: v.allowIndividualRooms,
      baseWeekdayNet: v.baseWeekdayNet ?? null,
      baseWeekendNet: v.baseWeekendNet ?? null,
    },
  } as const;
}

export async function createPropertyAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHost();
  const r = propertyData(fd);
  if ("error" in r) return { error: r.error };
  const p = await prisma.property.create({
    data: { ...r.data, sourceType: "HOST_MANAGED", hostId: user.id },
  });
  redirect(`/host/properties/${p.id}`);
}

export async function updatePropertyAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHost();
  if (!(await getHostProperty(user.id, id))) return { error: "Không tìm thấy căn" };
  const r = propertyData(fd);
  if ("error" in r) return { error: r.error };
  await prisma.property.update({ where: { id }, data: r.data });
  revalidatePath(`/host/properties/${id}`);
  revalidatePath("/host/properties");
  return {};
}

export async function deletePropertyAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireHost();
  if (!(await getHostProperty(user.id, id))) return { error: "Không tìm thấy căn" };
  const bookings = await prisma.booking.count({ where: { propertyId: id } });
  if (bookings > 0) return { error: "Căn đã có booking, không thể xoá" };
  await prisma.property.delete({ where: { id } });
  redirect("/host/properties");
}

// ───────── Rooms ─────────
function roomData(fd: FormData) {
  const p = roomSchema.safeParse({
    name: fd.get("name") ?? "",
    maxGuests: fd.get("maxGuests") ?? "",
    baseWeekdayNet: fd.get("baseWeekdayNet") ?? "",
    baseWeekendNet: fd.get("baseWeekendNet") ?? "",
  });
  return p;
}

export async function addRoomAction(propertyId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHost();
  if (!(await getHostProperty(user.id, propertyId))) return { error: "Không tìm thấy căn" };
  const p = roomData(fd);
  if (!p.success) return { error: p.error.issues[0].message };
  await prisma.room.create({
    data: {
      propertyId,
      name: p.data.name,
      maxGuests: p.data.maxGuests,
      baseWeekdayNet: p.data.baseWeekdayNet ?? null,
      baseWeekendNet: p.data.baseWeekendNet ?? null,
    },
  });
  revalidatePath(`/host/properties/${propertyId}`);
  return {};
}

async function ownedRoom(userId: string, roomId: string) {
  return prisma.room.findFirst({ where: { id: roomId, property: { sourceType: "HOST_MANAGED", hostId: userId } } });
}

export async function updateRoomAction(roomId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHost();
  const room = await ownedRoom(user.id, roomId);
  if (!room) return { error: "Không tìm thấy phòng" };
  const p = roomData(fd);
  if (!p.success) return { error: p.error.issues[0].message };
  await prisma.room.update({
    where: { id: roomId },
    data: {
      name: p.data.name,
      maxGuests: p.data.maxGuests,
      baseWeekdayNet: p.data.baseWeekdayNet ?? null,
      baseWeekendNet: p.data.baseWeekendNet ?? null,
    },
  });
  revalidatePath(`/host/properties/${room.propertyId}`);
  return {};
}

export async function deleteRoomAction(roomId: string): Promise<{ error?: string } | void> {
  const user = await requireHost();
  const room = await ownedRoom(user.id, roomId);
  if (!room) return { error: "Không tìm thấy phòng" };
  if ((await prisma.bookingRoom.count({ where: { roomId } })) > 0) return { error: "Phòng đã có booking, không thể xoá" };
  await prisma.room.delete({ where: { id: roomId } });
  revalidatePath(`/host/properties/${room.propertyId}`);
}

// ───────── Special prices (ngày lễ / giá riêng) ─────────
const MAX_RANGE_DAYS = 400;

export async function addSpecialPriceAction(propertyId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireHost();
  if (!(await getHostProperty(user.id, propertyId))) return { error: "Không tìm thấy căn" };

  const from = parseDateOnly(String(fd.get("from") ?? ""));
  const to = parseDateOnly(String(fd.get("to") || fd.get("from") || ""));
  if (!from || !to) return { error: "Chọn ngày hợp lệ" };
  if (to < from) return { error: "Ngày kết thúc phải sau ngày bắt đầu" };
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) return { error: `Tối đa ${MAX_RANGE_DAYS} ngày mỗi lần` };

  const price = optMoney.safeParse(fd.get("netPrice") ?? "");
  if (!price.success || price.data === undefined) return { error: "Nhập giá Net hợp lệ" };

  const roomRaw = String(fd.get("roomId") ?? "");
  let roomId: string | null = null;
  if (roomRaw) {
    const room = await prisma.room.findFirst({ where: { id: roomRaw, propertyId } });
    if (!room) return { error: "Phòng không thuộc căn này" };
    roomId = room.id;
  }
  const tierRaw = String(fd.get("brokerTier") ?? "");
  const tier = tierRaw ? TierEnum.safeParse(tierRaw) : null;
  if (tier && !tier.success) return { error: "Hạng đối tác không hợp lệ" };
  const brokerTier = tier?.data ?? null;

  const dates = Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * 86_400_000));
  await prisma.$transaction([
    // Ghi đè giá cũ cùng phạm vi (căn/phòng/hạng/ngày)
    prisma.specialPrice.deleteMany({ where: { propertyId, roomId, brokerTier, date: { gte: from, lte: to } } }),
    prisma.specialPrice.createMany({
      data: dates.map((date) => ({ propertyId, roomId, brokerTier, date, netPrice: price.data! })),
    }),
  ]);
  revalidatePath(`/host/properties/${propertyId}`);
  return {};
}

export async function deleteSpecialPriceAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireHost();
  const sp = await prisma.specialPrice.findFirst({
    where: { id, property: { sourceType: "HOST_MANAGED", hostId: user.id } },
  });
  if (!sp) return { error: "Không tìm thấy" };
  await prisma.specialPrice.delete({ where: { id } });
  revalidatePath(`/host/properties/${sp.propertyId}`);
}
