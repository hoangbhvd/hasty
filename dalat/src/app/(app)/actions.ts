"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { setMode, type Mode } from "@/lib/mode";

export async function switchModeAction(mode: Mode) {
  const user = await requireUser();
  if (mode === "host" && !user.isHost) return;
  if (mode === "broker" && !user.isBroker) return;
  await setMode(mode);
  redirect(`/${mode}`);
}
