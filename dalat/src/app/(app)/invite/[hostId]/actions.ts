"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function requestLinkAction(hostId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!user.isBroker) return { error: "Tài khoản chưa bật chế độ CTV" };
  if (user.id === hostId) return { error: "Không thể tự liên kết với chính mình" };
  const host = await prisma.user.findFirst({ where: { id: hostId, isHost: true }, select: { id: true } });
  if (!host) return { error: "Không tìm thấy chủ nhà" };
  // Không ghi đè nếu đã có (kể cả BLOCKED: Broker không tự gỡ chặn)
  await prisma.hostBrokerLink.upsert({
    where: { hostId_brokerId: { hostId, brokerId: user.id } },
    create: { hostId, brokerId: user.id },
    update: {},
  });
  revalidatePath(`/invite/${hostId}`);
  return {};
}
