"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { BookingError, createBooking, markCleaned, transitionBooking, type Transition } from "@/lib/bookings";
import { accessOnProperty } from "@/lib/staff";
import { prisma } from "@/lib/db";
import { cancelBookingJobs, scheduleCheckinReminder, scheduleHoldExpiry } from "@/lib/queue";
import { notifyUsers } from "@/lib/notify";
import { emitToUsers } from "@/lib/realtime";
import { normalizePhone } from "@/lib/phone";
import { parseDateOnly, toDateOnly } from "@/lib/format";
import { optMoney, optPhone, optText } from "@/lib/validators";
import type { FormState } from "@/app/(auth)/actions";

const schema = z.object({
  as: z.enum(["HOST", "BROKER"]),
  mode: z.enum(["HOLD", "CONFIRM"]),
  propertyId: z.uuid(),
  bookingType: z.enum(["WHOLE_UNIT", "ROOMS"]),
  roomIds: z.array(z.uuid()),
  checkIn: z.string(),
  checkOut: z.string(),
  guestName: z.string().trim().min(2, "Nhập tên khách").max(100),
  guestPhone: optPhone,
  guestCount: z.coerce.number().int().min(1, "Số khách tối thiểu 1").max(100),
  guestNote: optText,
  guestTotalPrice: optMoney,
  hostNetPrice: optMoney,
  manualRoomInfo: optText,
});

export async function createBookingAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(fd.entries());
  const parsed = schema.safeParse({ ...raw, roomIds: fd.getAll("roomIds").map(String) });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  if (v.as === "HOST" && !user.isHost) return { error: "Tài khoản chưa bật chế độ Chủ nhà" };
  if (v.as === "BROKER" && !user.isBroker) return { error: "Tài khoản chưa bật chế độ CTV" };
  const checkIn = parseDateOnly(v.checkIn);
  const checkOut = parseDateOnly(v.checkOut);
  if (!checkIn || !checkOut) return { error: "Ngày không hợp lệ" };

  let booking;
  try {
    booking = await createBooking({
      actorId: user.id, as: v.as, mode: v.mode, propertyId: v.propertyId, bookingType: v.bookingType,
      roomIds: v.roomIds, checkIn, checkOut, guestName: v.guestName,
      guestPhone: v.guestPhone ? (normalizePhone(v.guestPhone) ?? v.guestPhone) : undefined,
      guestCount: v.guestCount, guestNote: v.guestNote,
      guestTotalPrice: v.guestTotalPrice, hostNetPrice: v.hostNetPrice, manualRoomInfo: v.manualRoomInfo,
    });
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    console.error(e);
    return { error: "Không tạo được booking, thử lại" };
  }

  // Job nền (lỗi Redis không làm hỏng booking — worker còn có job quét dự phòng)
  if (booking.status === "HOLDING" && booking.holdExpiresAt) await scheduleHoldExpiry(booking.id, booking.holdExpiresAt);
  if (booking.status === "CONFIRMED") await scheduleCheckinReminder(booking.id, booking.checkIn);
  const access = v.as === "BROKER" && booking.status === "CONFIRMED" ? await accessOnProperty(user.id, booking.propertyId) : null;
  if (access?.role === "CO_HOST") {
    // Co-host chốt ngay không qua chủ duyệt → báo chủ nhà
    const prop = await prisma.property.findUnique({ where: { id: booking.propertyId }, select: { name: true } });
    await notifyUsers([booking.hostId], `Co-host ${user.fullName} vừa chốt đơn mới tại ${prop?.name ?? "căn"} ngày ${v.checkIn} - ${v.checkOut}`, `/host/bookings/${booking.id}`);
  } else {
    await notifyUsers([booking.hostId === user.id ? null : booking.hostId], `Booking mới ${booking.bookingCode} — ${booking.guestName}`, `/host/bookings/${booking.id}`);
  }
  await emitToUsers([booking.hostId, booking.brokerId], "booking:update", { bookingId: booking.id, propertyId: booking.propertyId });

  revalidatePath("/host/calendar");
  revalidatePath("/broker/bookings");
  redirect(
    v.as === "HOST"
      ? `/host/calendar?property=${booking.propertyId}&from=${toDateOnly(checkIn)}`
      : "/broker/bookings",
  );
}

export async function transitionAction(bookingId: string, action: Transition): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(bookingId).success) return { error: "Booking không hợp lệ" };
  try {
    const b = await transitionBooking(user.id, bookingId, action);
    if (action === "CANCEL") await cancelBookingJobs(b.id);
    const LABEL = { CONFIRM: "đã được xác nhận", CHECK_IN: "khách đã check-in", CHECK_OUT: "khách đã check-out", CANCEL: "đã bị huỷ" } as const;
    await notifyUsers([b.hostId, b.brokerId].filter((x) => x !== user.id), `Booking ${b.bookingCode} ${LABEL[action]}`, `/${b.hostId === user.id ? "broker" : "host"}/bookings/${b.id}`);
    await emitToUsers([b.hostId, b.brokerId], "booking:update", { bookingId: b.id, propertyId: b.propertyId });
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    console.error(e);
    return { error: "Không thực hiện được, thử lại" };
  }
  revalidatePath("/host/calendar");
  revalidatePath("/broker/bookings");
  revalidatePath("/broker/availability");
  return {};
}

/** Quản gia / Co-host / chủ nhà: đánh dấu đã dọn phòng sau check-out. */
export async function markCleanedAction(bookingId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(bookingId).success) return { error: "Booking không hợp lệ" };
  try {
    const b = await markCleaned(user.id, bookingId);
    await notifyUsers([b.hostId].filter((x) => x && x !== user.id), `Đã dọn phòng booking ${b.bookingCode}`, `/host/bookings/${b.id}`);
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    console.error(e);
    return { error: "Không thực hiện được, thử lại" };
  }
  revalidatePath("/broker/availability");
  return {};
}
