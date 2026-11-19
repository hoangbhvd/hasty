import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ActionButton } from "@/components/action-button";
import { LINK_STATUS_LABEL } from "@/lib/labels";
import { requestLinkAction } from "./actions";

export default async function InvitePage({ params }: { params: Promise<{ hostId: string }> }) {
  const { hostId } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(hostId)) notFound();
  const host = await prisma.user.findFirst({ where: { id: hostId, isHost: true }, select: { id: true, fullName: true } });
  if (!host) notFound();
  const link = await prisma.hostBrokerLink.findUnique({ where: { hostId_brokerId: { hostId, brokerId: user.id } } });

  return (
    <div className="mx-auto max-w-md space-y-4 rounded border border-black bg-white shadow-brutal-sm md:brutal-card p-5">
      <h1 className="text-xl font-semibold">Lời mời làm CTV</h1>
      <p><strong>{host.fullName}</strong> mời bạn làm cộng tác viên bán phòng.</p>
      {host.id === user.id ? (
        <p className="text-sm text-muted-foreground">Đây là link mời của chính bạn.</p>
      ) : link ? (
        <p role="status">Trạng thái: <strong>{LINK_STATUS_LABEL[link.status]}</strong></p>
      ) : (
        <ActionButton action={requestLinkAction.bind(null, host.id)} className="h-11 bg-primary">
          Gửi yêu cầu liên kết
        </ActionButton>
      )}
    </div>
  );
}
