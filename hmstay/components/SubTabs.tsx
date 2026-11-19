"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabDef = { href: string; label: string; badge?: number; exact?: boolean };

/** Thanh tab cuộn ngang được trên điện thoại. */
export function SubTabs({ tabs }: { tabs: TabDef[] }) {
  const p = usePathname();
  return (
    <nav className="hide-scroll -mx-4 flex gap-1 overflow-x-auto border-b border-black px-4">
      {tabs.map((t) => {
        const on = t.exact ? p === t.href : p.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-4 px-3 py-2 text-sm font-semibold ${on ? "border-black text-black" : "border-transparent text-slate-600 hover:text-black"}`}>
            {t.label}
            {!!t.badge && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{t.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
