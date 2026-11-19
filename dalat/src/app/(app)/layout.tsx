import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";
import { getMode } from "@/lib/mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, mode] = await Promise.all([requireUser(), getMode()]);
  return (
    <AppShell mode={mode} user={user}>
      {children}
    </AppShell>
  );
}
