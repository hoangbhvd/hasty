import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PartnerRow } from "@/components/partner-row";
import { CopyButton } from "@/components/copy-button";
import { brokerTrust } from "@/lib/broker-trust";
import { BrokerTrustCard } from "@/components/broker-trust-card";
import { PendingActions } from "@/components/pending-request";

export default async function PartnersPage() {
  const user = await requireUser();
  const links = await prisma.hostBrokerLink.findMany({
    where: { hostId: user.id },
    include: { broker: { select: { fullName: true, phone: true, avatarUrl: true, brokerBio: true } } },
    orderBy: [{ status: "asc" }, { id: "asc" }],
  });
  const pending = links.filter((l) => l.status === "PENDING");
  const rest = links.filter((l) => l.status !== "PENDING");
  const trusts = await Promise.all(pending.map((l) => brokerTrust(l.brokerId)));
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
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Chờ duyệt ({pending.length})</h2>
          <ul className="space-y-3">
            {pending.map((l, i) => (
              <li key={l.id} className="space-y-3 rounded border border-black bg-white p-3 shadow-brutal-sm">
                <BrokerTrustCard name={l.broker.fullName} avatarUrl={l.broker.avatarUrl} phone={l.broker.phone} bio={l.broker.brokerBio} stats={trusts[i]} />
                {l.requestNote && <blockquote className="border-l-4 border-black bg-muted p-2 text-sm">“{l.requestNote}”</blockquote>}
                <PendingActions linkId={l.id} name={l.broker.fullName} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {rest.length === 0 && pending.length === 0 ? (
        <p className="text-muted-foreground">Chưa có CTV nào liên kết.</p>
      ) : rest.length === 0 ? null : (
        <ul className="divide-y divide-black rounded border border-black bg-white">
          {rest.map((l) => (
            <PartnerRow key={l.id} link={{ id: l.id, brokerId: l.brokerId, name: l.broker.fullName, phone: l.broker.phone, tier: l.tier, status: l.status }} />
          ))}
        </ul>
      )}
    </div>
  );
}
