"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { LinkError, cancelRequest, requestCollab } from "@/lib/links";

export async function requestCollabAction(hostId: string, note: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(hostId).success) return { error: "Không hợp lệ" };
  try { await requestCollab(user.id, hostId, note); } catch (e) { if (e instanceof LinkError) return { error: e.message }; throw e; }
  revalidatePath("/broker/discover");
  return {};
}

export async function cancelCollabAction(hostId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(hostId).success) return { error: "Không hợp lệ" };
  try { await cancelRequest(user.id, hostId); } catch (e) { if (e instanceof LinkError) return { error: e.message }; throw e; }
  revalidatePath("/broker/discover");
  return {};
}
