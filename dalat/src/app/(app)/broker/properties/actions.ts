"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { ExternalPropertyError, createExternalProperty, parseExternalInput, updateExternalProperty } from "@/lib/external-property";
import type { FormState } from "@/app/(auth)/actions";

async function requireBroker() {
  const user = await requireUser();
  if (!user.isBroker) redirect("/host");
  return user;
}

export async function createExternalPropertyAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBroker();
  try {
    await createExternalProperty(user.id, parseExternalInput(Object.fromEntries(fd.entries())));
  } catch (e) {
    if (e instanceof ExternalPropertyError) return { error: e.message };
    throw e;
  }
  revalidatePath("/broker/properties");
  return {};
}

export async function updateExternalPropertyAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBroker();
  if (!z.uuid().safeParse(id).success) return { error: "Không hợp lệ" };
  try {
    await updateExternalProperty(user.id, id, parseExternalInput(Object.fromEntries(fd.entries())));
  } catch (e) {
    if (e instanceof ExternalPropertyError) return { error: e.message };
    throw e;
  }
  revalidatePath("/broker/properties");
  revalidatePath(`/broker/properties/${id}`);
  return { message: "Đã lưu thay đổi" };
}

export async function deleteExternalPropertyAction(id: string): Promise<{ error?: string } | void> {
  const user = await requireBroker();
  const p = await getManagedProperty(user.id, id);
  if (!p || p.sourceType !== "BROKER_EXTERNAL") return { error: "Không tìm thấy" };
  if ((await prisma.booking.count({ where: { propertyId: id } })) > 0) return { error: "Đã có booking, không thể xoá" };
  await prisma.property.delete({ where: { id } });
  redirect("/broker/properties");
}
