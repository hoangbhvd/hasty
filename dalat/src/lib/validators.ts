import { z } from "zod";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optMoney = z.preprocess(emptyToUndef, z.coerce.number().int().min(0).max(1_000_000_000).optional());
export const optText = z.preprocess(emptyToUndef, z.string().trim().max(2000).optional());
export const optUrl = z.preprocess(emptyToUndef, z.url("Link không hợp lệ").max(500).optional());
export const optPhone = z.preprocess(emptyToUndef, z.string().trim().regex(/^[0-9+\s.\-]{8,15}$/, "SĐT không hợp lệ").optional());

export const AreaEnum = z.enum(["TRUNG_TAM", "TUYEN_LAM", "TRAI_MAT", "TA_NUNG", "DA_PHU", "PHUONG_11", "KHAC"]);
export const RoadEnum = z.enum(["MOTORBIKE", "CAR_7", "CAR_16", "BUS_29"]);
export const SlopeEnum = z.enum(["FLAT", "MILD_SLOPE", "STEEP"]);
export const TierEnum = z.enum(["STANDARD", "VIP", "AGENCY"]);

export const propertySchema = z
  .object({
    name: z.string().trim().min(2, "Nhập tên căn").max(120),
    description: optText,
    area: AreaEnum,
    distanceToMarketKm: z.preprocess(emptyToUndef, z.coerce.number().min(0).max(100).optional()),
    roadAccess: RoadEnum,
    slopeLevel: SlopeEnum,
    address: optText,
    googleMapsUrl: optUrl,
    checkinGuide: optText,
    caretakerPhone: optPhone,
    houseRules: optText,
    allowWholeUnit: z.boolean(),
    allowIndividualRooms: z.boolean(),
    baseWeekdayNet: optMoney,
    baseWeekendNet: optMoney,
    isPublicDirectory: z.boolean(),
    publicPriceRange: z.preprocess(emptyToUndef, z.string().trim().max(60).optional()),
  })
  .refine((v) => v.allowWholeUnit || v.allowIndividualRooms, {
    message: "Chọn ít nhất một hình thức: nguyên căn hoặc phòng lẻ",
    path: ["allowWholeUnit"],
  });

export function propertyFromForm(fd: FormData) {
  const get = (k: string) => fd.get(k) ?? "";
  return propertySchema.safeParse({
    name: get("name"),
    description: get("description"),
    area: get("area"),
    distanceToMarketKm: get("distanceToMarketKm"),
    roadAccess: get("roadAccess"),
    slopeLevel: get("slopeLevel"),
    address: get("address"),
    googleMapsUrl: get("googleMapsUrl"),
    checkinGuide: get("checkinGuide"),
    caretakerPhone: get("caretakerPhone"),
    houseRules: get("houseRules"),
    allowWholeUnit: fd.get("allowWholeUnit") === "on",
    allowIndividualRooms: fd.get("allowIndividualRooms") === "on",
    baseWeekdayNet: get("baseWeekdayNet"),
    baseWeekendNet: get("baseWeekendNet"),
    isPublicDirectory: fd.get("isPublicDirectory") === "on",
    publicPriceRange: get("publicPriceRange"),
  });
}

export function amenitiesFromForm(fd: FormData) {
  return {
    bbQ: fd.get("bbQ") === "on",
    ac: fd.get("ac") === "on",
    pet_friendly: fd.get("pet_friendly") === "on",
    karaoke: fd.get("karaoke") === "on",
    views: fd.getAll("views").map(String).slice(0, 10),
  };
}

export const roomSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên phòng").max(80),
  maxGuests: z.coerce.number().int().min(1).max(50),
  baseWeekdayNet: optMoney,
  baseWeekendNet: optMoney,
});
