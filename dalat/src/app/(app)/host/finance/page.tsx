import Link from "next/link";
import { requireUser } from "@/lib/session";
import { hostFinance } from "@/lib/finance";
import { formatVnd } from "@/lib/format";
import { Kpi, MonthNav } from "@/components/finance-ui";

export default async function HostFinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const user = await requireUser();
  const f = await hostFinance(user.id, month);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Tài chính</h1>
        <MonthNav base="/host/finance" month={f.month} prev={f.prev} next={f.next} />
      </div>

      <section aria-label="Tổng quan tháng" className="space-y-2">
        <p className="text-sm text-muted-foreground">{f.count} booking có check-in trong tháng (không tính huỷ / đang giữ).</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Doanh thu chủ nhà" value={f.revenue} hint="Net + dịch vụ + phụ thu" tone="primary" />
          <Kpi label="Đã nhận thực tế" value={f.received} />
          <Kpi label="Tiền cọc đã nhận" value={f.deposits} />
          <Kpi label="Còn phải thu" value={Math.max(f.revenue - f.received, 0)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Công nợ với CTV</h2>
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="CTV đang nợ bạn" value={f.brokerOwesYou} tone={f.brokerOwesYou > 0 ? "warn" : undefined} />
          <Kpi label="Bạn đang nợ CTV (hoa hồng)" value={f.youOweBrokers} tone={f.youOweBrokers > 0 ? "warn" : undefined} />
        </div>
        {f.brokers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có công nợ nào. 🎉</p>
        ) : (
          <ul className="space-y-3">
            {f.brokers.map((b) => (
              <li key={b.brokerId} className="rounded border border-black bg-white shadow-brutal-sm md:brutal-card">
                <div className="flex items-center justify-between gap-2 border-b border-black p-3">
                  <div className="font-semibold">{b.name}</div>
                  <div className="money-num text-right font-extrabold">
                    {b.owed > 0 ? `CTV nợ bạn ${formatVnd(b.owed)}` : `Bạn nợ CTV ${formatVnd(-b.owed)}`}
                  </div>
                </div>
                <ul className="divide-y divide-black/20">
                  {b.bookings.map((d) => (
                    <li key={d.bookingId}>
                      <Link href={`/host/bookings/${d.bookingId}`} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted">
                        <span><b className="font-mono">{d.code}</b> · {d.guest} · {d.property}</span>
                        <span className="money-num font-semibold">{d.owed > 0 ? "+" : "−"}{formatVnd(Math.abs(d.owed))}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
