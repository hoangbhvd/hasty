import type { Q } from "./db";
import { nightsBetween } from "./format";

export type MonthStats = { units: number; nights_available: number; nights_booked: number; revenue: number; bookings: number; occupancy: number };

/**
 * Thống kê một tháng cho CHỦ (propertyId = null: mọi cơ sở của chủ). Chỉ tính booking "Đã chốt";
 * doanh thu = giá net chia đều theo đêm rồi cộng các đêm nằm trong tháng.
 */
export async function ownerMonthStats(q: Q, uid: string, propertyId: string | null, start: string, endExclusive: string): Promise<MonthStats> {
  const days = nightsBetween(start, endExclusive);
  const [r] = await q<{ units: number; booked: number; revenue: number; bookings: number }>(
    `with u as (
       select un.id from units un join properties p on p.id=un.property_id
       where p.owner_id=$1 and un.active and ($4::uuid is null or p.id=$4)),
     ov as (
       select b.net_total, (b.check_out - b.check_in) nights,
              greatest(0, least(b.check_out, $3::date) - greatest(b.check_in, $2::date)) nin
       from bookings b join u on u.id=b.unit_id
       where b.status='confirmed' and b.check_in < $3::date and b.check_out > $2::date)
     select (select count(*)::int from u) units,
            coalesce((select sum(nin) from ov),0)::bigint booked,
            coalesce((select round(sum(net_total::numeric * nin / nights)) from ov),0)::bigint revenue,
            (select count(*)::int from ov) bookings`, [uid, start, endExclusive, propertyId]);
  const avail = r.units * days;
  return { units: r.units, nights_available: avail, nights_booked: r.booked, revenue: r.revenue, bookings: r.bookings, occupancy: avail ? r.booked / avail : 0 };
}

export type StayRow = {
  id: string; guest_name: string; guest_phone: string | null; guests: number | null; check_in: string; check_out: string;
  unit_name: string; property_id: string; property_name: string; broker_name: string | null; status: string;
};

/** Khách đến/đi hôm nay và sắp đến 7 ngày tới (booking Đã chốt) của chủ. */
export async function ownerStays(q: Q, uid: string, propertyId: string | null) {
  const base = `select b.id, b.guest_name, b.guest_phone, b.guests, b.check_in, b.check_out, b.status, u.name unit_name,
                       p.id property_id, p.name property_name, pr.full_name broker_name
                from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id
                left join profiles pr on pr.id=b.broker_id
                where p.owner_id=$1 and ($2::uuid is null or p.id=$2) and b.status='confirmed'`;
  const arrivals = await q<StayRow>(`${base} and b.check_in = current_date order by u.name`, [uid, propertyId]);
  const departures = await q<StayRow>(`${base} and b.check_out = current_date order by u.name`, [uid, propertyId]);
  const upcoming = await q<StayRow>(`${base} and b.check_in > current_date and b.check_in <= current_date + 7 order by b.check_in, u.name`, [uid, propertyId]);
  const [inhouse] = await q<{ c: number }>(
    `select count(*)::int c from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id
     where p.owner_id=$1 and ($2::uuid is null or p.id=$2) and b.status='confirmed' and b.check_in <= current_date and b.check_out > current_date`, [uid, propertyId]);
  return { arrivals, departures, upcoming, inhouse: inhouse.c };
}

export type BrokerStats = { confirmed: number; confirmed_profit: number; confirmed_sell: number; pending: number; pending_profit: number };

/** Thống kê cho BROKER theo tháng nhận phòng: lãi = giá bán − giá net. */
export async function brokerMonthStats(q: Q, uid: string, start: string, endExclusive: string): Promise<BrokerStats> {
  // Booking tự quản (broker_bookings) còn hiệu lực tính như đã chốt: lãi = tổng tiền − giá vốn
  const [r] = await q<BrokerStats>(
    `select count(*) filter (where status='confirmed')::int confirmed,
            coalesce(sum(sell_total - net_total) filter (where status='confirmed'),0)::bigint confirmed_profit,
            coalesce(sum(sell_total) filter (where status='confirmed'),0)::bigint confirmed_sell,
            count(*) filter (where status in ('holding','deposit_reported'))::int pending,
            coalesce(sum(sell_total - net_total) filter (where status in ('holding','deposit_reported')),0)::bigint pending_profit
     from (
       select status::text status, sell_total, net_total from bookings
        where broker_id=$1 and check_in >= $2::date and check_in < $3::date
       union all
       select 'confirmed', total, net_total from broker_bookings
        where broker_id=$1 and status='active' and check_in >= $2::date and check_in < $3::date
     ) t`, [uid, start, endExclusive]);
  return r;
}
