import Link from "next/link";
import { requireUser } from "@/lib/session";
import { brokerFinance } from "@/lib/finance";
import { formatVnd } from "@/lib/format";
import { Kpi, MonthNav } from "@/components/finance-ui";

export default async function BrokerFinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const user = await requireUser();
  const f = await brokerFinance(user.id, month);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Hoa hồng</h1>
        <MonthNav base="/broker/finance" month={f.month} prev={f.prev} next={f.next} />
      </div>

      <section aria-label="Tổng quan tháng" className="space-y-2">
        <p className="text-sm text-muted-foreground">{f.count} booking có check-in trong tháng (không tính huỷ / đang giữ).</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Doanh số" value={f.sales} />
          <Kpi label="Tổng hoa hồng" value={f.commission} tone="primary" />
          <Kpi label="Hoa hồng đã nhận" value={f.realized} />
          <Kpi label="Hoa hồng chờ nhận" value={f.pending} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Theo từng homestay</h2>
        {f.properties.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có booking trong tháng này.</p> : (
          <ul className="divide-y divide-black rounded border border-black bg-white shadow-brutal-sm md:brutal-card">
            {f.properties.map((p) => (
              <li key={p.name} className="space-y-1 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-muted-foreground">{p.count} booking</span>
                </div>
                <dl className="money-num grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-4">
                  <div><dt className="text-xs text-muted-foreground">Doanh số</dt><dd className="font-semibold">{formatVnd(p.sales)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Hoa hồng</dt><dd className="font-semibold">{formatVnd(p.commission)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Đã nhận</dt><dd className="font-semibold">{formatVnd(p.realized)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Chờ nhận</dt><dd className="font-semibold">{formatVnd(p.pending)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Đối soát với chủ nhà</h2>
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Bạn cần chuyển cho chủ" value={f.youOwe} tone={f.youOwe > 0 ? "warn" : undefined} />
          <Kpi label="Chủ nhà cần chuyển cho bạn" value={f.owedToYou} tone={f.owedToYou > 0 ? "warn" : undefined} />
        </div>
        {f.debts.length === 0 ? <p className="text-sm text-muted-foreground">Không có công nợ nào. 🎉</p> : (
          <ul className="divide-y divide-black rounded border border-black bg-white">
            {f.debts.map((d) => (
              <li key={d.bookingId}>
                <Link href={`/broker/bookings/${d.bookingId}`} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-muted">
                  <span><b className="font-mono">{d.code}</b> · {d.guest} · {d.property}</span>
                  <span className="money-num text-right font-semibold">{d.owed > 0 ? "Bạn chuyển " : "Chủ chuyển "}{formatVnd(Math.abs(d.owed))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
