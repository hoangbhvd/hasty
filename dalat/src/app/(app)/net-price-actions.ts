"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { NetNegotiationError, proposeNetPrice, respondNetPrice, type NetDecision } from "@/lib/net-negotiation";
import type { FormState } from "@/app/(auth)/actions";

const uuid = z.uuid();
const paths = (bookingId: string) => [`/host/bookings/${bookingId}`, `/broker/bookings/${bookingId}`, "/host/finance", "/broker/finance"];

export async function proposeNetPriceAction(bookingId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(bookingId).success) return { error: "Booking không hợp lệ" };
  const raw = String(fd.get("netPrice") ?? "").trim();
  try {
    await proposeNetPrice(user.id, bookingId, raw === "" ? NaN : Number(raw), String(fd.get("reason") ?? ""));
  } catch (e) {
    if (e instanceof NetNegotiationError) return { error: e.message };
    console.error(e);
    return { error: "Không gửi được, thử lại" };
  }
  paths(bookingId).forEach((p) => revalidatePath(p));
  return {};
}

export async function respondNetPriceAction(messageId: string, bookingId: string, kind: "ACCEPT" | "REJECT" | "COUNTER", price?: number): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!uuid.safeParse(messageId).success || !uuid.safeParse(bookingId).success) return { error: "Không hợp lệ" };
  const decision: NetDecision = kind === "COUNTER" ? { kind, price: Number(price) } : { kind };
  try {
    await respondNetPrice(user.id, messageId, decision);
  } catch (e) {
    if (e instanceof NetNegotiationError) return { error: e.message };
    console.error(e);
    return { error: "Không thực hiện được, thử lại" };
  }
  paths(bookingId).forEach((p) => revalidatePath(p));
  return {};
}
