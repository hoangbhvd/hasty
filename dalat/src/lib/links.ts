// Luồng xin cộng tác 2 chiều (spec 9.3).
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/notify";

export class LinkError extends Error {}
type Tier = "STANDARD" | "VIP" | "AGENCY";

export async function requestCollab(brokerId: string, hostId: string, note?: string) {
  if (brokerId === hostId) throw new LinkError("Không thể tự liên kết với chính mình");
  const [broker, host] = await Promise.all([
    prisma.user.findUnique({ where: { id: brokerId }, select: { isBroker: true, fullName: true } }),
    prisma.user.findFirst({ where: { id: hostId, isHost: true }, select: { id: true } }),
  ]);
  if (!broker?.isBroker) throw new LinkError("Tài khoản chưa bật chế độ CTV");
  if (!host) throw new LinkError("Không tìm thấy chủ nhà");
  const text = note?.trim().slice(0, 500) || null;
  const existing = await prisma.hostBrokerLink.findUnique({ where: { hostId_brokerId: { hostId, brokerId } } });
  if (existing) {
    // Đã duyệt / đang chờ / bị chặn thì giữ nguyên; chỉ cho xin lại sau khi bị từ chối
    if (existing.status !== "REJECTED") return existing;
    const l = await prisma.hostBrokerLink.update({ where: { id: existing.id }, data: { status: "PENDING", requestNote: text, respondedAt: null } });
    await notifyUsers([hostId], `CTV ${broker.fullName} xin cộng tác lại`, "/host/partners");
    return l;
  }
  const l = await prisma.hostBrokerLink.create({ data: { hostId, brokerId, requestNote: text } });
  await notifyUsers([hostId], `CTV ${broker.fullName} xin cộng tác`, "/host/partners");
  return l;
}

/** CTV huỷ yêu cầu đang chờ duyệt. */
export async function cancelRequest(brokerId: string, hostId: string) {
  const r = await prisma.hostBrokerLink.deleteMany({ where: { hostId, brokerId, status: "PENDING" } });
  if (r.count === 0) throw new LinkError("Không có yêu cầu nào đang chờ");
}

export async function respondRequest(hostId: string, linkId: string, d: { decision: "APPROVE"; tier: Tier } | { decision: "REJECT" }) {
  const link = await prisma.hostBrokerLink.findFirst({ where: { id: linkId, hostId }, include: { host: { select: { fullName: true } } } });
  if (!link) throw new LinkError("Không tìm thấy yêu cầu");
  if (link.status !== "PENDING") throw new LinkError("Yêu cầu này đã được xử lý");
  const approve = d.decision === "APPROVE";
  await prisma.hostBrokerLink.update({
    where: { id: linkId },
    data: { status: approve ? "APPROVED" : "REJECTED", respondedAt: new Date(), ...(approve ? { tier: d.tier } : {}) },
  });
  await notifyUsers([link.brokerId], approve ? `${link.host.fullName} đã duyệt bạn cộng tác` : `${link.host.fullName} từ chối yêu cầu cộng tác`, approve ? "/broker/properties" : "/broker/discover");
}
