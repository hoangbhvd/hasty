import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getBrokerVisibleProperty } from "@/lib/access";
import { BookingPlanner } from "@/components/booking-planner";

export default async function BrokerBookPage({
  params, searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; type?: string; rooms?: string | string[] }>;
}) {
  const { propertyId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(propertyId) || !(await getBrokerVisibleProperty(user.id, propertyId))) notFound();
  const p = await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { id: true, name: true } });

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/broker/search" className="text-sm text-muted-foreground">← Tìm phòng</Link>
      <h1 className="text-2xl font-semibold">Đặt {p.name}</h1>
      <BookingPlanner
        as="BROKER" userId={user.id} basePath={`/broker/book/${propertyId}`} properties={[p]}
        params={{ propertyId, ...sp, rooms: sp.rooms === undefined ? undefined : Array.isArray(sp.rooms) ? sp.rooms : [sp.rooms] }}
      />
    </div>
  );
}
