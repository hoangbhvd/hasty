"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { RequestError, chooseOffer, closeRequest, createOffer, createRoomRequest } from "@/lib/requests";
import type { FormState } from "@/app/(auth)/actions";

const uuid = z.uuid();
const optInt = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? Number(v) : null);

export async function createRequestAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isBroker) return { error: "Tài khoản chưa bật chế độ CTV" };
  try {
    await createRoomRequest(user.id, {
      checkIn: String(fd.get("checkIn") ?? ""), checkOut: String(fd.get("checkOut") ?? ""), guestCount: Number(fd.get("guestCount")),
      area: String(fd.get("area") ?? "") || null, roadAccess: String(fd.get("roadAccess") ?? "") || null,
      maxBudget: optInt(fd.get("maxBudget")), note: String(fd.get("note") ?? ""), hoursValid: Number(fd.get("hoursValid")),
    });
  } catch (e) {
    if (e instanceof RequestError) return { error: e.message };
    console.error(e);
    return { error: "Không gửi được, thử lại" };
  }
  revalidatePath("/broker/requests");
  return {};
}

export async function closeRequestAction(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!uuid.safeParse(id).success) return { error: "Không hợp lệ" };
  try { await closeRequest(user.id, id); } catch (e) { if (e instanceof RequestError) return { error: e.message }; throw e; }
  revalidatePath("/broker/requests");
  return {};
}

export async function chooseOfferAction(offerId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!uuid.safeParse(offerId).success) return { error: "Không hợp lệ" };
  let to: string;
  try {
    const r = await chooseOffer(user.id, offerId);
    to = `/broker/book/${r.propertyId}?checkIn=${r.checkIn}&checkOut=${r.checkOut}`;
  } catch (e) {
    if (e instanceof RequestError) return { error: e.message };
    throw e;
  }
  revalidatePath("/broker/requests");
  redirect(to);
}

export async function createOfferAction(requestId: string, propertyId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(requestId).success || !uuid.safeParse(propertyId).success) return { error: "Không hợp lệ" };
  const price = optInt(fd.get("price"));
  if (price === null) return { error: "Nhập giá Net" };
  try {
    await createOffer(user.id, requestId, propertyId, price, String(fd.get("note") ?? ""));
  } catch (e) {
    if (e instanceof RequestError) return { error: e.message };
    console.error(e);
    return { error: "Không gửi được, thử lại" };
  }
  revalidatePath("/host/requests");
  return {};
}
