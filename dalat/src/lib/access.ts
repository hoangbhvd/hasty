import "server-only";
import { prisma } from "@/lib/db";

/** Property mà user là chủ (Host) hoặc là Broker đã tạo (BROKER_EXTERNAL). */
export async function getManagedProperty(userId: string, propertyId: string) {
  return prisma.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { sourceType: "HOST_MANAGED", hostId: userId },
        { sourceType: "BROKER_EXTERNAL", createdByBrokerId: userId },
      ],
    },
  });
}

/** Property chỉ Host sở hữu (dùng cho Host Mode). */
export async function getHostProperty(userId: string, propertyId: string) {
  return prisma.property.findFirst({
    where: { id: propertyId, sourceType: "HOST_MANAGED", hostId: userId },
  });
}

/** Broker được xem: căn ngoài do mình tạo, hoặc căn của Host đã APPROVED liên kết với mình. */
export async function getBrokerVisibleProperty(brokerId: string, propertyId: string) {
  return prisma.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { sourceType: "BROKER_EXTERNAL", createdByBrokerId: brokerId },
        {
          sourceType: "HOST_MANAGED",
          host: { hostLinks: { some: { brokerId, status: "APPROVED", accessRole: { not: "CARETAKER" } } } },
        },
      ],
    },
  });
}

/** Quyền xem media: Host chủ, Broker tạo, hoặc Broker liên kết đã duyệt. */
export async function canViewProperty(userId: string, propertyId: string) {
  return (
    (await getManagedProperty(userId, propertyId)) ?? (await getBrokerVisibleProperty(userId, propertyId))
  );
}
