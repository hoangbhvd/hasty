import type { VoucherData } from "@/lib/voucher";
import type { VoucherConfig } from "@/lib/voucher-config";

/** Dữ liệu giả lập cho bản xem trước trong Voucher Studio (không phải booking thật). */
export function sampleVoucher(config: VoucherConfig, over: Partial<VoucherData> = {}): VoucherData {
  return {
    bookingCode: "DL-2606-889", status: "CONFIRMED", propertyName: "Homestay của bạn", roomLabel: "Nguyên căn 4 phòng",
    checkIn: "2026-06-12", checkOut: "2026-06-14", nights: 2, guestName: "Nguyễn Văn Ánh", guestPhone: "0900 111 222", guestCount: 4,
    address: "12 Hẻm Thông, P.3, Đà Lạt", pricePerNight: 2_000_000, roomTotal: 4_000_000, extraFees: 0, addons: [],
    grandTotal: 4_000_000, paid: 1_000_000, remaining: 3_000_000, mapsUrl: "https://maps.google.com/?q=Da+Lat",
    checkinGuide: null, houseRules: null, caretakerPhone: "0933 444 555", supportPhone: "0911 222 333", supportLabel: "Chủ nhà",
    hasQr: false, config, ...over,
  };
}
