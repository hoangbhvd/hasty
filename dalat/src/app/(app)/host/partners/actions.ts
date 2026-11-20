"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { TierEnum } from "@/lib/validators";
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
