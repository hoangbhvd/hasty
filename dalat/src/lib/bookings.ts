import { effectiveAccess, staffMay } from "@/lib/staff";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { occupyingWhere, roomsAvailable, wholeUnitAvailable, type OccupyingBooking } from "@/lib/availability";
import { nightsBetween, quote, type SpecialRow, type Tier } from "@/lib/pricing";
import { postSystemMessage } from "@/lib/booking-chat";
import { todayVn } from "@/lib/format";

export class BookingError extends Error {}

export const HOLD_MINUTES = 30;
const MAX_NIGHTS = 60;
type Db = typeof prisma | Prisma.TransactionClient;

export type CreateInput = {
  actorId: string;
  as: "HOST" | "BROKER";
  propertyId: string;
  mode: "HOLD" | "CONFIRM";
  bookingType: "WHOLE_UNIT" | "ROOMS";
  roomIds: string[];
  checkIn: Date;
  checkOut: Date;
  guestName: string;
  guestPhone?: string;
  guestCount: number; // số người lớn
  childCount?: number;
  guestNote?: string;
  guestTotalPrice?: number;
  /** Giá khách trả từng đêm, đúng số đêm; chỉ lưu khi tổng khớp guestTotalPrice */
  nightlyPrices?: number[];
  hostNetPrice?: number; // chỉ dùng cho căn ngoài app
  manualRoomInfo?: string; // chỉ dùng cho căn ngoài app
};

/** [{date, amount}] nếu số đêm và tổng khớp; ngược lại không lưu. */
function nightlyJson(checkIn: Date, checkOut: Date, amounts: number[] | undefined, total: number) {
  const nights = nightsBetween(checkIn, checkOut);
  if (!amounts || amounts.length !== nights.length || amounts.some((a) => !Number.isFinite(a) || a < 0)) return undefined;
  if (amounts.reduce((s, a) => s + a, 0) !== total) return undefined;
  return nights.map((d, i) => ({ date: d.toISOString().slice(0, 10), amount: amounts[i] }));
}

const dec = (n: Prisma.Decimal | number | null | undefined) => (n === null || n === undefined ? null : Number(n));

/** Các booking đang chiếm lịch của nhiều căn trong khoảng ngày (dùng cho tìm phòng & lịch). */
export async function fetchOccupying(db: Db, propertyIds: string[], checkIn: Date, checkOut: Date, now = new Date()) {
  const rows = await db.booking.findMany({
    where: { propertyId: { in: propertyIds }, ...occupyingWhere(checkIn, checkOut, now) },
    select: { id: true, propertyId: true, bookingType: true, rooms: { select: { roomId: true } } },
  });
  const byProperty = new Map<string, OccupyingBooking[]>();
  for (const r of rows) {
    const list = byProperty.get(r.propertyId) ?? [];
    list.push({ bookingType: r.bookingType, roomIds: r.rooms.map((x) => x.roomId) });
    byProperty.set(r.propertyId, list);
  }
  return byProperty;
}

export async function specialRows(db: Db, propertyId: string, checkIn: Date, checkOut: Date): Promise<SpecialRow[]> {
  const rows = await db.specialPrice.findMany({
    where: { propertyId, date: { gte: checkIn, lt: checkOut } },
  });
  return rows.map((r) => ({ roomId: r.roomId, date: r.date, netPrice: Number(r.netPrice), brokerTier: r.brokerTier }));
}

type PropertyWithRooms = Prisma.PropertyGetPayload<{ include: { rooms: true } }>;

export function buildQuote(
  p: PropertyWithRooms, specials: SpecialRow[], tier: Tier | null,
  checkIn: Date, checkOut: Date, bookingType: "WHOLE_UNIT" | "ROOMS", roomIds: string[],
) {
  return quote({
    checkIn, checkOut, tier, specials,
    whole: bookingType === "WHOLE_UNIT"
      ? { name: p.name, base: { weekday: dec(p.baseWeekdayNet), weekend: dec(p.baseWeekendNet) } }
      : null,
    rooms: p.rooms
      .filter((r) => roomIds.includes(r.id))
      .map((r) => ({ id: r.id, name: r.name, base: { weekday: dec(r.baseWeekdayNet), weekend: dec(r.baseWeekendNet) } })),
  });
}

async function generateCode(tx: Prisma.TransactionClient): Promise<string> {
  const [y, m] = todayVn().split("-");
  for (let i = 0; i < 20; i++) {
    const code = `DL-${y.slice(2)}${m}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
    if (!(await tx.booking.findUnique({ where: { bookingCode: code }, select: { id: true } }))) return code;
  }
  throw new BookingError("Không tạo được mã booking, thử lại");
}

/** Tạo booking / giữ phòng. Toàn bộ chạy trong 1 transaction, khoá dòng `properties` trước khi kiểm tra trùng lịch. */
export async function createBooking(input: CreateInput) {
  const run = () =>
    prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({ where: { id: input.propertyId }, include: { rooms: true } });
      if (!property) throw new BookingError("Không tìm thấy căn");

      // ── Phân quyền ──
      let tier: Tier | null = null;
      const external = property.sourceType === "BROKER_EXTERNAL";
      if (input.as === "HOST") {
        if (external || property.hostId !== input.actorId) throw new BookingError("Không có quyền với căn này");
      } else if (external) {
        if (property.createdByBrokerId !== input.actorId) throw new BookingError("Không có quyền với căn này");
      } else {
        const link = await tx.hostBrokerLink.findFirst({
          where: { hostId: property.hostId!, brokerId: input.actorId, status: "APPROVED" },
        });
        if (!link) throw new BookingError("Bạn chưa được chủ nhà duyệt làm CTV của căn này");
        const eff = effectiveAccess(link, property.id);
        if (eff.role === "CARETAKER") throw new BookingError("Quản gia không tạo booking");
        // CTV thường phải giữ phòng 30 phút; chốt ngay chỉ dành cho Co-host hoặc CTV được chủ nhà bật "đặt ngay"
        if (input.mode === "CONFIRM" && !eff.instant) throw new BookingError("Bạn cần giữ phòng 30 phút (chủ nhà chưa bật đặt ngay cho bạn)");
        tier = link.tier;
      }
      if (input.mode === "HOLD" && (external || input.as !== "BROKER")) throw new BookingError("Chỉ CTV mới giữ phòng 30 phút trên căn của chủ nhà");

      // ── Ngày & khách ──
      const nights = Math.round((input.checkOut.getTime() - input.checkIn.getTime()) / 86_400_000);
      if (nights < 1) throw new BookingError("Ngày check-out phải sau check-in");
      if (nights > MAX_NIGHTS) throw new BookingError(`Tối đa ${MAX_NIGHTS} đêm mỗi booking`);
      const retro = input.as === "HOST" || external; // ghi nhận lại booking cũ
      if (!retro && input.checkIn.toISOString().slice(0, 10) < todayVn()) throw new BookingError("Ngày check-in đã qua");

      // ── Chọn đối tượng đặt ──
      let roomIds: string[] = [];
      if (!external) {
        if (input.bookingType === "WHOLE_UNIT") {
          if (!property.allowWholeUnit) throw new BookingError("Căn này không bán nguyên căn");
        } else {
          if (!property.allowIndividualRooms) throw new BookingError("Căn này không bán phòng lẻ");
          roomIds = [...new Set(input.roomIds)];
          if (roomIds.length === 0) throw new BookingError("Chọn ít nhất một phòng");
          const own = property.rooms.filter((r) => roomIds.includes(r.id));
          if (own.length !== roomIds.length) throw new BookingError("Phòng không thuộc căn này");
          if (own.reduce((s, r) => s + r.maxGuests, 0) < input.guestCount) throw new BookingError("Số khách vượt sức chứa các phòng đã chọn");
        }
      }

      // ── Khoá chéo & chống overbooking ──
      if (!external) {
        await tx.$queryRaw`SELECT id FROM properties WHERE id = ${input.propertyId}::uuid FOR UPDATE`;
        const occ = (await fetchOccupying(tx, [property.id], input.checkIn, input.checkOut)).get(property.id) ?? [];
        const ok = input.bookingType === "WHOLE_UNIT" ? wholeUnitAvailable(occ) : roomsAvailable(occ, roomIds);
        if (!ok) throw new BookingError("Ngày này đã có booking hoặc đang được giữ, không còn trống");
      }

      // ── Giá ──
      const q = external && !(property.baseWeekdayNet || property.baseWeekendNet)
        ? null
        : buildQuote(property, await specialRows(tx, property.id, input.checkIn, input.checkOut), tier,
            input.checkIn, input.checkOut, external ? "WHOLE_UNIT" : input.bookingType, roomIds);
      const quoteOk = q !== null && q.missing.length === 0;

      let guestTotal: number;
      let hostNet: number;
      if (input.as === "HOST") {
        const g = input.guestTotalPrice ?? (quoteOk ? q.total : undefined);
        if (g === undefined) throw new BookingError("Nhập tổng tiền khách (chưa cấu hình giá Net cho căn/phòng)");
        guestTotal = hostNet = g;
      } else if (external) {
        const n = input.hostNetPrice ?? (quoteOk ? q.total : undefined);
        if (n === undefined) throw new BookingError("Nhập giá chủ thu về (Net)");
        if (input.guestTotalPrice === undefined) throw new BookingError("Nhập giá bán cho khách");
        hostNet = n;
        guestTotal = input.guestTotalPrice;
      } else {
        if (!quoteOk) throw new BookingError(`Chưa có giá Net cho: ${q?.missing.join(", ")}. Liên hệ chủ nhà.`);
        hostNet = q.total;
        guestTotal = input.guestTotalPrice ?? hostNet;
      }
      if (input.as === "BROKER" && guestTotal < hostNet) throw new BookingError("Giá bán cho khách không được thấp hơn giá Net");

      const holding = input.mode === "HOLD";
      const booking = await tx.booking.create({
        data: {
          bookingCode: await generateCode(tx),
          propertyId: property.id,
          hostId: external ? null : property.hostId,
          brokerId: input.as === "BROKER" ? input.actorId : null,
          bookingType: external ? "EXTERNAL_MANUAL" : input.bookingType,
          manualRoomInfo: external ? (input.manualRoomInfo ?? null) : null,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guestName: input.guestName,
          guestPhone: input.guestPhone ?? null,
          guestCount: input.guestCount,
          childCount: input.childCount ?? 0,
          guestNote: input.guestNote ?? null,
          status: holding ? "HOLDING" : "CONFIRMED",
          holdExpiresAt: holding ? new Date(Date.now() + HOLD_MINUTES * 60_000) : null,
          nightlyPrices: nightlyJson(input.checkIn, input.checkOut, input.nightlyPrices, guestTotal),
          guestTotalPrice: guestTotal,
          hostNetPrice: hostNet,
          commissionAmount: guestTotal - hostNet,
          rooms: roomIds.length ? { create: roomIds.map((roomId) => ({ roomId })) } : undefined,
        },
      });
      await postSystemMessage(
        tx, booking.id,
        holding
          ? `CTV đã giữ phòng cho khách ${booking.guestName}. Tự nhả sau ${HOLD_MINUTES} phút nếu chưa xác nhận.`
          : `Booking ${booking.bookingCode} đã được tạo cho khách ${booking.guestName}.`,
      );
      return booking;
    }, { timeout: 15_000 });

  try {
    return await run();
  } catch (e) {
    // Va chạm mã booking (hiếm): thử lại 1 lần
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return await run();
    throw e;
  }
}

// ───────── Chuyển trạng thái ─────────
export type Transition = "CONFIRM" | "CHECK_IN" | "CHECK_OUT" | "CANCEL";

export async function transitionBooking(actorId: string, bookingId: string, action: Transition) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { property: true } });
    let allowed = b && (b.hostId === actorId || b.brokerId === actorId || b.property.createdByBrokerId === actorId);
    if (b && !allowed && b.property.sourceType === "HOST_MANAGED" && b.property.hostId) {
      // Co-host / Quản gia của chủ nhà (chỉ ở các căn được chỉ định) làm được các thao tác trong quyền của vai trò
      const link = await tx.hostBrokerLink.findFirst({ where: { hostId: b.property.hostId, brokerId: actorId, status: "APPROVED" } });
      if (link) { const eff = effectiveAccess(link, b.propertyId); allowed = !eff.none && staffMay(eff.role, action); }
    }
    if (!b || !allowed) throw new BookingError("Không tìm thấy booking");

    if (b.property.sourceType === "HOST_MANAGED") {
      // Giữ cùng khoá với lúc tạo để không chạy đua với booking khác
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${b.propertyId}::uuid FOR UPDATE`;
    }
    const fresh = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    const now = new Date();
    let data: Prisma.BookingUpdateInput;
    let msg: string;

    switch (action) {
      case "CONFIRM":
        if (fresh.status !== "HOLDING") throw new BookingError("Chỉ xác nhận được booking đang giữ phòng");
        if (!fresh.holdExpiresAt || fresh.holdExpiresAt <= now) throw new BookingError("Giữ phòng đã hết hạn, hãy tạo lại");
        data = { status: "CONFIRMED", holdExpiresAt: null };
        msg = "Booking đã được xác nhận.";
        break;
      case "CHECK_IN":
        if (fresh.status !== "CONFIRMED") throw new BookingError("Chỉ check-in được booking đã xác nhận");
        data = { status: "CHECKED_IN" };
        msg = "Khách đã check-in.";
        break;
      case "CHECK_OUT":
        if (fresh.status !== "CHECKED_IN") throw new BookingError("Chỉ check-out được booking đang ở");
        data = { status: "CHECKED_OUT" };
        msg = "Khách đã check-out.";
        break;
      case "CANCEL":
        if (fresh.status === "CANCELLED" || fresh.status === "CHECKED_OUT") throw new BookingError("Booking đã kết thúc");
        data = { status: "CANCELLED", holdExpiresAt: null };
        msg = "Booking đã bị huỷ.";
        break;
    }
    const updated = await tx.booking.update({ where: { id: bookingId }, data });
    await postSystemMessage(tx, bookingId, msg);
    return updated;
  });
}

/** "Đã dọn phòng" sau check-out: chủ nhà, Co-host hoặc Quản gia được giao căn. */
export async function markCleaned(actorId: string, bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { property: { select: { hostId: true, sourceType: true } } } });
  if (!b) throw new BookingError("Không tìm thấy booking");
  let ok = b.hostId === actorId;
  if (!ok && b.property.sourceType === "HOST_MANAGED" && b.property.hostId) {
    const link = await prisma.hostBrokerLink.findFirst({ where: { hostId: b.property.hostId, brokerId: actorId, status: "APPROVED" } });
    if (link) { const eff = effectiveAccess(link, b.propertyId); ok = !eff.none && staffMay(eff.role, "CLEAN"); }
  }
  if (!ok) throw new BookingError("Không tìm thấy booking");
  if (b.status !== "CHECKED_OUT") throw new BookingError("Chỉ đánh dấu dọn phòng sau khi khách đã check-out");
  if (b.cleanedAt) return b;
  return prisma.booking.update({ where: { id: bookingId }, data: { cleanedAt: new Date() } });
}

export type EditInput = { guestName: string; guestPhone?: string | null; guestCount: number; childCount?: number; guestNote?: string | null; manualRoomInfo?: string | null;
  /** Sửa giá (tuỳ chọn): tổng khách trả, giá Net (chỉ căn ngoài app), giá từng đêm */
  guestTotalPrice?: number; hostNetPrice?: number; nightlyPrices?: number[] };

/** Người tạo booking (CTV, hoặc chủ nhà khi tự tạo) sửa thông tin khách. Ngày, phòng và giá không đổi ở đây. */
export async function editBooking(actorId: string, bookingId: string, input: EditInput) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { rooms: { include: { room: true } } } });
    if (!b || (b.brokerId ?? b.hostId) !== actorId) throw new BookingError("Chỉ người tạo booking mới được sửa");
    if (b.status === "CANCELLED" || b.status === "CHECKED_OUT") throw new BookingError("Booking đã kết thúc, không sửa được");
    if (b.status === "HOLDING" && b.holdExpiresAt && b.holdExpiresAt <= new Date()) throw new BookingError("Giữ phòng đã hết hạn");
    if (b.bookingType === "ROOMS" && b.rooms.reduce((s, r) => s + r.room.maxGuests, 0) < input.guestCount) {
      throw new BookingError("Số khách vượt sức chứa các phòng đã đặt");
    }
    // ── Giá ──
    let priceData: Prisma.BookingUpdateInput = {};
    let priceMsg = "";
    if (input.guestTotalPrice !== undefined) {
      const oldGuest = Number(b.guestTotalPrice), oldNet = Number(b.hostNetPrice);
      const guest = input.guestTotalPrice;
      let net: number;
      if (b.brokerId === actorId) {
        net = b.bookingType === "EXTERNAL_MANUAL" ? (input.hostNetPrice ?? oldNet) : oldNet; // căn trong app: Net đổi qua thương lượng
        if (guest < net) throw new BookingError("Giá bán cho khách không được thấp hơn giá Net");
      } else {
        net = guest; // chủ nhà tự tạo: tiền khách = tiền chủ thu
      }
      if (guest !== oldGuest || net !== oldNet || input.nightlyPrices) {
        priceData = {
          guestTotalPrice: guest, hostNetPrice: net, commissionAmount: guest - net,
          nightlyPrices: nightlyJson(b.checkIn, b.checkOut, input.nightlyPrices, guest) ?? Prisma.DbNull,
        };
        if (guest !== oldGuest || net !== oldNet) priceMsg = ` Giá khách trả: ${oldGuest.toLocaleString("vi-VN")}đ → ${guest.toLocaleString("vi-VN")}đ.`;
      }
    }
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        ...priceData,
        guestName: input.guestName, guestPhone: input.guestPhone ?? null, guestCount: input.guestCount, childCount: input.childCount ?? 0, guestNote: input.guestNote ?? null,
        ...(b.bookingType === "EXTERNAL_MANUAL" ? { manualRoomInfo: input.manualRoomInfo ?? null } : {}),
      },
    });
    await postSystemMessage(tx, bookingId, `Người tạo đã cập nhật thông tin booking.${priceMsg}`);
    return updated;
  });
}
