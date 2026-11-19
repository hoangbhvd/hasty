import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PartnerRow } from "@/components/partner-row";
import { CopyButton } from "@/components/copy-button";

export default async function PartnersPage() {
  const user = await requireUser();
  const links = await prisma.hostBrokerLink.findMany({
    where: { hostId: user.id },
    include: { broker: { select: { fullName: true, phone: true } } },
    orderBy: [{ status: "asc" }, { id: "asc" }],
  });
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const inviteUrl = `${base}/invite/${user.id}`;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Đối tác CTV</h1>
      <section className="space-y-2 rounded border border-black bg-white shadow-brutal-sm md:brutal-card p-4">
        <h2 className="font-medium">Link mời CTV</h2>
        <p className="text-sm text-muted-foreground">Gửi link này cho CTV. Họ gửi yêu cầu, bạn duyệt và phân hạng bên dưới.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={inviteUrl} aria-label="Link mời" className="brutal-input h-10 min-w-0 flex-1 bg-muted px-2 text-sm" />
          <CopyButton text={inviteUrl} />
        </div>
      </section>
      {links.length === 0 ? (
        <p className="text-muted-foreground">Chưa có CTV nào liên kết.</p>
      ) : (
        <ul className="divide-y divide-black rounded border border-black bg-white">
          {links.map((l) => (
            <PartnerRow key={l.id} link={{ id: l.id, brokerId: l.brokerId, name: l.broker.fullName, phone: l.broker.phone, tier: l.tier, status: l.status }} />
          ))}
        </ul>
      )}
    </div>
  );
}
