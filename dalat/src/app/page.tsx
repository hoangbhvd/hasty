import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getMode } from "@/lib/mode";

export default async function Home() {
  await requireUser();
  redirect(`/${await getMode()}`);
}
