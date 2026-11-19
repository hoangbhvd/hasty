"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { normalizePhone } from "@/lib/phone";
import { AreaEnum, optMoney, optPhone, optText, optUrl } from "@/lib/validators";
import type { FormState } from "@/app/(auth)/actions";

async function requireBroker() {
  const user = await requireUser();
  if (!user.isBroker) redirect("/host");
  return user;
}

const externalSchema = z.object({
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

export async function createExternalPropertyAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBroker();
  const p = externalSchema.safeParse(Object.fromEntries(Array.from(fd.entries()).filter(([, v]) => typeof v === "string")));
  if (!p.success) return { error: p.error.issues[0].message };
  const v = p.data;
  const ph = (s?: string) => (s ? (normalizePhone(s) ?? s) : null);
  await prisma.property.create({
    data: {
      sourceType: "BROKER_EXTERNAL",
      hostId: null,
      createdByBrokerId: user.id,
      name: v.name,
      area: v.area,
      externalHostName: v.externalHostName ?? null,
      externalHostPhone: ph(v.externalHostPhone),
      baseWeekdayNet: v.baseWeekdayNet ?? null,
      baseWeekendNet: v.baseWeekendNet ?? null,
      googleMapsUrl: v.googleMapsUrl ?? null,
      caretakerPhone: ph(v.caretakerPhone),
      checkinGuide: v.checkinGuide ?? null,
      allowWholeUnit: true,
      allowIndividualRooms: false,
    },
  });
  revalidatePath("/broker/properties");
  return {};
}

export async function deleteExternalPropertyAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireBroker();
  const p = await getManagedProperty(user.id, id);
  if (!p || p.sourceType !== "BROKER_EXTERNAL") return { error: "Không tìm thấy" };
  if ((await prisma.booking.count({ where: { propertyId: id } })) > 0) return { error: "Đã có booking, không thể xoá" };
  await prisma.property.delete({ where: { id } });
  redirect("/broker/properties");
}
