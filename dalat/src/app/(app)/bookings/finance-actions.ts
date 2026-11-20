"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import {
  addAddon, createTransaction, decideTransaction, deleteAddon, FinanceError, setExtraFees,
  type Direction, type TxType,
} from "@/lib/booking-finance";
import { billPrefix, publicUrlFor, r2Configured } from "@/lib/r2";
import type { FormState } from "@/app/(auth)/actions";

const uuid = z.uuid();

async function run(f: () => Promise<unknown>, paths: string[]): Promise<FormState> {
  try {
    await f();
  } catch (e) {
    if (e instanceof FinanceError) return { error: e.message };
    console.error(e);
    return { error: "Không thực hiện được, thử lại" };
  }
  for (const p of paths) revalidatePath(p);
  return {};
}

const refresh = (bookingId: string) => [`/host/bookings/${bookingId}`, `/broker/bookings/${bookingId}`, "/host/finance", "/broker/finance"];
const num = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

export async function addAddonAction(bookingId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(bookingId).success) return { error: "Booking không hợp lệ" };
  return run(() => addAddon(user.id, bookingId, {
    serviceName: String(fd.get("serviceName") ?? ""), quantity: num(fd.get("quantity")),
    guestPrice: num(fd.get("guestPrice")), netPrice: num(fd.get("netPrice")),
  }), refresh(bookingId));
}

export async function deleteAddonAction(bookingId: string, addonId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!uuid.safeParse(addonId).success) return { error: "Không hợp lệ" };
  return run(() => deleteAddon(user.id, addonId), refresh(bookingId)) as Promise<{ error?: string }>;
}

export async function setExtraFeesAction(bookingId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(bookingId).success) return { error: "Booking không hợp lệ" };
  return run(() => setExtraFees(user.id, bookingId, num(fd.get("extraFees"))), refresh(bookingId));
}

const DIRS = ["GUEST>BROKER", "GUEST>HOST", "BROKER>HOST", "HOST>BROKER", "HOST>GUEST", "BROKER>GUEST"] as const;
const TYPES = ["DEPOSIT", "BALANCE", "COMMISSION_SETTLEMENT", "REFUND"] as const;

export async function createTransactionAction(bookingId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!uuid.safeParse(bookingId).success) return { error: "Booking không hợp lệ" };
  const direction = String(fd.get("direction") ?? "") as Direction;
  const txType = String(fd.get("txType") ?? "") as TxType;
  if (!DIRS.includes(direction) || !TYPES.includes(txType)) return { error: "Chọn loại giao dịch" };

  // Ảnh bill: chỉ nhận key nằm đúng thư mục bills/<bookingId>/ (chống trỏ tới file của booking khác)
  let billImageUrl: string | null = null;
  const key = String(fd.get("billKey") ?? "");
  if (key) {
    if (!r2Configured() || !key.startsWith(billPrefix(bookingId)) || key.includes("..")) return { error: "Ảnh bill không hợp lệ" };
    billImageUrl = publicUrlFor(key);
  }
  return run(() => createTransaction(user.id, bookingId, { direction, txType, amount: num(fd.get("amount")), billImageUrl }), refresh(bookingId));
}

export async function decideTransactionAction(bookingId: string, txId: string, decision: "CONFIRM" | "REJECT"): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!uuid.safeParse(txId).success || !["CONFIRM", "REJECT"].includes(decision)) return { error: "Không hợp lệ" };
  return run(() => decideTransaction(user.id, txId, decision), refresh(bookingId)) as Promise<{ error?: string }>;
}

