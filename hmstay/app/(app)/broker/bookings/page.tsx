import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { dmy, nightsBetween, vnd } from "@/lib/format";
import { parseMonth } from "@/lib/calendar";
import { BROKER_TONES, BrokerGrid, GridItem, GridProp } from "@/components/BrokerGrid";
import { CalendarNav, Legend } from "@/components/CalendarGrid";
import { BOOKING_SQL, BookingList, BookingRow } from "@/components/BookingList";
import { ErrorBanner } from "@/components/ErrorBanner";

const FILTERS: [string, string, string][] = [
  ["", "Tất cả", ""],
  ["open", "Đang xử lý", "and b.status in ('quoted','holding','deposit_reported')"],
  ["confirmed", "Đã chốt", "and b.status='confirmed'"],
  ["closed", "Đã huỷ / hết hạn", "and b.status in ('cancelled','expired')"],
];

type MonthRow = {
  prop_id: string; prop_name: string; own: boolean; check_in: string; check_out: string; guest_name: string; guest_phone: string | null;
  rooms: string | null; total: number; deposit: number; tone: GridItem["tone"];
};

export default async function BrokerBookings({ searchParams }: { searchParams: Promise<{ e?: string; s?: string; m?: string }> }) {
  const uid = await requireUser();
  const { e, s = "", m: mq } = await searchParams;
  const m = parseMonth(mq);
  const { myProps, month } = await withUser(uid, async (q) => {
    const myProps = await q<GridProp>("select id, name from broker_properties order by name");
    const month = await q<MonthRow>(
      `select p.id prop_id, p.name prop_name, true own, b.check_in, b.check_out, b.guest_name, b.guest_phone, b.rooms, b.total, b.deposit, 'own' tone
         from broker_bookings b join broker_properties p on p.id=b.property_id
        where b.status='active' and b.check_in < $2 and b.check_out > $1
       union all
       select p.id, p.name, false, b.check_in, b.check_out, b.guest_name, b.guest_phone, u.name, b.sell_total, b.deposit_amount,
              case b.status when 'confirmed' then 'confirmed' when 'deposit_reported' then 'deposit' else 'holding' end
         from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id
        where b.broker_id=$3 and b.status in ('holding','deposit_reported','confirmed') and b.check_in < $2 and b.check_out > $1
       order by prop_name, check_in, check_out`, [m.start, m.endExclusive, uid]);
    return { myProps, month };
  });
  const gridProps: GridProp[] = [...myProps];
  for (const r of month) if (!gridProps.some((p) => p.id === r.prop_id)) gridProps.push({ id: r.prop_id, name: r.prop_name });
  gridProps.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const items: GridItem[] = month.map((r) => ({
    prop_id: r.prop_id, check_in: r.check_in, check_out: r.check_out, tone: r.tone,
    label: [r.guest_name, r.guest_phone, r.rooms].filter(Boolean).join("\n"),
    title: `${r.guest_name}${r.guest_phone ? ` (${r.guest_phone})` : ""} · ${r.check_in} → ${r.check_out} · Còn lại ${vnd(r.total - r.deposit)}`,
  }));
  const sum = month.reduce((t, r) => ({ total: t.total + r.total, deposit: t.deposit + r.deposit }), { total: 0, deposit: 0 });
  const f = FILTERS.find((x) => x[0] === s) ?? FILTERS[0];
  const rows = await withUser(uid, (q) => q<BookingRow>(`${BOOKING_SQL} where b.broker_id=$1 ${f[2]} order by b.created_at desc limit 200`, [uid]));
  const done = rows.filter((r) => r.status === "confirmed");
  return (
    <div className="space-y-4">
      <ErrorBanner e={e} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Booking của tôi</h1>
        <CalendarNav base="/broker/bookings" m={m} />
      </div>
      <Legend items={BROKER_TONES} />
      {gridProps.length === 0
        ? <p className="text-sm text-slate-500">Chưa có cơ sở nào. Thêm ở tab “Cơ sở tự quản” hoặc xin hợp tác với cơ sở của chủ.</p>
        : <BrokerGrid props={gridProps} m={m} items={items} />}
      {month.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Booking trong {m.label.toLowerCase()}</h2>
          <p className="text-sm text-slate-600">Tổng tiền: <b>{vnd(sum.total)}</b> · Đã cọc: <b>{vnd(sum.deposit)}</b> · Còn lại: <b className="text-emerald-700">{vnd(sum.total - sum.deposit)}</b></p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>{["Cơ sở", "Phòng", "Check-in", "Check-out", "Khách", "SĐT", "Tổng", "Đã cọc", "Còn lại"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {month.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{r.own ? <Link className="text-teal-700 underline" href={`/broker/mine/${r.prop_id}`}>{r.prop_name}</Link> : r.prop_name}</td>
                    <td className="px-2 py-1.5">{r.rooms ?? ""}</td>
                    <td className="px-2 py-1.5">{dmy(r.check_in)}</td>
                    <td className="px-2 py-1.5">{dmy(r.check_out)} <span className="text-xs text-slate-400">({nightsBetween(r.check_in, r.check_out)} đêm)</span></td>
                    <td className="px-2 py-1.5">{r.guest_name}</td>
                    <td className="px-2 py-1.5">{r.guest_phone}</td>
                    <td className="px-2 py-1.5">{vnd(r.total)}</td>
                    <td className="px-2 py-1.5">{vnd(r.deposit)}</td>
                    <td className="px-2 py-1.5 font-medium">{vnd(r.total - r.deposit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <h2 className="pt-2 font-semibold">Booking cơ sở của chủ (xử lý trạng thái)</h2>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/broker/bookings?${k ? `s=${k}&` : ""}m=${m.key}`}
            className={`rounded-full px-3 py-1 text-sm ${k === f[0] ? "bg-teal-700 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{label}</Link>
        ))}
      </div>
      {done.length > 0 && <p className="text-sm text-slate-600">Lãi các booking đã chốt ở danh sách này: <b className="text-emerald-700">{vnd(done.reduce((t, r) => t + r.sell_total - r.net_total, 0))}</b></p>}
      <BookingList rows={rows} role="broker" back={`/broker/bookings?${f[0] ? `s=${f[0]}&` : ""}m=${m.key}`} />
    </div>
  );
}
