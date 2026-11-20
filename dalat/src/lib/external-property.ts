import { z } from "zod";
import { prisma } from "@/lib/db";
import { occupyingWhere } from "@/lib/availability";
import { normalizePhone } from "@/lib/phone";
import { AreaEnum, optMoney, optPhone, optText, optUrl } from "@/lib/validators";

export class ExternalPropertyError extends Error {}

export const externalSchema = z.object({
  name: z.string().trim().min(2, "Nhập tên homestay").max(120),
  area: AreaEnum,
  externalHostName: optText,
  externalHostPhone: optPhone,
  baseWeekdayNet: optMoney,
  baseWeekendNet: optMoney,
  googleMapsUrl: optUrl,
  caretakerPhone: optPhone,
  checkinGuide: optText,
});

/** Đọc form (chỉ lấy giá trị chuỗi) và kiểm tra; ném ExternalPropertyError kèm thông báo đầu tiên nếu sai. */
export function parseExternalInput(raw: Record<string, unknown>) {
  const p = externalSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")));
  if (!p.success) throw new ExternalPropertyError(p.error.issues[0].message);
  return p.data;
}
export type ExternalInput = ReturnType<typeof parseExternalInput>;

const ph = (s?: string) => (s ? (normalizePhone(s) ?? s) : null);

/** Dữ liệu ghi xuống DB. Trường để trống sẽ xoá giá trị cũ (null) — người dùng chủ động xoá trong form. */
function toData(v: ExternalInput) {
  return {
    name: v.name,
    area: v.area,
    externalHostName: v.externalHostName ?? null,
    externalHostPhone: ph(v.externalHostPhone),
    baseWeekdayNet: v.baseWeekdayNet ?? null,
    baseWeekendNet: v.baseWeekendNet ?? null,
    googleMapsUrl: v.googleMapsUrl ?? null,
    caretakerPhone: ph(v.caretakerPhone),
    checkinGuide: v.checkinGuide ?? null,
  };
}

export async function createExternalProperty(brokerId: string, v: ExternalInput) {
  return prisma.property.create({
    data: {
      ...toData(v), sourceType: "BROKER_EXTERNAL", hostId: null, createdByBrokerId: brokerId,
      allowWholeUnit: true, allowIndividualRooms: false,
    },
  });
}

/** Chỉ CTV đã tạo mới sửa được, và chỉ với căn ngoài app (không bao giờ sửa được căn của Host). */
export async function updateExternalProperty(brokerId: string, propertyId: string, v: ExternalInput) {
  const owned = await prisma.property.findFirst({
    where: { id: propertyId, sourceType: "BROKER_EXTERNAL", createdByBrokerId: brokerId },
    select: { id: true },
  });
  if (!owned) throw new ExternalPropertyError("Không tìm thấy homestay");
  return prisma.property.update({ where: { id: propertyId }, data: toData(v) });
}

/** Booking còn hiệu lực trùng khoảng ngày (căn ngoài không bị chặn, chỉ cảnh báo để CTV tự cân nhắc). */
export async function findOverlappingBookings(propertyId: string, checkIn: Date, checkOut: Date, now = new Date()) {
  return prisma.booking.findMany({
    where: { propertyId, ...occupyingWhere(checkIn, checkOut, now) },
    orderBy: { checkIn: "asc" },
    select: { id: true, bookingCode: true, guestName: true, status: true, checkIn: true, checkOut: true },
  });
}
