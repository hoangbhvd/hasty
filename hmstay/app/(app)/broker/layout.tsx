import { SubTabs } from "@/components/SubTabs";

export default function BrokerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <SubTabs tabs={[
        { href: "/broker", label: "Tổng quan", exact: true },
        { href: "/broker/search", label: "Tìm phòng trống" },
        { href: "/broker/properties", label: "Cơ sở" },
        { href: "/broker/mine", label: "Cơ sở tự quản" },
        { href: "/broker/bookings", label: "Booking của tôi" },
      ]} />
      {children}
    </div>
  );
}
