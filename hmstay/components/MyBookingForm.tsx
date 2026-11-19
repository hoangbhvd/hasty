import { saveMyBookingAction } from "@/lib/actions";

export type MyBooking = {
  id: string; rooms: string | null; check_in: string; check_out: string; guest_name: string; guest_phone: string | null;
  nightly_price: number; total: number; deposit: number; note: string | null;
};

/** Form thêm/sửa booking của cơ sở tự quản. Có `b` thì là sửa. */
export function MyBookingForm({ propertyId, rooms, b }: { propertyId: string; rooms: string[]; b?: MyBooking }) {
  const list = `rooms-${b?.id ?? "new"}`;
  return (
    <form action={saveMyBookingAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="property_id" value={propertyId} />
      {b && <input type="hidden" name="id" value={b.id} />}
      <div><label className="label">Check-in</label><input className="input" type="date" name="check_in" defaultValue={b?.check_in} required /></div>
      <div><label className="label">Check-out</label><input className="input" type="date" name="check_out" defaultValue={b?.check_out} required /></div>
      <div className="sm:col-span-2">
        <label className="label">Phòng (nhập tay hoặc chọn)</label>
        <input className="input" name="rooms" list={list} defaultValue={b?.rooms ?? ""} placeholder="VD: 2 phòng đơn" />
        <datalist id={list}>{rooms.map((r) => <option key={r} value={r} />)}</datalist>
      </div>
      <div><label className="label">Tên khách</label><input className="input" name="guest_name" defaultValue={b?.guest_name} required /></div>
      <div><label className="label">SĐT khách</label><input className="input" name="guest_phone" inputMode="tel" defaultValue={b?.guest_phone ?? ""} /></div>
      <div><label className="label">Giá bán / đêm (cả booking)</label><input className="input" name="nightly_price" inputMode="numeric" defaultValue={b?.nightly_price || ""} placeholder="VD: 1500000" /></div>
      <div><label className="label">Tổng tiền (trống = giá × số đêm)</label><input className="input" name="total" inputMode="numeric" defaultValue={b?.total || ""} /></div>
      <div><label className="label">Đã cọc</label><input className="input" name="deposit" inputMode="numeric" defaultValue={b?.deposit || ""} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><label className="label">Ghi chú</label><input className="input" name="note" defaultValue={b?.note ?? ""} /></div>
      <div className="flex items-end"><button className="btn w-full">{b ? "Lưu thay đổi" : "Thêm booking"}</button></div>
    </form>
  );
}
