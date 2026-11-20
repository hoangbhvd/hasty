"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { TierEnum } from "@/lib/validators";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { LinkError, respondRequest } from "@/lib/links";

async function ownedLink(linkId: string) {
  const user = await requireUser();
  const link = await prisma.hostBrokerLink.findFirst({ where: { id: linkId, hostId: user.id } });
  return link;
}

export async function setLinkStatusAction(linkId: string, status: "APPROVED" | "BLOCKED" | "PENDING"): Promise<{ error?: string }> {
  if (!["APPROVED", "BLOCKED", "PENDING"].includes(status)) return { error: "Trạng thái không hợp lệ" };
  if (!(await ownedLink(linkId))) return { error: "Không tìm thấy" };
  await prisma.hostBrokerLink.update({ where: { id: linkId }, data: { status } });
  revalidatePath("/host/partners");
  return {};
}

export async function setLinkTierAction(linkId: string, tier: string): Promise<{ error?: string }> {
  const t = TierEnum.safeParse(tier);
  if (!t.success) return { error: "Hạng không hợp lệ" };
  if (!(await ownedLink(linkId))) return { error: "Không tìm thấy" };
  await prisma.hostBrokerLink.update({ where: { id: linkId }, data: { tier: t.data } });
  revalidatePath("/host/partners");
  return {};
}

export async function approveRequestAction(linkId: string, tier: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const t = TierEnum.safeParse(tier);
  if (!t.success) return { error: "Hạng không hợp lệ" };
  try { await respondRequest(user.id, linkId, { decision: "APPROVE", tier: t.data }); } catch (e) { if (e instanceof LinkError) return { error: e.message }; throw e; }
  revalidatePath("/host/partners");
  return {};
}

export async function rejectRequestAction(linkId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try { await respondRequest(user.id, linkId, { decision: "REJECT" }); } catch (e) { if (e instanceof LinkError) return { error: e.message }; throw e; }
  revalidatePath("/host/partners");
  return {};
}

const AccessRoleEnum = z.enum(["BROKER", "CO_HOST", "CARETAKER"]);

/** Vai trò + đặt ngay + phạm vi căn của 1 đối tác. Co-host luôn được đặt ngay; ids rỗng/null = mọi căn. */
export async function setLinkAccessAction(linkId: string, input: { accessRole: string; allowInstantBook: boolean; assignedPropertyIds: string[] | null }): Promise<{ error?: string }> {
  const user = await requireUser();
  const role = AccessRoleEnum.safeParse(input.accessRole);
  if (!role.success) return { error: "Vai trò không hợp lệ" };
  const link = await prisma.hostBrokerLink.findFirst({ where: { id: linkId, hostId: user.id } });
  if (!link) return { error: "Không tìm thấy" };
  let ids: string[] | null = null;
  if (input.assignedPropertyIds && input.assignedPropertyIds.length > 0) {
    const own = await prisma.property.findMany({ where: { hostId: user.id, sourceType: "HOST_MANAGED", id: { in: input.assignedPropertyIds } }, select: { id: true } });
    if (own.length !== new Set(input.assignedPropertyIds).size) return { error: "Có căn không thuộc về bạn" };
    ids = own.map((p) => p.id);
  }
  await prisma.hostBrokerLink.update({
    where: { id: link.id },
    data: { accessRole: role.data, allowInstantBook: role.data === "CO_HOST" ? true : role.data === "CARETAKER" ? false : input.allowInstantBook, assignedPropertyIds: role.data === "BROKER" ? Prisma.DbNull : ids === null ? Prisma.DbNull : ids },
  });
  revalidatePath("/host/partners");
  return {};
}
