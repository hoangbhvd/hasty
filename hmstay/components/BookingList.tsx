import { advanceBookingAction } from "@/lib/actions";
import { STATUS_LABEL, vnd } from "@/lib/format";

export type BookingRow = {
  id: string; guest_name: string; guest_phone: string | null; guests: number | null;
  check_in: string; check_out: string; net_total: number; sell_total: number; deposit_amount: number;
  status: string; hold_expires_at: string | null; unit_name: string; property_name: string;
  broker_name: string | null; note: string | null;
};

const COLOR: Record<string, string> = {
  quoted: "bg-slate-100 text-slate-700", holding: "bg-amber-100 text-amber-800",
  deposit_reported: "bg-blue-100 text-blue-800", confirmed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700", expired: "bg-slate-200 text-slate-600",
};

function Btn({ id, to, label, back, danger }: { id: string; to: string; label: string; back: string; danger?: boolean }) {
  return (
    <form action={advanceBookingAction}>
      <input type="hidden" name="booking_id" value={id} /><input type="hidden" name="to" value={to} />
      <input type="hidden" name="back" value={back} />
      <button className={danger ? "btn-danger" : "btn"}>{label}</button>
    </form>
  );
}

export function BookingList({ rows, role, back }: { rows: BookingRow[]; role: "owner" | "broker"; back: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">Chưa có booking.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((b) => (
        <li key={b.id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{b.guest_name}{b.guest_phone && <span className="font-normal text-slate-500"> · {b.guest_phone}</span>}</p>
              <p className="text-sm text-slate-600">{b.property_name} – {b.unit_name} · {b.check_in} → {b.check_out}{b.guests ? ` · ${b.guests} khách` : ""}</p>
              {role === "owner" && <p className="text-sm text-slate-600">{b.broker_name ? `Broker: ${b.broker_name}` : "Chủ tự nhập"}</p>}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${COLOR[b.status]}`}>{STATUS_LABEL[b.status]}</span>
          </div>
          <p className="mt-2 text-sm">
            Giá net: <b>{vnd(b.net_total)}</b>
            {role === "broker" && <> · Giá bán: <b>{vnd(b.sell_total)}</b> · Lãi dự kiến: <b className="text-emerald-700">{vnd(b.sell_total - b.net_total)}</b></>}
            {b.deposit_amount > 0 && <> · Cọc: <b>{vnd(b.deposit_amount)}</b></>}
          </p>
          {b.status === "holding" && b.hold_expires_at && (
            <p className="mt-1 text-xs text-amber-700">Giữ chỗ đến {new Date(b.hold_expires_at).toLocaleString("vi-VN")}</p>
          )}
          {b.note && <p className="mt-1 text-xs text-slate-500">Ghi chú: {b.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {role === "broker" && b.status === "quoted" && <Btn id={b.id} to="holding" label="Khách đồng ý cọc – Báo chủ chốt" back={back} />}
            {role === "broker" && b.status === "holding" && <Btn id={b.id} to="deposit_reported" label="Đã nhận cọc – Báo chủ" back={back} />}
            {role === "broker" && ["quoted", "holding"].includes(b.status) && <Btn id={b.id} to="cancelled" label="Huỷ" back={back} danger />}
            {role === "owner" && ["holding", "deposit_reported"].includes(b.status) && <Btn id={b.id} to="confirmed" label="Chốt phòng" back={back} />}
            {role === "owner" && ["quoted", "holding", "deposit_reported"].includes(b.status) && <Btn id={b.id} to="cancelled" label="Từ chối / Huỷ" back={back} danger />}
          </div>
        </li>
      ))}
    </ul>
  );
}

export const BOOKING_SQL = `
  select b.id, b.guest_name, b.guest_phone, b.guests, b.check_in, b.check_out, b.net_total, b.sell_total,
         b.deposit_amount, b.status, b.hold_expires_at, b.note, u.name unit_name, p.name property_name, pr.full_name broker_name
  from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id
  left join profiles pr on pr.id=b.broker_id`;
