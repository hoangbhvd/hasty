"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { LinkError, requestCollab } from "@/lib/links";

export async function requestLinkAction(hostId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try { await requestCollab(user.id, hostId); } catch (e) { if (e instanceof LinkError) return { error: e.message }; throw e; }
  revalidatePath(`/invite/${hostId}`);
  return {};
}
