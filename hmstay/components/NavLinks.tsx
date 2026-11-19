"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Thanh điều hướng chính: cuộn ngang được trên điện thoại. */
export function NavLinks({ unread = 0 }: { unread?: number }) {
  const p = usePathname();
  const tab = (href: string, label: React.ReactNode) => (
    <Link href={href} className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-semibold no-underline ${p.startsWith(href) ? "border-black bg-[#ffc900] text-black" : "border-transparent text-black hover:border-black hover:bg-white"}`}>{label}</Link>
  );
  return (
    <nav className="hide-scroll -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {tab("/owner", "Chế độ Chủ")}
      {tab("/broker", "Chế độ Broker")}
      {tab("/templates", "Mẫu xác nhận")}
      {tab("/notifications", <>Thông báo{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">{unread}</span>}</>)}
    </nav>
  );
}
