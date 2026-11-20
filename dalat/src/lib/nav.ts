import { Building2, CalendarDays, ClipboardList, Compass, Flame, Grid3x3, Handshake, LayoutDashboard, MessageCircle, Search, Wallet } from "lucide-react";

export type Mode = "host" | "broker";
export type NavItem = {
  href: string; label: string; icon: React.ComponentType<{ className?: string }>; ready: boolean;
  /** Thứ tự trên thanh dưới (mobile). Mục không có `bottom` nằm trong trang "Thêm". */
  bottom?: number;
  badge?: "chat";
};

export const NAV: Record<Mode, NavItem[]> = {
  host: [
    { href: "/host", label: "Tổng quan", icon: LayoutDashboard, ready: true },
    { href: "/host/properties", label: "Căn của tôi", icon: Building2, ready: true, bottom: 2 },
    { href: "/host/calendar", label: "Lịch", icon: CalendarDays, ready: true, bottom: 1 },
    { href: "/host/requests", label: "Tìm gấp", icon: Flame, ready: true, bottom: 3 },
    { href: "/host/chat", label: "Chat", icon: MessageCircle, ready: true, bottom: 4, badge: "chat" },
    { href: "/host/partners", label: "Đối tác", icon: Handshake, ready: true },
    { href: "/host/finance", label: "Tài chính", icon: Wallet, ready: true },
  ],
  broker: [
    { href: "/broker", label: "Tổng quan", icon: LayoutDashboard, ready: true },
    { href: "/broker/search", label: "Tìm phòng", icon: Search, ready: true, bottom: 1 },
    { href: "/broker/availability", label: "Lịch trống", icon: Grid3x3, ready: true, bottom: 2 },
    { href: "/broker/bookings", label: "Booking", icon: ClipboardList, ready: true, bottom: 3 },
    { href: "/broker/calendar", label: "Lịch (theo ngày)", icon: CalendarDays, ready: true },
    { href: "/broker/requests", label: "Tìm gấp", icon: Flame, ready: true },
    { href: "/broker/chat", label: "Chat", icon: MessageCircle, ready: true, bottom: 4, badge: "chat" },
    { href: "/broker/discover", label: "Khám phá", icon: Compass, ready: true },
    { href: "/broker/properties", label: "Homestay", icon: Building2, ready: true },
    { href: "/broker/finance", label: "Hoa hồng", icon: Wallet, ready: true },
  ],
};
