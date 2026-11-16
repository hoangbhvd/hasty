import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { MODE_LABEL, TYPE_LABEL } from "@/lib/property";
import { SubTabs } from "@/components/SubTabs";

export default async function OwnerPropertyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await withUser(uid, async (q) => {
    const [p] = await q<{ name: string; type: string; rental_mode: string; area: string | null; address: string | null }>(
      "select name,type,rental_mode,area,address from properties where id=$1 and owner_id=$2", [id, uid]);
    if (!p) return null;
    const [c] = await q<{ links: number; bookings: number }>(
      `select (select count(*)::int from broker_links where property_id=$1 and status='pending') links,
              (select count(*)::int from bookings b join units u on u.id=b.unit_id where u.property_id=$1 and b.status in ('holding','deposit_reported')) bookings`, [id]);
    return { p, c };
  });
  if (!d) notFound();
  const { p, c } = d;
  const b = `/owner/${id}`;
  return (
    <div className="space-y-5">
      <div>
        <Link href="/owner" className="text-sm text-teal-700 underline">← Tất cả cơ sở</Link>
        <h1 className="mt-1 text-xl font-bold">{p.name}</h1>
        <p className="text-sm text-slate-600">{TYPE_LABEL[p.type]} · {MODE_LABEL[p.rental_mode]}{p.area ? ` · ${p.area}` : ""}{p.address ? ` · ${p.address}` : ""}</p>
      </div>
      <SubTabs tabs={[
        { href: b, label: "Tổng quan", exact: true, badge: c.bookings },
        { href: `${b}/calendar`, label: "Lịch" },
        { href: `${b}/rooms`, label: p.rental_mode === "whole" ? "Căn" : "Phòng" },
        { href: `${b}/pricing`, label: "Giá & luật" },
        { href: `${b}/brokers`, label: "Broker", badge: c.links },
        { href: `${b}/photos`, label: "Ảnh" },
        { href: `${b}/info`, label: "Thông tin" },
      ]} />
      {children}
    </div>
  );
}
