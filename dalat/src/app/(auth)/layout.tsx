import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Kiểm tra session thật (cookie cũ/hết hạn sẽ không bị coi là đã đăng nhập)
  if (await getCurrentUser()) redirect("/");
  return <main className="flex min-h-dvh items-center justify-center p-4">{children}</main>;
}
