"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { LogOut, MoreHorizontal, UserCircle } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { switchModeAction } from "@/app/(app)/actions";
import { logoutAction } from "@/app/(auth)/actions";
import { NAV, type Mode, type NavItem } from "@/lib/nav";
import { RealtimeProvider, useUnread } from "@/components/realtime-provider";

export function RoleSwitcher({ mode, canHost, canBroker, dark = false }: { mode: Mode; canHost: boolean; canBroker: boolean; dark?: boolean }) {
  const [pending, start] = useTransition();
  const opts: { value: Mode; label: string; enabled: boolean }[] = [
    { value: "host", label: "Chủ nhà", enabled: canHost },
    { value: "broker", label: "CTV", enabled: canBroker },
  ];
  return (
    <div role="group" aria-label="Chuyển chế độ" className={cn("grid grid-cols-2 gap-1 rounded border border-black p-1", dark ? "bg-sidebar-accent" : "bg-white")}>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={!o.enabled || pending}
          aria-pressed={mode === o.value}
          onClick={() => mode !== o.value && start(() => switchModeAction(o.value))}
          className={cn(
            "h-9 rounded border text-sm font-semibold transition-colors disabled:opacity-50",
            mode === o.value
              ? "border-black bg-primary text-black"
              : cn("border-transparent", dark ? "text-sidebar-foreground/70 hover:text-sidebar-foreground" : "text-black/70 hover:text-black"),
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/host" || href === "/broker" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
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
  const bottom = items.filter((i) => i.bottom).sort((a, b) => a.bottom! - b.bottom!);

  return (
    <RealtimeProvider>
    <div data-mode={mode} className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r border-black bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Link href="/" aria-label="Đà Lạt Homestay — trang chủ" className="block"><Logo onDark priority className="h-12" /></Link>
        <RoleSwitcher mode={mode} canHost={user.isHost} canBroker={user.isBroker} dark />
        <nav className="flex flex-1 flex-col gap-1" aria-label="Chính">
          {items.map((it) => (
            <NavLink key={it.href} item={it} active={isActive(pathname, it.href)} layout="side" />
          ))}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border pt-3 text-sm">
          <Link href="/account" className="block font-medium underline-offset-2 hover:underline">{user.fullName}</Link>
          {user.phone && <div className="money-num text-sidebar-foreground/70">{user.phone}</div>}
          <form action={logoutAction}>
            <button className="flex items-center gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground">
              <LogOut className="size-4" /> Đăng xuất
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-black bg-background p-3 md:hidden">
          <div className="flex-1">
            <RoleSwitcher mode={mode} canHost={user.isHost} canBroker={user.isBroker} />
          </div>
          <Link href="/account" aria-label="Tài khoản" className="grid size-10 place-items-center rounded text-black"><UserCircle className="size-5" /></Link>
          <form action={logoutAction}>
            <button aria-label="Đăng xuất" className="grid size-10 place-items-center rounded text-black">
              <LogOut className="size-5" />
            </button>
          </form>
        </header>

        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>

        {/* Mobile bottom nav (tầm ngón tay cái) */}
        <nav
          aria-label="Chính"
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-black bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {bottom.map((it) => (
            <NavLink key={it.href} item={it} active={isActive(pathname, it.href)} layout="bottom" />
          ))}
          <NavLink
            item={{ href: `/more?mode=${mode}`, label: "Thêm", icon: MoreHorizontal, ready: true }}
            active={pathname === "/more" || pathname === "/account"} layout="bottom"
          />
        </nav>
      </div>
    </div>
    </RealtimeProvider>
  );
}

function NavLink({ item, active, layout }: { item: NavItem; active: boolean; layout: "side" | "bottom" }) {
  const Icon = item.icon;
  const { unread } = useUnread();
  const count = item.badge === "chat" ? unread : 0;
  const badge = count > 0 && (
    <span aria-label={`${count} tin chưa đọc`} className="absolute -top-0.5 left-1/2 ml-2 grid min-w-4 place-items-center rounded-full border border-black bg-secondary px-1 text-[10px] leading-4 font-bold text-black md:static md:ml-auto md:min-w-5 md:text-xs">
      {count > 99 ? "99+" : count}
    </span>
  );
  const side = layout === "side";
  const base = side
    ? "relative flex h-10 items-center gap-3 rounded border border-transparent px-3 text-sm"
    : "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]";
  const state = !item.ready
    ? side ? "cursor-not-allowed text-sidebar-foreground/35" : "cursor-not-allowed text-black/35"
    : active
      ? "bg-primary font-bold text-black" + (side ? " border-black" : "")
      : side ? "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground" : "text-black/75";

  if (!item.ready) {
    return (
      <span aria-disabled="true" title="Sắp có" className={cn(base, state)}>
        <Icon className="size-5" /> {item.label}
      </span>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(base, state)}>
      <Icon className="size-5" /> {item.label}{badge}
    </Link>
  );
}
