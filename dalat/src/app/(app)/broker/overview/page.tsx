import { requireUser } from "@/lib/session";
import { brokerOverview } from "@/lib/overview";
import { Kpi } from "@/components/finance-ui";
import { MiniBookings, QuickLinks, Section, TodoGrid } from "@/components/overview-ui";

export default async function BrokerOverviewPage() {
  const user = await requireUser();
  const o = await brokerOverview(user.id);
  const t = o.todo;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Xin chào, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">{o.label}</p>
      </div>

      <QuickLinks links={[{ href: "/broker/search", label: "🔍 Tìm phòng", primary: true }, { href: "/broker/requests", label: "🔥 Tìm phòng gấp" }, { href: "/broker/bookings", label: "Booking của tôi" }]} />

      <Section title="Cần xử lý">
        <TodoGrid items={[
          { href: "/broker/bookings", count: t.expiringHolds, label: "Giữ phòng sắp hết hạn (≤ 10 phút)", hint: "Xác nhận trước khi phòng tự nhả" },
          { href: "/broker/requests", count: t.newOffers, label: "Đề xuất cho yêu cầu tìm gấp", hint: "Chủ nhà đã báo giá" },
          { href: t.pendingTxBookingId ? `/broker/bookings/${t.pendingTxBookingId}` : "/broker/bookings", count: t.pendingTx, label: "Giao dịch chờ bạn xác nhận", hint: t.pendingTxBookingId ? "Mở booking để xác nhận" : "Mở từng booking trong danh sách" },
          { href: "/broker/chat", count: t.unread, label: "Tin nhắn chưa đọc" },
          { href: "/broker/requests", count: t.openRequests, label: "Yêu cầu tìm gấp đang mở" },
        ]} />
      </Section>

      {o.holds.length > 0 && (
        <Section title="Đang giữ phòng" hint="Tự nhả khi hết thời gian">
          <MiniBookings items={o.holds} base="broker" empty="" />
        </Section>
      )}

      <Section title="Khách đến hôm nay">
        <MiniBookings items={o.arrivalsToday} base="broker" empty="Không có khách đến hôm nay." />
      </Section>
      <Section title="Khách đến ngày mai">
        <MiniBookings items={o.arrivalsTomorrow} base="broker" empty="Không có khách đến ngày mai." />
      </Section>
      {o.upcoming.length > 0 && (
        <Section title="Sắp tới">
          <MiniBookings items={o.upcoming} base="broker" empty="" />
        </Section>
      )}

      <Section title={`Tháng ${o.month.label.slice(5)}/${o.month.label.slice(0, 4)}`} hint="Chi tiết ở mục Hoa hồng">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Doanh số" value={o.month.sales} />
          <Kpi label="Tổng hoa hồng" value={o.month.commission} tone="primary" />
          <Kpi label="Hoa hồng đã nhận" value={o.month.realized} />
          <Kpi label="Bạn cần chuyển cho chủ" value={o.month.youOwe} tone={o.month.youOwe > 0 ? "warn" : undefined} />
        </div>
      </Section>
    </div>
  );
}
