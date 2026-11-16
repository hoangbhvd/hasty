import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { NavLinks } from "@/components/NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const uid = await requireUser();
  const { name, unread } = await withUser(uid, async (q) => {
    const [p] = await q<{ full_name: string }>("select full_name from profiles where id=$1", [uid]);
    const [n] = await q<{ c: number }>("select count(*)::int c from notifications where read_at is null");
    return { name: p?.full_name ?? "", unread: n.c };
  });
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/owner" className="font-bold text-teal-800">HMStay</Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/notifications" className="relative text-slate-600 hover:text-slate-900">
              Thông báo{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">{unread}</span>}
            </Link>
            <Link href="/settings" className="hidden text-slate-500 hover:text-slate-900 sm:inline">{name || "Cài đặt"}</Link>
            <form action={logoutAction}><button className="text-slate-600 underline">Thoát</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
