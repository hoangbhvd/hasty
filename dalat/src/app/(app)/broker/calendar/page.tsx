import Link from "next/link";
import { requireUser } from "@/lib/session";
import { addDays, parseDateOnly, todayVn } from "@/lib/format";
import { calendarBlocks, calendarProperties, parseSelected, selectedParam } from "@/lib/broker-calendar";
import { PropertyCalendar } from "@/components/property-calendar";

const DAYS = 28;

export default async function BrokerCalendarPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string }> }) {
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
  const fromStr = sp.from && parseDateOnly(sp.from) ? sp.from : todayVn();
  const from = parseDateOnly(fromStr)!;
  const to = parseDateOnly(addDays(fromStr, DAYS))!;
  const selected = parseSelected(sp.p, all);
  const shown = all.filter((p) => selected.includes(p.id));
  const blocks = await calendarBlocks(user.id, selected, from, to, new Date());

  const href = (ids: string[], f = fromStr) => {
    const q = new URLSearchParams({ from: f });
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

      <div className="flex items-center gap-2 text-sm">
        <Link href={href(selected, addDays(fromStr, -14))} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">← 14 ngày</Link>
        <Link href={href(selected, todayVn())} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">Hôm nay</Link>
        <Link href={href(selected, addDays(fromStr, 14))} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">14 ngày →</Link>
      </div>

      {shown.length === 0
        ? <p className="rounded border border-dashed border-black p-6 text-center text-sm text-muted-foreground">Chưa chọn homestay nào. Bấm tên homestay ở trên để hiện cột trên lịch.</p>
        : <PropertyCalendar from={from} days={DAYS} today={todayVn()} properties={shown} blocks={blocks} />}
      <p className="text-xs text-muted-foreground">
        Mỗi cột là một homestay; booking nhiều đêm là một khối liền. Khối sọc 🔒 là lịch đã có người khác đặt (không hiện chi tiết). Bấm khối của bạn để mở booking.
        Nhiều homestay thì cột thu hẹp, chỉ còn màu: di chuột / bấm để xem tên.
      </p>
    </div>
  );
}
