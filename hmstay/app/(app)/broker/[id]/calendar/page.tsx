import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { parseMonth } from "@/lib/calendar";
import { CalBlock, CalendarGrid, CalendarNav, Legend } from "@/components/CalendarGrid";

export default async function BrokerCalendar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { m: mq } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const m = parseMonth(mq);

  const data = await withUser(uid, async (q) => {
    // Chỉ broker đã được duyệt
    const [p] = await q<{ name: string }>(
      `select p.name from properties p join broker_links l on l.property_id=p.id and l.broker_id=$2 and l.status='active' where p.id=$1`, [id, uid]);
    if (!p) return null;
    const units = await q<{ id: string; name: string }>("select id,name from units where property_id=$1 and active order by created_at", [id]);
    const blocks: CalBlock[] = [];
    for (const u of units) {
      // Chỉ lộ khoảng ngày bận, không lộ tên khách / broker khác
      const busy = await q<{ check_in: string; check_out: string }>("select * from unit_busy_ranges($1,$2,$3)", [u.id, m.start, m.endExclusive]);
      for (const b of busy) blocks.push({ unit_id: u.id, check_in: b.check_in, check_out: b.check_out, tone: "busy", label: "Bận", title: `Bận ${b.check_in} → ${b.check_out}` });
    }
    return { p, units, blocks };
  });
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Lịch trống: {data.p.name}</h1>
          <Link href={`/broker/${id}`} className="text-sm text-teal-700 underline">← Kiểm tra phòng & báo giá</Link>
        </div>
        <CalendarNav base={`/broker/${id}/calendar`} m={m} />
      </div>
      <Legend items={[["busy", "Đã có người giữ / chốt"]]} />
      <CalendarGrid units={data.units} m={m} blocks={data.blocks} />
      <p className="text-xs text-slate-500">Ô trống là còn phòng. Báo giá chỉ giữ chỗ khi bạn bấm &ldquo;Báo chủ chốt&rdquo;.</p>
    </div>
  );
}
