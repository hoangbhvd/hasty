import { prisma } from "@/lib/db";
import { postCard, postSystemMessage } from "@/lib/booking-chat";
import { emitToUsers } from "@/lib/realtime";
import { notifyUsers } from "@/lib/notify";
import { formatVnd } from "@/lib/format";
import { ledger, type Ledger } from "@/lib/ledger";
import type { Prisma } from "@/generated/prisma/client";

export class FinanceError extends Error {}
export type PartyRole = "HOST" | "BROKER";
const MAX_MONEY = 10_000_000_000;

/** Booking đầy đủ + vai trò của người xem (HOST/BROKER). null nếu không phải bên liên quan. */
export async function getBookingForParty(userId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, OR: [{ hostId: userId }, { brokerId: userId }] },
    include: {
      property: { select: { id: true, name: true, sourceType: true, createdByBrokerId: true } },
      rooms: { include: { room: { select: { name: true } } } },
      addons: { orderBy: { id: "asc" } },
      transactions: { orderBy: { createdAt: "asc" } },
      host: { select: { fullName: true, phone: true } },
      broker: { select: { fullName: true, phone: true } },
    },
  });
  if (!booking) return null;
  const role: PartyRole = booking.hostId === userId ? "HOST" : "BROKER";
  return { booking, role, external: booking.property.sourceType === "BROKER_EXTERNAL" };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof getBookingForParty>>>;

async function mustParty(userId: string, bookingId: string): Promise<Loaded> {
  const l = await getBookingForParty(userId, bookingId);
  if (!l) throw new FinanceError("Không tìm thấy booking");
  return l;
}

/** Dạng tối thiểu của booking để tính sổ (dùng cả cho trang chi tiết lẫn dashboard). */
export type LedgerBooking = {
  guestTotalPrice: unknown; hostNetPrice: unknown; extraFees: unknown; status: string;
  hostId: string | null; brokerId: string | null;
  addons: { quantity: number; guestPrice: unknown; netPrice: unknown }[];
  transactions: { payerRole: "GUEST" | "BROKER" | "HOST"; receiverRole: "BROKER" | "HOST"; amount: unknown; status: "PENDING_CONFIRM" | "CONFIRMED" | "REJECTED" }[];
};

export function bookingLedger(b: LedgerBooking): Ledger {
  return ledger(
    {
      guestTotalPrice: Number(b.guestTotalPrice), hostNetPrice: Number(b.hostNetPrice), extraFees: Number(b.extraFees),
      cancelled: b.status === "CANCELLED", hasHost: !!b.hostId, hasBroker: !!b.brokerId,
    },
    b.addons.map((a) => ({ quantity: a.quantity, guestPrice: Number(a.guestPrice), netPrice: Number(a.netPrice) })),
    b.transactions.map((t) => ({ payerRole: t.payerRole, receiverRole: t.receiverRole, amount: Number(t.amount), status: t.status })),
  );
}

const money = (n: number, label: string, min = 0) => {
  if (!Number.isInteger(n) || n < min || n > MAX_MONEY) throw new FinanceError(`${label} không hợp lệ`);
  return n;
};

// ───────── Dịch vụ đi kèm ─────────
export type AddonInput = { serviceName: string; quantity: number; guestPrice: number; netPrice: number };

export async function addAddon(userId: string, bookingId: string, i: AddonInput) {
  const { booking } = await mustParty(userId, bookingId);
  if (booking.status === "CANCELLED") throw new FinanceError("Booking đã huỷ");
  const name = i.serviceName.trim();
  if (name.length < 1 || name.length > 80) throw new FinanceError("Tên dịch vụ không hợp lệ");
  if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100) throw new FinanceError("Số lượng không hợp lệ");
  money(i.guestPrice, "Giá bán"); money(i.netPrice, "Giá Net");
  if (i.netPrice > i.guestPrice) throw new FinanceError("Giá Net không được cao hơn giá bán");
  return prisma.bookingAddon.create({ data: { bookingId, serviceName: name, quantity: i.quantity, guestPrice: i.guestPrice, netPrice: i.netPrice } });
}

export async function deleteAddon(userId: string, addonId: string) {
  const a = await prisma.bookingAddon.findUnique({ where: { id: addonId }, select: { bookingId: true } });
  if (!a) throw new FinanceError("Không tìm thấy dịch vụ");
  const { booking } = await mustParty(userId, a.bookingId);
  if (booking.status === "CANCELLED") throw new FinanceError("Booking đã huỷ");
  await prisma.bookingAddon.delete({ where: { id: addonId } });
  return a.bookingId;
}

// ───────── Phụ thu check-out ─────────
export async function setExtraFees(userId: string, bookingId: string, amount: number) {
  const { booking, role, external } = await mustParty(userId, bookingId);
  // Phụ thu thuộc về chủ nhà: Host đặt cho căn trên app; Broker chỉ đặt được cho căn ngoài app của mình
  if (role === "BROKER" && !external) throw new FinanceError("Chỉ chủ nhà mới ghi phụ thu cho căn này");
  if (!["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(booking.status)) throw new FinanceError("Chỉ ghi phụ thu khi booking đã xác nhận");
  money(amount, "Phụ thu");
  return prisma.booking.update({ where: { id: bookingId }, data: { extraFees: amount } });
}

// ───────── Giao dịch ─────────
export type Direction = "GUEST>BROKER" | "GUEST>HOST" | "BROKER>HOST" | "HOST>BROKER";
export type TxType = "DEPOSIT" | "BALANCE" | "COMMISSION_SETTLEMENT" | "REFUND";

const DIRECTIONS: Record<Direction, { payer: "GUEST" | "BROKER" | "HOST"; receiver: "BROKER" | "HOST" }> = {
  "GUEST>BROKER": { payer: "GUEST", receiver: "BROKER" },
  "GUEST>HOST": { payer: "GUEST", receiver: "HOST" },
  "BROKER>HOST": { payer: "BROKER", receiver: "HOST" },
  "HOST>BROKER": { payer: "HOST", receiver: "BROKER" },
};
const ALLOWED: Record<TxType, Direction[]> = {
  DEPOSIT: ["GUEST>BROKER", "GUEST>HOST", "BROKER>HOST"],
  BALANCE: ["GUEST>BROKER", "GUEST>HOST", "BROKER>HOST"],
  COMMISSION_SETTLEMENT: ["HOST>BROKER"],
  REFUND: ["HOST>BROKER", "BROKER>HOST"],
};

/** Các hướng chuyển tiền hợp lệ của 1 booking (phụ thuộc có Host/Broker hay không). */
export function directionsFor(hasHost: boolean, hasBroker: boolean): Direction[] {
  return (Object.keys(DIRECTIONS) as Direction[]).filter((d) => {
    const { payer, receiver } = DIRECTIONS[d];
    const need = (r: string) => (r === "HOST" ? hasHost : r === "BROKER" ? hasBroker : true);
    return need(payer) && need(receiver);
  });
}

export type TxInput = { direction: Direction; txType: TxType; amount: number; billImageUrl?: string | null };

export async function createTransaction(userId: string, bookingId: string, i: TxInput) {
  const { booking, external } = await mustParty(userId, bookingId);
  const dir = DIRECTIONS[i.direction];
  if (!dir || !ALLOWED[i.txType]?.includes(i.direction)) throw new FinanceError("Loại giao dịch và hướng chuyển tiền không khớp");
  if (!directionsFor(!!booking.hostId, !!booking.brokerId).includes(i.direction)) throw new FinanceError("Booking này không có bên nhận/chuyển tiền đó");
  const amount = money(i.amount, "Số tiền", 1);

  const receiverUserId = dir.receiver === "HOST" ? booking.hostId : booking.brokerId;
  // Tự xác nhận khi chính bên nhận tiền ghi nhận, hoặc căn ngoài app (Broker tự quản — mục 4.4)
  const autoConfirm = external || receiverUserId === userId;

  const tx = await prisma.$transaction(async (db) => {
    const t = await db.transaction.create({
      data: {
        bookingId, payerRole: dir.payer, receiverRole: dir.receiver, amount, txType: i.txType,
        billImageUrl: i.billImageUrl ?? null,
        status: autoConfirm ? "CONFIRMED" : "PENDING_CONFIRM",
        confirmedAt: autoConfirm ? new Date() : null,
      },
    });
    await postSystemMessage(db, bookingId, autoConfirm
      ? `Đã ghi nhận giao dịch ${formatVnd(amount)} (${i.txType}).`
      : `Có giao dịch ${formatVnd(amount)} (${i.txType}) đang chờ ${dir.receiver === "HOST" ? "chủ nhà" : "CTV"} xác nhận.`);
    return t;
  });
  // Thẻ bill trong chat của booking (trạng thái hiển thị lấy từ DB nên tự cập nhật khi duyệt)
  const card = await postCard(prisma, bookingId, "ACTION_BILL_UPLOAD", `Giao dịch ${formatVnd(amount)}`, { transactionId: tx.id, bookingId, bookingCode: booking.bookingCode });
  if (card) await emitToUsers([booking.hostId, booking.brokerId], "chat:update", { conversationId: card.conv.id });
  if (!autoConfirm) await notifyUsers([receiverUserId], `Giao dịch ${formatVnd(amount)} chờ bạn xác nhận — booking ${booking.bookingCode}`, `/${dir.receiver === "HOST" ? "host" : "broker"}/bookings/${bookingId}`);
  return tx;
}

/** Bên nhận tiền duyệt hoặc từ chối giao dịch đang chờ. */
export async function decideTransaction(userId: string, txId: string, decision: "CONFIRM" | "REJECT") {
  const tx = await prisma.transaction.findUnique({ where: { id: txId }, include: { booking: { select: { id: true, hostId: true, brokerId: true, bookingCode: true } } } });
  if (!tx) throw new FinanceError("Không tìm thấy giao dịch");
  const receiverUserId = tx.receiverRole === "HOST" ? tx.booking.hostId : tx.booking.brokerId;
  if (receiverUserId !== userId) throw new FinanceError("Chỉ bên nhận tiền mới được duyệt giao dịch");

  const r = await prisma.transaction.updateMany({
    where: { id: txId, status: "PENDING_CONFIRM" }, // nguyên tử: chỉ 1 người quyết định thành công
    data: { status: decision === "CONFIRM" ? "CONFIRMED" : "REJECTED", confirmedAt: decision === "CONFIRM" ? new Date() : null },
  });
  if (r.count === 0) throw new FinanceError("Giao dịch đã được xử lý");
  await postSystemMessage(prisma, tx.booking.id, decision === "CONFIRM"
    ? `Đã xác nhận giao dịch ${formatVnd(Number(tx.amount))}.`
    : `Đã từ chối giao dịch ${formatVnd(Number(tx.amount))}.`);
  await emitToUsers([tx.booking.hostId, tx.booking.brokerId], "chat:update", { bookingId: tx.booking.id });
  const payerUserId = tx.payerRole === "HOST" ? tx.booking.hostId : tx.payerRole === "BROKER" ? tx.booking.brokerId : null;
  await notifyUsers([payerUserId], `Giao dịch ${formatVnd(Number(tx.amount))} booking ${tx.booking.bookingCode} đã ${decision === "CONFIRM" ? "được xác nhận" : "bị từ chối"}`);
  return tx.booking.id;
}

export type FinanceDb = Prisma.TransactionClient;
