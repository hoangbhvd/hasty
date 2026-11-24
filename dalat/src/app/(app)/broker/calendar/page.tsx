import Link from "next/link";
import { requireUser } from "@/lib/session";
import { todayVn } from "@/lib/format";
import { parseMonth } from "@/lib/calendar-month";
import { MonthNav } from "@/components/month-nav";
import { calendarBlocks, calendarProperties, parseSelected, selectedParam } from "@/lib/broker-calendar";
import { PropertyCalendar } from "@/components/property-calendar";

export default async function BrokerCalendarPage({ searchParams }: { searchParams: Promise<{ p?: string; month?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const all = await calendarProperties(user.id);
  if (all.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Lịch</h1>
        <p className="text-muted-foreground">Chưa có homestay nào để hiển thị. <Link className="underline" href="/broker/properties">Thêm homestay</Link> hoặc liên kết với chủ nhà.</p>
      </div>
    );
  }
  const today = todayVn();
  const { month, from, days: DAYS } = parseMonth(sp.month, today);
  const to = new Date(from.getTime() + DAYS * 86_400_000);
  const selected = parseSelected(sp.p, all);
  const shown = all.filter((p) => selected.includes(p.id));
  const blocks = await calendarBlocks(user.id, selected, from, to, new Date());

  const href = (ids: string[], m = month) => {
    const q = new URLSearchParams({ month: m });
    const p = selectedParam(ids, all);
    if (p) q.set("p", p);
    return `/broker/calendar?${q.toString()}`;
  };
  const toggle = (id: string) => (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Lịch</h1>

      <section className="space-y-2" aria-label="Chọn homestay hiển thị">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-semibold">Hiển thị {shown.length}/{all.length} homestay</span>
          <span className="flex gap-3 underline">
            <Link href={href(all.map((p) => p.id))}>Chọn tất cả</Link>
            <Link href={href([])}>Bỏ chọn</Link>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {all.map((p) => {
            const on = selected.includes(p.id);
            return (
              <Link key={p.id} href={href(toggle(p.id))} aria-pressed={on}
                className={`h-9 rounded-full border border-black px-3 text-sm leading-9 text-black ${on ? "bg-primary font-semibold" : "bg-white text-black/60 line-through hover:bg-muted"}`}>
                {on ? "✓ " : ""}{p.name}
              </Link>
            );
          })}
        </div>
      </section>

      <MonthNav month={month} thisMonth={today.slice(0, 7)} action="/broker/calendar" hidden={selectedParam(selected, all) ? { p: selectedParam(selected, all)! } : {}} href={(m) => href(selected, m)} />

      {shown.length === 0
        ? <p className="rounded border border-dashed border-black p-6 text-center text-sm text-muted-foreground">Chưa chọn homestay nào. Bấm tên homestay ở trên để hiện cột trên lịch.</p>
        : <PropertyCalendar from={from} days={DAYS} today={today} properties={shown} blocks={blocks} />}
      <p className="text-xs text-muted-foreground">
        Mỗi cột là một homestay; booking nhiều đêm là một khối liền. Khối sọc 🔒 là lịch đã có người khác đặt (không hiện chi tiết; riêng căn bạn là Co-host thì hiện tên và SĐT khách). Bấm khối có tên khách để mở booking.
        Nhiều homestay thì cột thu hẹp, chỉ còn màu: di chuột / bấm để xem tên.
      </p>
    </div>
  );
}
