import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AddExternalButton } from "@/components/add-external-button";
import { AREA_LABEL } from "@/lib/labels";
import { formatVnd } from "@/lib/format";

export default async function BrokerPropertiesPage() {
  const user = await requireUser();
  const [mine, linked] = await Promise.all([
    prisma.property.findMany({
      where: { sourceType: "BROKER_EXTERNAL", createdByBrokerId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.property.findMany({
      where: { sourceType: "HOST_MANAGED", host: { hostLinks: { some: { brokerId: user.id, status: "APPROVED" } } } },
      orderBy: { name: "asc" },
      include: { host: { select: { fullName: true } } },
    }),
  ]);

  const Card = ({ p, sub }: { p: (typeof mine)[number]; sub: string }) => (
    <li>
      <Link href={`/broker/properties/${p.id}`} className="block space-y-1 rounded border border-black bg-white shadow-brutal-sm md:brutal-card p-4 hover:bg-muted">
        <div className="font-medium">{p.name}</div>
        <div className="text-sm text-muted-foreground">{AREA_LABEL[p.area]} · {sub}</div>
        <div className="money-num text-sm">Net: {formatVnd(p.baseWeekdayNet)} / {formatVnd(p.baseWeekendNet)}</div>
      </Link>
    </li>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Homestay</h1>
        <AddExternalButton />
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Của tôi (ngoài hệ thống)</h2>
        {mine.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có homestay ngoài nào.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((p) => <Card key={p.id} p={p} sub={p.externalHostName ?? "Chủ nhà chưa ghi"} />)}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Từ chủ nhà đã liên kết</h2>
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có chủ nhà nào duyệt bạn. Mở link mời của chủ nhà để gửi yêu cầu liên kết.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {linked.map((p) => <Card key={p.id} p={p} sub={p.host?.fullName ?? ""} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
