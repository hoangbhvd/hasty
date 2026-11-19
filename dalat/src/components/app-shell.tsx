"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  Building2, CalendarDays, Handshake, LayoutDashboard, LogOut, Search, Wallet, ClipboardList, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { switchModeAction } from "@/app/(app)/actions";
import { logoutAction } from "@/app/(auth)/actions";

type Mode = "host" | "broker";
type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; ready: boolean };

const NAV: Record<Mode, NavItem[]> = {
  host: [
    { href: "/host", label: "Tổng quan", icon: LayoutDashboard, ready: true },
    { href: "/host/properties", label: "Căn của tôi", icon: Building2, ready: true },
    { href: "/host/calendar", label: "Lịch", icon: CalendarDays, ready: false },
    { href: "/host/partners", label: "Đối tác", icon: Handshake, ready: true },
    { href: "/host/finance", label: "Tài chính", icon: Wallet, ready: false },
  ],
  broker: [
    { href: "/broker", label: "Tổng quan", icon: LayoutDashboard, ready: true },
    { href: "/broker/properties", label: "Homestay", icon: Search, ready: true },
    { href: "/broker/bookings", label: "Booking", icon: ClipboardList, ready: false },
    { href: "/broker/requests", label: "Tìm gấp", icon: MessageCircle, ready: false },
    { href: "/broker/finance", label: "Hoa hồng", icon: Wallet, ready: false },
  ],
};

export function RoleSwitcher({ mode, canHost, canBroker }: { mode: Mode; canHost: boolean; canBroker: boolean }) {
  const [pending, start] = useTransition();
  const opts: { value: Mode; label: string; enabled: boolean }[] = [
    { value: "host", label: "Chủ nhà", enabled: canHost },
    { value: "broker", label: "CTV", enabled: canBroker },
  ];
  return (
    <div role="group" aria-label="Chuyển chế độ" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={!o.enabled || pending}
          aria-pressed={mode === o.value}
          onClick={() => mode !== o.value && start(() => switchModeAction(o.value))}
          className={cn(
            "h-9 rounded-md text-sm font-medium transition-colors disabled:opacity-50",
            mode === o.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/host" || href === "/broker" ? pathname === href : pathname.startsWith(href);
}

export function AppShell({
  mode: cookieMode, user, children,
}: {
  mode: Mode;
  user: { fullName: string; phone: string | null; isHost: boolean; isBroker: boolean };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // URL là nguồn sự thật cho chế độ đang xem; cookie chỉ dùng để nhớ lần cuối.
  const mode: Mode = pathname.startsWith("/broker") ? "broker" : pathname.startsWith("/host") ? "host" : cookieMode;
  const items = NAV[mode];

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r bg-card p-4 md:flex">
        <div className="text-lg font-semibold">Đà Lạt Homestay</div>
        <RoleSwitcher mode={mode} canHost={user.isHost} canBroker={user.isBroker} />
        <nav className="flex flex-1 flex-col gap-1" aria-label="Chính">
          {items.map((it) => (
            <NavLink key={it.href} item={it} active={isActive(pathname, it.href)} layout="side" />
          ))}
        </nav>
        <div className="space-y-2 border-t pt-3 text-sm">
          <div className="font-medium">{user.fullName}</div>
          {user.phone && <div className="text-muted-foreground">{user.phone}</div>}
          <form action={logoutAction}>
            <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <LogOut className="size-4" /> Đăng xuất
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 p-3 backdrop-blur md:hidden">
          <div className="flex-1">
            <RoleSwitcher mode={mode} canHost={user.isHost} canBroker={user.isBroker} />
          </div>
          <form action={logoutAction}>
            <button aria-label="Đăng xuất" className="grid size-10 place-items-center rounded-md text-muted-foreground">
              <LogOut className="size-5" />
            </button>
          </form>
        </header>

        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>

        {/* Mobile bottom nav (tầm ngón tay cái) */}
        <nav
          aria-label="Chính"
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {items.map((it) => (
            <NavLink key={it.href} item={it} active={isActive(pathname, it.href)} layout="bottom" />
          ))}
        </nav>
      </div>
    </div>
  );
}

function NavLink({ item, active, layout }: { item: NavItem; active: boolean; layout: "side" | "bottom" }) {
  const Icon = item.icon;
  const base =
    layout === "side"
      ? "flex h-10 items-center gap-3 rounded-md px-3 text-sm"
      : "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]";
  const state = !item.ready
    ? "cursor-not-allowed text-muted-foreground/50"
    : active
      ? layout === "side" ? "bg-muted font-medium" : "font-medium text-foreground"
      : "text-muted-foreground hover:text-foreground";

  if (!item.ready) {
    return (
      <span aria-disabled="true" title="Sắp có" className={cn(base, state)}>
        <Icon className="size-5" /> {item.label}
      </span>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(base, state)}>
      <Icon className="size-5" /> {item.label}
    </Link>
  );
}
