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
      <header className="border-b border-black bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/owner" className="rounded-md border border-black bg-[#ff90e8] px-2 py-0.5 text-lg font-extrabold tracking-tight text-black no-underline">hmstay</Link>
          <div className="order-last w-full min-w-0 sm:order-none sm:w-auto"><NavLinks unread={unread} /></div>
          <div className="ml-auto flex items-center gap-3 text-sm sm:order-last">
            <Link href="/settings" className="max-w-32 truncate text-slate-600 hover:text-black sm:max-w-none">{name || "Cài đặt"}</Link>
            <form action={logoutAction}><button className="underline">Thoát</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">{children}</main>
    </>
  );
}
