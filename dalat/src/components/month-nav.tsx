import Link from "next/link";
import { shiftMonth } from "@/lib/calendar-month";

/** Chọn tháng cho lịch: tháng trước / tháng này / tháng sau + ô chọn tháng bất kỳ (GET, giữ các tham số khác qua `hidden`). */
export function MonthNav({ month, thisMonth, action, hidden, href, view, viewHref }: {
  month: string; thisMonth: string; action: string; hidden: Record<string, string>; href: (m: string) => string;
  view: "grid" | "timeline"; viewHref: (v: "grid" | "timeline") => string;
}) {
  const [y, m] = month.split("-");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href={href(shiftMonth(month, -1))} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">← Tháng trước</Link>
      <Link href={href(thisMonth)} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">Tháng này</Link>
      <Link href={href(shiftMonth(month, 1))} className="h-10 brutal-btn bg-white px-3 leading-10 text-black">Tháng sau →</Link>
      <form action={action} method="get" className="flex items-center gap-2">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="month" name="month" defaultValue={month} aria-label="Chọn tháng" className="brutal-input h-10 px-2 text-base" />
        <button type="submit" className="h-10 brutal-btn bg-white px-3 text-black">Xem</button>
      </form>
      <span className="font-semibold">Tháng {m}/{y}</span>
      <span className="ml-auto flex gap-1" role="tablist" aria-label="Kiểu hiển thị">
        {([["grid", "Lịch tháng"], ["timeline", "Dạng cột"]] as const).map(([k, label]) => (
          <Link key={k} href={viewHref(k)} role="tab" aria-selected={view === k} className={`h-10 rounded-full border border-black px-3 leading-10 text-black ${view === k ? "bg-primary font-semibold" : "bg-white hover:bg-muted"}`}>{label}</Link>
        ))}
      </span>
    </div>
  );
}
