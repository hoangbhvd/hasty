import { prisma } from "@/lib/db";
import { parseVoucherConfig, type VoucherConfig } from "@/lib/voucher-config";
import { vietQrUrl } from "@/lib/vietqr";
import { nightsBetween } from "@/lib/pricing";

/**
 * DỮ LIỆU CÔNG KHAI của trang /voucher/[token].
 * Quy tắc bảo mật tuyệt đối: KHÔNG bao giờ chứa host_net_price, commission_amount, net_price của dịch vụ,
 * công nợ, id của Host/Broker. Các trường đó không được `select` từ DB, nên không thể lọt vào kết quả.
 */
export type VoucherData = {
  bookingCode: string;
  status: "HOLDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";
  propertyName: string;
  roomLabel: string;
  checkIn: string; // yyyy-mm-dd
  checkOut: string;
  nights: number;
  guestName: string;
  guestCount: number;
  pricePerNight: number; // giá khách trả trung bình 1 đêm (tiền phòng)
  roomTotal: number;
  extraFees: number;
  addons: { name: string; quantity: number; guestPrice: number }[];
  grandTotal: number;
  paid: number;
  remaining: number;
  mapsUrl: string | null;
  checkinGuide: string | null;
  houseRules: string | null;
  caretakerPhone: string | null;
  supportPhone: string | null;
  supportLabel: string;
  hasQr: boolean;
  config: VoucherConfig;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadByToken(token: string) {
  if (!UUID.test(token)) return null;
  return prisma.booking.findUnique({
    where: { voucherToken: token },
    select: {
      bookingCode: true, status: true, bookingType: true, manualRoomInfo: true,
      checkIn: true, checkOut: true, guestName: true, guestCount: true,
      guestTotalPrice: true, extraFees: true,
      hostId: true, brokerId: true, // chỉ dùng nội bộ để tìm SĐT/ngân hàng, KHÔNG trả ra ngoài
      property: { select: { name: true, googleMapsUrl: true, checkinGuide: true, houseRules: true, caretakerPhone: true, voucherConfig: true } },
      rooms: { select: { room: { select: { name: true } } } },
      addons: { select: { serviceName: true, quantity: true, guestPrice: true } }, // KHÔNG select netPrice
      transactions: { where: { payerRole: "GUEST", status: "CONFIRMED" }, select: { amount: true } },
    },
  });
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadByToken>>>;

/** Người nhận tiền thanh toán nốt: Broker nếu booking do Broker bán, ngược lại là Host. */
async function collector(b: Loaded) {
  const id = b.brokerId ?? b.hostId;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, select: { fullName: true, phone: true, bankId: true, bankAccountNo: true, bankAccountName: true } });
}

function compute(b: Loaded) {
  const nights = Math.max(nightsBetween(b.checkIn, b.checkOut).length, 1);
  const roomTotal = Number(b.guestTotalPrice);
  const extraFees = Number(b.extraFees);
  const addons = b.addons.map((a) => ({ name: a.serviceName, quantity: a.quantity, guestPrice: Number(a.guestPrice) }));
  const grandTotal = roomTotal + extraFees + addons.reduce((s, a) => s + a.guestPrice * a.quantity, 0);
  const paid = b.transactions.reduce((s, t) => s + Number(t.amount), 0);
  return { nights, roomTotal, extraFees, addons, grandTotal, paid, remaining: grandTotal - paid };
}

export async function getVoucherData(token: string): Promise<VoucherData | null> {
  const b = await loadByToken(token);
  if (!b) return null;
  const c = compute(b);
  const who = await collector(b);
  const cfg = parseVoucherConfig(b.property.voucherConfig);
  const roomLabel = b.bookingType === "WHOLE_UNIT" ? "Nguyên căn" : b.rooms.map((r) => r.room.name).join(", ") || b.manualRoomInfo || "Nguyên căn";

  return {
    bookingCode: b.bookingCode,
    status: b.status,
    propertyName: b.property.name,
    roomLabel,
    checkIn: b.checkIn.toISOString().slice(0, 10),
    checkOut: b.checkOut.toISOString().slice(0, 10),
    nights: c.nights,
    guestName: b.guestName,
    guestCount: b.guestCount,
    pricePerNight: Math.round(c.roomTotal / c.nights),
    roomTotal: c.roomTotal,
    extraFees: c.extraFees,
    addons: c.addons,
    grandTotal: c.grandTotal,
    paid: c.paid,
    remaining: c.remaining,
    mapsUrl: b.property.googleMapsUrl,
    checkinGuide: b.property.checkinGuide,
    houseRules: b.property.houseRules,
    caretakerPhone: b.property.caretakerPhone,
    supportPhone: who?.phone ?? null,
    supportLabel: b.brokerId ? "Người đặt phòng (CTV)" : "Chủ nhà",
    hasQr: !!(who?.bankId && who.bankAccountNo) && c.remaining > 0 && b.status !== "CANCELLED",
    config: cfg,
  };
}

/** URL VietQR (nội bộ server) — chứa số tài khoản nhận tiền nên không bao giờ được trả cho client dạng JSON. */
export async function getVoucherQrUrl(token: string): Promise<string | null> {
  const b = await loadByToken(token);
  if (!b || b.status === "CANCELLED") return null;
  const who = await collector(b);
  const { remaining } = compute(b);
  if (!who?.bankId || !who.bankAccountNo || remaining <= 0) return null;
  return vietQrUrl({ bankId: who.bankId, accountNo: who.bankAccountNo, accountName: who.bankAccountName, amount: remaining, info: b.bookingCode });
}
