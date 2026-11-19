import Link from "next/link";
import { LogOut, UserCircle } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getMode } from "@/lib/mode";
import { NAV } from "@/lib/nav";
import { logoutAction } from "@/app/(auth)/actions";

export default async function MorePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const mode = sp.mode === "broker" || sp.mode === "host" ? sp.mode : await getMode();
  const extra = NAV[mode].filter((i) => !i.bottom);
  const row = "flex h-14 items-center gap-3 px-4 hover:bg-muted";
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Thêm</h1>
      <ul className="divide-y divide-black rounded border border-black bg-white shadow-brutal-sm">
        {extra.map((i) => (
          <li key={i.href}><Link href={i.href} className={row}><i.icon className="size-5" /> {i.label}</Link></li>
        ))}
        <li><Link href="/account" className={row}><UserCircle className="size-5" /> Tài khoản &amp; thông báo <span className="ml-auto text-sm text-muted-foreground">{user.fullName}</span></Link></li>
        <li>
          <form action={logoutAction}><button className={`${row} w-full`}><LogOut className="size-5" /> Đăng xuất</button></form>
        </li>
      </ul>
    </div>
  );
}
