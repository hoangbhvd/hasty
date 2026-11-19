import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.isHost) redirect("/broker");
  return children;
}
