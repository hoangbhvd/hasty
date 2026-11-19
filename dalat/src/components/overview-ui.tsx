import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, BOOKING_TONE } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/components/booking-list";
import { formatDateVi } from "@/lib/format";
import type { BookingItem } from "@/lib/overview";

export function TodoGrid({ items }: { items: { href: string; count: number; label: string; hint?: string }[] }) {
  const active = items.filter((i) => i.count > 0);
  if (active.length === 0) {
    return <p className="rounded border border-black bg-status-confirmed-bg p-4 text-sm font-semibold shadow-brutal-sm">🎉 Không có việc gấp nào cần xử lý.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {active.map((i) => (
        <li key={i.href + i.label}>
          <Link href={i.href} className="brutal-btn flex min-h-16 items-center justify-between gap-3 bg-white p-3 text-black">
            <span>
              <span className="block font-semibold">{i.label}</span>
              {i.hint && <span className="block text-xs text-black/60">{i.hint}</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="money-num grid min-w-8 place-items-center rounded-full border border-black bg-secondary px-2 text-lg font-extrabold">{i.count}</span>
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Danh sách booking gọn; `base` = "host" | "broker". */
export function MiniBookings({ items, base, empty }: { items: BookingItem[]; base: "host" | "broker"; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-black rounded border border-black bg-white shadow-brutal-sm">
      {items.map((b) => (
        <li key={b.id}>
          <Link href={`/${base}/bookings/${b.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted">
            <div className="min-w-0">
              <div className="truncate font-semibold">{b.guest} <span className="font-mono text-xs font-normal text-muted-foreground">· {b.code}</span></div>
              <div className="money-num truncate text-sm text-muted-foreground">{b.property} · {formatDateVi(b.checkIn)} → {formatDateVi(b.checkOut)} · {b.guests} khách</div>
            </div>
            {b.minutesLeft !== null ? (
              <Badge tone="holding" className={b.minutesLeft <= 10 ? "bg-status-cancelled" : undefined}>⏱ còn {b.minutesLeft}′</Badge>
            ) : (
              <Badge tone={BOOKING_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function QuickLinks({ links }: { links: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={`brutal-btn inline-flex h-11 items-center px-4 text-sm text-black ${l.primary ? "bg-primary" : "bg-white"}`}>{l.label}</Link>
      ))}
    </div>
  );
}
