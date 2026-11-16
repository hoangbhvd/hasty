"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks() {
  const p = usePathname();
  const tab = (href: string, label: string) => (
    <Link href={href} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${p.startsWith(href) ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>
  );
  return <nav className="flex gap-1">{tab("/owner", "Chế độ Chủ")}{tab("/broker", "Chế độ Broker")}</nav>;
}
