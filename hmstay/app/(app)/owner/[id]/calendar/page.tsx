import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { parseMonth } from "@/lib/calendar";
import { CalBlock, CalendarGrid, CalendarNav, Legend } from "@/components/CalendarGrid";

type Row = { unit_id: string; check_in: string; check_out: string; status: string; guest_name: string; broker_name: string | null };

export default async function OwnerCalendar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { m: mq } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const m = parseMonth(mq);

  const data = await withUser(uid, async (q) => {
    const [p] = await q<{ name: string }>("select name from properties where id=$1 and owner_id=$2", [id, uid]);
    if (!p) return null;
    const units = await q<{ id: string; name: string }>("select id,name from units where property_id=$1 and active order by created_at", [id]);
    const rows = await q<Row>(
      `select b.unit_id, b.check_in, b.check_out, b.status, b.guest_name, pr.full_name broker_name
       from bookings b join units u on u.id=b.unit_id left join profiles pr on pr.id=b.broker_id
       where u.property_id=$1 and b.status in ('holding','deposit_reported','confirmed')
         and b.check_in < $3 and b.check_out > $2`, [id, m.start, m.endExclusive]);
    return { p, units, rows };
  });
  if (!data) notFound();

  const blocks: CalBlock[] = data.rows.map((r) => {
    const own = !r.broker_name;
    const tone = r.status === "holding" ? "holding" : r.status === "deposit_reported" ? "deposit" : own ? "block" : "confirmed";
    return {
      unit_id: r.unit_id, check_in: r.check_in, check_out: r.check_out, tone,
      label: r.guest_name,
      title: `${r.guest_name} · ${r.check_in} → ${r.check_out}${r.broker_name ? ` · Broker: ${r.broker_name}` : " · Chủ tự nhập"}`,
    };
  });

  const base = `/owner/${id}/calendar`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Lịch phòng</h2>
        <CalendarNav base={base} m={m} />
      </div>
      <Legend items={[["confirmed", "Đã chốt"], ["deposit", "Đã báo cọc, chờ chốt"], ["holding", "Đang giữ chỗ"], ["block", "Chủ khoá / khách trực tiếp"]]} />
      {data.units.length === 0 ? <p className="text-sm text-slate-500">Cơ sở chưa có phòng.</p> : <CalendarGrid units={data.units} m={m} blocks={blocks} />}
      <p className="text-xs text-slate-500">Mỗi ô là một đêm. Ô cuối của booking là đêm trước ngày trả phòng. Rê chuột vào thanh màu để xem chi tiết.</p>
    </div>
  );
}
