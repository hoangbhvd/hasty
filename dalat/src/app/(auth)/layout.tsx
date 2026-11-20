import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Kiểm tra session thật (cookie cũ/hết hạn sẽ không bị coi là đã đăng nhập)
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-4">
      <Logo priority className="h-20" />
      {children}
    </main>
  );
}
