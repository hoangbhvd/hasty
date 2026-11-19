"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { TierEnum } from "@/lib/validators";

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
