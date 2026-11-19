import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.isBroker) redirect("/host");
  return children;
}
