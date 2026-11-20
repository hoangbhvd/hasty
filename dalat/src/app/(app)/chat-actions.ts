"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { ChatError, createHoldRequest, decideHoldRequest, openDirectConversation, shareMediaPack } from "@/lib/chat";
import { normalizePhone } from "@/lib/phone";
import { getBookingForParty } from "@/lib/booking-finance";
import { ensureConversation } from "@/lib/booking-chat";
import { prisma } from "@/lib/db";
import type { FormState } from "@/app/(auth)/actions";

const uuid = z.uuid();

/** Mở chat với đối tác rồi chuyển tới khung chat (đúng chế độ Host/CTV của người bấm). */
export async function openChatAction(otherUserId: string, as: "HOST" | "BROKER") {
  const user = await requireUser();
  if (!uuid.safeParse(otherUserId).success) return;
  let id: string;
  try {
    id = (await openDirectConversation(user.id, otherUserId, as)).id;
  } catch (e) {
    if (e instanceof ChatError) return;
    throw e;
  }
  redirect(`/${as === "HOST" ? "host" : "broker"}/chat/${id}`);
}

/** Mở khung chat của 1 booking (tạo nếu chưa có — chỉ khi booking có đủ Host và CTV). */
export async function openBookingChatAction(bookingId: string, as: "HOST" | "BROKER") {
  const user = await requireUser();
  if (!uuid.safeParse(bookingId).success) return;
  const l = await getBookingForParty(user.id, bookingId);
  if (!l || l.role !== as) return;
  const conv = await ensureConversation(prisma, bookingId);
  if (!conv) return;
  redirect(`/${as === "HOST" ? "host" : "broker"}/chat/${conv.id}`);
}

export async function holdRequestAction(convId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(convId).success) return { error: "Không hợp lệ" };
  const phone = String(fd.get("guestPhone") ?? "").trim();
  try {
    await createHoldRequest(user.id, convId, {
      propertyId: String(fd.get("propertyId") ?? ""), checkIn: String(fd.get("checkIn") ?? ""), checkOut: String(fd.get("checkOut") ?? ""),
      bookingType: fd.get("bookingType") === "ROOMS" ? "ROOMS" : "WHOLE_UNIT", roomIds: fd.getAll("roomIds").map(String),
      guestName: String(fd.get("guestName") ?? ""), guestCount: Number(fd.get("guestCount")), guestPhone: phone ? (normalizePhone(phone) ?? phone) : undefined,
    });
  } catch (e) {
    if (e instanceof ChatError) return { error: e.message };
    console.error(e);
    return { error: "Không gửi được, thử lại" };
  }
  return {};
}

export async function decideHoldAction(messageId: string, accept: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!uuid.safeParse(messageId).success) return { error: "Không hợp lệ" };
  try {
    const r = await decideHoldRequest(user.id, messageId, accept);
    revalidatePath("/host/calendar");
    revalidatePath("/broker/bookings");
    if (r.status === "FAILED") return { error: r.reason };
  } catch (e) {
    if (e instanceof ChatError) return { error: e.message };
    console.error(e);
    return { error: "Không thực hiện được, thử lại" };
  }
  return {};
}

export async function shareMediaAction(convId: string, propertyId: string, keys: string[] = []): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!uuid.safeParse(convId).success || !uuid.safeParse(propertyId).success) return { error: "Không hợp lệ" };
  try {
    await shareMediaPack(user.id, convId, propertyId, keys.filter((k) => typeof k === "string").slice(0, 60));
  } catch (e) {
    if (e instanceof ChatError) return { error: e.message };
    console.error(e);
    return { error: "Không gửi được, thử lại" };
  }
  return {};
}
