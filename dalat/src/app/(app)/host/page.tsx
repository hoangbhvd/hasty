import { requireUser } from "@/lib/session";
import { hostOverview } from "@/lib/overview";
import { Kpi } from "@/components/finance-ui";
import { MiniBookings, QuickLinks, Section, TodoGrid } from "@/components/overview-ui";

export default async function HostOverviewPage() {
  const user = await requireUser();
  const o = await hostOverview(user.id);
  const t = o.todo;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Xin chào, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">{o.label}</p>
      </div>

      <QuickLinks links={[{ href: "/host/bookings/new", label: "+ Tạo booking", primary: true }, { href: "/host/calendar", label: "Xem lịch" }, { href: "/host/properties/new", label: "+ Thêm căn" }]} />

      <Section title="Cần xử lý">
        <TodoGrid items={[
          { href: "/host/chat", count: t.holdRequests, label: "Yêu cầu giữ phòng chờ bạn duyệt", hint: "Mở chat để đồng ý hoặc từ chối" },
          { href: "/host/partners", count: t.pendingLinks, label: "CTV chờ bạn duyệt" },
          { href: "/host/requests", count: t.urgentRequests, label: "Tìm phòng gấp phù hợp căn của bạn" },
          { href: t.pendingTxBookingId ? `/host/bookings/${t.pendingTxBookingId}` : "/host/finance", count: t.pendingTx, label: "Giao dịch chờ xác nhận đã nhận tiền", hint: t.pendingTxBookingId ? "Mở booking để xác nhận" : "Nhiều booking — xem mục Tài chính" },
          { href: "/host/chat", count: t.unread, label: "Tin nhắn chưa đọc" },
        ]} />
      </Section>

      <Section title="Hôm nay" hint="Khách đến / đi">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1"><h3 className="text-sm font-semibold">Check-in hôm nay ({o.arrivalsToday.length})</h3><MiniBookings items={o.arrivalsToday} base="host" empty="Không có khách đến hôm nay." /></div>
          <div className="space-y-1"><h3 className="text-sm font-semibold">Check-out hôm nay ({o.departuresToday.length})</h3><MiniBookings items={o.departuresToday} base="host" empty="Không có khách trả phòng hôm nay." /></div>
        </div>
      </Section>

      <Section title="Ngày mai">
        <MiniBookings items={o.arrivalsTomorrow} base="host" empty="Không có khách đến ngày mai." />
      </Section>

      {o.holds.length > 0 && (
        <Section title="Đang giữ phòng" hint="Tự nhả khi hết thời gian">
          <MiniBookings items={o.holds} base="host" empty="" />
        </Section>
      )}

      {o.staying.length > 0 && (
        <Section title={`Đang ở (${o.staying.length})`}>
          <MiniBookings items={o.staying} base="host" empty="" />
        </Section>
      )}

      <Section title={`Tháng ${o.month.label.slice(5)}/${o.month.label.slice(0, 4)}`} hint="Chi tiết ở mục Tài chính">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Doanh thu chủ nhà" value={o.month.revenue} tone="primary" />
          <Kpi label="Đã nhận thực tế" value={o.month.received} />
          <Kpi label="CTV đang nợ bạn" value={o.month.brokerOwesYou} tone={o.month.brokerOwesYou > 0 ? "warn" : undefined} />
          <Kpi label="Bạn nợ CTV (hoa hồng)" value={o.month.youOweBrokers} tone={o.month.youOweBrokers > 0 ? "warn" : undefined} />
        </div>
      </Section>
    </div>
  );
}
