import { MapPin } from "lucide-react";
import { formatDateVi, formatVnd, guestsText } from "@/lib/format";
import type { VoucherData } from "@/lib/voucher";
import { MapQr } from "@/components/map-qr";
import { VoucherLogo } from "@/components/voucher-logo";
import { FONT_CSS } from "@/lib/voucher-config";

const STATUS: Record<string, string> = {
  HOLDING: "ĐANG GIỮ PHÒNG", CONFIRMED: "ĐÃ XÁC NHẬN", CHECKED_IN: "ĐANG LƯU TRÚ", CHECKED_OUT: "ĐÃ TRẢ PHÒNG", CANCELLED: "ĐÃ HUỶ",
};
const dateOf = (s: string) => formatDateVi(new Date(`${s}T00:00:00Z`));
const lines = (t: string) => t.split("\n").filter((l) => l.trim());
/** "14:00" → "14H", "14:30" → "14H30" (cách ghi giờ trên phiếu giấy). */
export const hourLabel = (t: string) => { const [h, m] = t.split(":"); return `${Number(h)}H${m === "00" ? "" : m}`; };

/**
 * Mẫu "Đà Lạt Boutique": bố cục A4 dọc — dải tiêu đề màu đậm, thông tin khách + ảnh vòm, khối bảng giá & điều khoản màu nhạt,
 * cột phải có điều khoản huỷ, lời chào, QR. Màn hình hẹp (<700px) xếp thành 1 cột; khi in A4 luôn dùng bố cục 2 cột.
 * Màu lấy từ màu chủ đạo của căn (đậm/nhạt suy ra bằng color-mix).
 */
// Mẫu này không có QR thanh toán (khách trả nốt tiền mặt khi nhận nhà); QR duy nhất là link vị trí Google Maps.
export function BoutiqueView({ v }: { v: VoucherData }) {
  const { config: c } = v;
  const main = c.branding.primary_color;
  // Bảng màu theo file mẫu: dải tiêu đề & chữ = nâu đậm (#8A7063), khối giá & viền ảnh = nâu hồng nhạt (#C49C89 = màu chủ đạo)
  const dark = `color-mix(in srgb, ${main} 72%, black)`;
  const panel = main;
  const ink = dark;
  const frame = c.branding.image_frame_style === "ARCH" ? "rounded-t-[999px] rounded-b-md" : c.branding.image_frame_style === "ROUNDED" ? "rounded-2xl" : "rounded-none";
  const showCover = c.blocks.show_cover_image && !!c.branding.cover_image_url;
  const hasExtras = v.addons.length > 0 || v.extraFees > 0;
  const remaining = Math.max(v.remaining, 0);
  // Thứ tự khối (block_order) áp dụng trong 2 cột phía dưới: trái = Bảng giá ↔ Chính sách (phụ thu, điều khoản); phải = Điều khoản huỷ ↔ Lời cảm ơn
  const at = (id: (typeof c.block_order)[number]) => ({ order: c.block_order.indexOf(id) });

  return (
    <div
      id="voucher-capture" data-template="DALAT_BOUTIQUE"
      className={`@container mx-auto flex w-full max-w-[820px] flex-col overflow-hidden text-black @[700px]:min-h-[1130px] `}
      style={{ backgroundColor: c.branding.background_color, fontFamily: FONT_CSS[c.branding.font_family] }}
    >
      {/* ───── Dải tiêu đề ───── */}
      <header className="px-6 py-8 text-center text-white @[700px]:py-6" style={{ backgroundColor: dark }}>
        <VoucherLogo config={c} className="pb-3" />
        {c.blocks.show_property_name && <div className="font-serif text-4xl leading-tight font-light tracking-wide @[700px]:text-[44px]">{c.branding.brand_name || v.propertyName}</div>}
        <h1 className="pt-4 text-2xl font-light tracking-wider uppercase @[700px]:pt-2">{c.custom_texts.header_title}</h1>
        <div className="flex items-center justify-center gap-2 pt-3 text-xs tracking-[0.2em] text-white/80">
          <span className="font-mono">{v.bookingCode}</span>
          {v.status !== "CONFIRMED" && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold tracking-normal text-black">{STATUS[v.status]}</span>}
        </div>
      </header>

      {/* ───── Thông tin khách + ảnh ───── */}
      <section className="grid gap-6 px-6 py-7 @[700px]:px-11 @[700px]:py-6">
        <div className="space-y-5 text-[13px] leading-6 font-bold tracking-wide uppercase @[700px]:space-y-2.5 @[700px]:text-[13.5px] @[700px]:leading-[22px]" style={{ color: ink }}>
          <div>
            <div>Tên khách: {v.guestName}</div>
            {v.guestPhone && <div>Số điện thoại: {v.guestPhone}</div>}
            <div>Số lượng khách: {guestsText(v.guestCount, v.childCount)}</div>
          </div>
          <hr style={{ borderColor: ink }} className="max-w-sm opacity-60" />
          <div>
            <div>Hình thức thuê: {v.roomLabel}</div>
            <div>Check in: {hourLabel(c.stay_times.checkin_time)} {dateOf(v.checkIn)}</div>
            <div>Check out: {hourLabel(c.stay_times.checkout_time)} {dateOf(v.checkOut)}</div>
          </div>
          <hr style={{ borderColor: ink }} className="max-w-sm opacity-60" />
          <div>
            {v.address && <div>Địa chỉ: {v.address}</div>}
            {c.blocks.show_caretaker_phone && v.caretakerPhone && <div>Quản gia liên hệ nhận nhà: {v.caretakerPhone}</div>}
          </div>
          {v.checkinGuide && <p className="text-[13px] leading-6 font-semibold whitespace-pre-line normal-case">{v.checkinGuide}</p>}
        </div>
      </section>

      {/* ───── Khối dưới: trái (giá, phụ thu, điều khoản) | phải (huỷ, lời chào, QR) ───── */}
      <div className="grid flex-1 @[700px]:grid-cols-[54%_46%]">
        <section className="flex flex-col gap-5 px-6 py-7 text-white @[700px]:gap-3 @[700px]:py-5" style={{ backgroundColor: panel }}>
          <div className="space-y-5 @[700px]:space-y-3" style={at("PRICE_TABLE")}>
          {c.blocks.show_price_table && (
            <>
              <dl className="money-num grid grid-cols-4 divide-x divide-white/50 border border-white/50 text-center text-[13px] font-bold">
                {([["Giá 1 đêm", formatVnd(v.pricePerNight)], ["Số đêm", v.nights], ["Thành tiền", formatVnd(v.roomTotal)], ["Đã cọc", formatVnd(v.paid)]] as const).map(([k, val]) => (
                  <div key={k} className="px-1 py-3">
                    <dt className="pb-2 text-[11px] tracking-wide uppercase">{k}</dt>
                    <dd className="border-t border-white/60 pt-2">{val}</dd>
                  </div>
                ))}
              </dl>
              {hasExtras && (
                <dl className="money-num space-y-1 text-[12px] font-semibold uppercase">
                  {v.addons.map((a, i) => (
                    <div key={i} className="flex justify-between gap-3"><dt>{a.name} × {a.quantity}</dt><dd>{formatVnd(a.guestPrice * a.quantity)}</dd></div>
                  ))}
                  {v.extraFees > 0 && <div className="flex justify-between gap-3"><dt>Phụ thu</dt><dd>{formatVnd(v.extraFees)}</dd></div>}
                  <div className="flex justify-between gap-3 border-t border-white/60 pt-1 font-bold"><dt>Tổng cộng</dt><dd>{formatVnd(v.grandTotal)}</dd></div>
                </dl>
              )}
            </>
          )}
          <p className="text-center text-[13px] leading-6 font-bold uppercase">
            {remaining > 0
              ? <>Số tiền còn lại <span className="money-num">{formatVnd(remaining)}</span> quý khách thanh toán khi nhận nhà</>
              : <>Quý khách đã thanh toán đủ</>}
          </p>
          <hr className="mx-auto w-4/5 border-white/70" />
          </div>
          <div className="space-y-5 @[700px]:space-y-3" style={at("POLICIES")}>
          {c.blocks.show_surcharge_policy && c.custom_texts.surcharge_policy && (
            <div className="space-y-1">
              <h3 className="text-center text-[12px] font-bold tracking-wide uppercase italic">Chính sách phụ thu phát sinh (nếu có):</h3>
              <ol className="space-y-1 text-[11px] leading-5 uppercase @[700px]:space-y-0.5 @[700px]:text-[9.5px] @[700px]:leading-[1.35]">{lines(c.custom_texts.surcharge_policy).map((l, i) => <li key={i}>{l}</li>)}</ol>
            </div>
          )}
          {c.blocks.show_terms_conditions && c.custom_texts.terms_conditions && (
            <div className="space-y-1">
              <h3 className="text-center text-[12px] font-bold tracking-wide uppercase italic">Các điều khoản và điều kiện:</h3>
              <ol className="space-y-1 text-[11px] leading-5 uppercase @[700px]:space-y-0.5 @[700px]:text-[9.5px] @[700px]:leading-[1.35]">{lines(c.custom_texts.terms_conditions).map((l, i) => <li key={i}>{l}</li>)}</ol>
            </div>
          )}
          </div>
        </section>

        <section className="flex flex-col justify-between gap-8 px-8 py-7 @[700px]:gap-4 @[700px]:px-7 @[700px]:py-5" style={{ color: ink }}>
          {showCover && (
            // Ảnh trong khung vòm (giống file mẫu): nằm đầu cột phải, phía trên điều khoản huỷ
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.branding.cover_image_url!} alt={v.propertyName}
                className={`aspect-[140/170] w-36 border-4 object-cover ${frame}`} style={{ borderColor: dark }}
              />
            </div>
          )}
          <div className="space-y-4" style={at("POLICIES")}>
            {c.blocks.show_cancellation_policy && c.custom_texts.cancellation_policy && (
              <>
                <h3 className="text-center text-[13px] font-bold tracking-wide uppercase">Điều khoản hủy booking</h3>
                <ol className="space-y-2 text-[12px] leading-6 opacity-80 @[700px]:space-y-1.5 @[700px]:text-[11px] @[700px]:leading-5">{lines(c.custom_texts.cancellation_policy).map((l, i) => <li key={i}>{l}</li>)}</ol>
              </>
            )}
          </div>
          <div className="space-y-6" style={at("FOOTER")}>
            {c.custom_texts.footer_greeting && (
              <p className="text-center text-[12px] leading-5 font-bold whitespace-pre-line italic">{c.custom_texts.footer_greeting}</p>
            )}
            <div className="flex items-end justify-center gap-5">
              {c.blocks.show_google_maps && v.mapsUrl && (
                <a href={v.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Mở vị trí trên Google Maps" className="flex flex-col items-center gap-1 text-center" style={{ color: ink }}>
                  <span className="flex items-end gap-2">
                    <MapPin className="mb-1 size-8" strokeWidth={1.6} />
                    <MapQr url={v.mapsUrl} className="w-28" color="#000" />
                  </span>
                  <span className="text-[10px] font-semibold">Quét để xem vị trí</span>
                </a>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
