"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks() {
  const p = usePathname();
  const tab = (href: string, label: string) => (
    <Link href={href} className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${p.startsWith(href) ? "border-black bg-[#ffc900] text-black" : "border-transparent text-black hover:border-black hover:bg-white"}`}>{label}</Link>
  );
  return <nav className="flex gap-1">{tab("/owner", "Chế độ Chủ")}{tab("/broker", "Chế độ Broker")}</nav>;
}
