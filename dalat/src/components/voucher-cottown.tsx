/* eslint-disable @next/next/no-img-element */
import { MapPin } from "lucide-react";
import { formatDateVi, formatVnd, guestsText } from "@/lib/format";
import { NightlyList } from "@/components/voucher-nightly";
import type { VoucherData } from "@/lib/voucher";
import { MapQr } from "@/components/map-qr";
import { VoucherLogo } from "@/components/voucher-logo";
import { hourLabel } from "@/components/voucher-boutique";

const STATUS: Record<string, string> = {
  HOLDING: "ĐANG GIỮ PHÒNG", CONFIRMED: "ĐÃ XÁC NHẬN", CHECKED_IN: "ĐANG LƯU TRÚ", CHECKED_OUT: "ĐÃ TRẢ PHÒNG", CANCELLED: "ĐÃ HUỶ",
};
const dateOf = (s: string) => formatDateVi(new Date(`${s}T00:00:00Z`));
const lines = (t: string) => t.split("\n").filter((l) => l.trim());

/**
 * Mẫu "Cottown" — dựng lại đúng theo file PDF mẫu của Cottown (A4 dọc):
 *  • dải tiêu đề + logo; khối thông tin khách bên trái, ảnh trong khung vòm bên phải;
 *  • khối màu: bảng giá 4 ô + chính sách phụ thu + điều khoản (trái); điều khoản huỷ, lời chào, QR vị trí (phải).
 * Chữ viết hoa đậm giống bản mẫu; ảnh bìa người dùng tải lên luôn nằm gọn trong khung vòm.
 * Mọi biến (tên, SĐT, số người lớn/trẻ em, ngày, giá, đã cọc, còn lại…) lấy tự động từ booking.
 * Màn hình hẹp (<700px) xếp 1 cột; khi in/xuất A4 luôn dùng bố cục 2 cột như file mẫu.
 */
export function CottownView({ v }: { v: VoucherData }) {
  const { config: c } = v;
  const main = c.branding.primary_color; // mặc định #C49C89 (khối giá)
  const head = `color-mix(in srgb, ${main} 62%, #A8431B)`; // dải tiêu đề: nâu cam đậm hơn (≈ #BB7F63)
  const ink = `color-mix(in srgb, ${main} 72%, black)`; // chữ nâu (≈ #8A7063)
  const showCover = c.blocks.show_cover_image && !!c.branding.cover_image_url;
  const hasExtras = v.addons.length > 0 || v.extraFees > 0;
  const remaining = Math.max(v.remaining, 0);
  const at = (id: (typeof c.block_order)[number]) => ({ order: c.block_order.indexOf(id) });

  return (
    <div
      id="voucher-capture" data-template="COTTOWN"
      className="@container relative mx-auto flex w-full max-w-[794px] flex-col overflow-hidden text-black @[700px]:min-h-[1123px]"
      style={{ backgroundColor: c.branding.background_color, fontFamily: "var(--font-montserrat), var(--font-be-vietnam), ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* ───── Dải tiêu đề ───── */}
      <header className="relative flex flex-col items-center justify-center px-6 py-8 text-center text-white @[700px]:min-h-[37.8mm] @[700px]:py-3" style={{ backgroundColor: head }}>
        <VoucherLogo config={c} />
        {c.blocks.show_property_name && <div className="font-serif text-4xl leading-tight font-light tracking-wide">{c.branding.brand_name || v.propertyName}</div>}
        <h1 className="pt-3 text-[20px] font-light tracking-[0.06em] uppercase @[700px]:pt-2 @[700px]:text-[23px]">{c.custom_texts.header_title}</h1>
        <div className="absolute top-2 right-3 flex items-center gap-1.5 text-[9px] tracking-[0.12em] text-white/75">
          <span className="font-mono">{v.bookingCode}</span>
          {v.status !== "CONFIRMED" && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold tracking-normal text-black">{STATUS[v.status]}</span>}
        </div>
      </header>

      <div className="grid flex-1 @[700px]:grid-cols-[57%_43%] @[700px]:grid-rows-[77.9mm_1fr]">
        {/* ───── Thông tin khách ───── */}
        <section className="px-6 py-7 @[700px]:py-0 @[700px]:pt-[8mm] @[700px]:pr-0 @[700px]:pl-[11.8mm]" style={{ color: ink }}>
          <div className="space-y-4 text-[13px] leading-6 font-bold uppercase @[700px]:space-y-[4.2mm] @[700px]:text-[12.8px] @[700px]:leading-[4.8mm]">
            <div>
              <div>Tên khách: {v.guestName}</div>
              {v.guestPhone && <div>Số điện thoại: {v.guestPhone}</div>}
              <div>Số lượng khách: {guestsText(v.guestCount, v.childCount)}</div>
            </div>
            <hr style={{ borderColor: ink }} className="max-w-[93mm]" />
            <div>
              <div>Hình thức thuê: {v.roomLabel}</div>
              <div>Check in: {hourLabel(c.stay_times.checkin_time)} {dateOf(v.checkIn)}</div>
              <div>Check out: {hourLabel(c.stay_times.checkout_time)} {dateOf(v.checkOut)}</div>
            </div>
            <hr style={{ borderColor: ink }} className="max-w-[93mm]" />
            <div>
              {v.address && <div>Địa chỉ: {v.address}</div>}
              {c.blocks.show_caretaker_phone && v.caretakerPhone && <div>Quản gia liên hệ nhận nhà: {v.caretakerPhone}</div>}
            </div>
            {v.checkinGuide && <p className="text-[12px] leading-5 font-semibold whitespace-pre-line normal-case">{v.checkinGuide}</p>}
          </div>
        </section>

        {/* ───── Ảnh trong khung vòm ───── */}
        <div className="flex justify-center px-6 @[700px]:items-start @[700px]:px-0 @[700px]:pt-[6.2mm] @[700px]:pb-0">
          {showCover && (
            <img
              src={c.branding.cover_image_url!} alt={v.propertyName}
              className="aspect-[52.4/63.8] w-44 rounded-t-[999px] rounded-b-none border-[1mm] object-cover @[700px]:w-[52.4mm]"
              style={{ borderColor: main }}
            />
          )}
        </div>

        {/* ───── Khối màu: bảng giá + chính sách ───── */}
        <section className="mt-6 flex flex-col gap-5 px-6 py-7 text-white @[700px]:mt-0 @[700px]:gap-0 @[700px]:px-0 @[700px]:py-0" style={{ backgroundColor: main }}>
          <div className="@[700px]:pt-[5mm]" style={at("PRICE_TABLE")}>
            {c.blocks.show_price_table && (
              <>
                <dl className="money-num grid grid-cols-4 text-center">
                  {([["Giá 1 đêm", formatVnd(v.pricePerNight)], ["Số đêm", v.nights], ["Thành tiền", formatVnd(v.roomTotal)], ["Đã cọc", formatVnd(v.paid)]] as const).map(([k, val]) => (
                    <div key={k} className="min-w-0 px-0.5 py-1">
                      <dt className="pb-[3mm] text-[10px] font-bold tracking-wide uppercase @[700px]:text-[11px]">{k}</dt>
                      <dd className="pt-[3mm] text-[10.5px] font-bold break-words @[700px]:text-[12px]">{val}</dd>
                    </div>
                  ))}
                </dl>
                <NightlyList nightly={v.nightly} className="mx-[5mm] mb-3 text-[10.5px] font-semibold @[700px]:text-[11px]" />
                <hr className="mx-[3mm] -mt-[8mm] mb-[8mm] hidden border-white/80 @[700px]:block" />
                {hasExtras && (
                  <dl className="money-num mx-[5mm] mb-3 space-y-1 text-[11px] font-semibold uppercase">
                    {v.addons.map((a, i) => (
                      <div key={i} className="flex justify-between gap-3"><dt>{a.name} × {a.quantity}</dt><dd>{formatVnd(a.guestPrice * a.quantity)}</dd></div>
                    ))}
                    {v.extraFees > 0 && <div className="flex justify-between gap-3"><dt>Phụ thu</dt><dd>{formatVnd(v.extraFees)}</dd></div>}
                    <div className="flex justify-between gap-3 border-t border-white/60 pt-1 font-bold"><dt>Tổng cộng</dt><dd>{formatVnd(v.grandTotal)}</dd></div>
                  </dl>
                )}
              </>
            )}
            <p className="px-2 pt-2 text-center text-[11px] leading-5 font-bold uppercase @[700px]:pt-[6mm]">
              {remaining > 0
                ? <>Số tiền còn lại <span className="money-num">{formatVnd(remaining)}</span> quý khách thanh toán khi nhận nhà</>
                : <>Quý khách đã thanh toán đủ</>}
            </p>
            <hr className="mx-auto mt-2 w-[70%] border-white/80 @[700px]:mt-[1.5mm]" />
          </div>

          <div className="space-y-4 @[700px]:space-y-[2mm] @[700px]:px-[5mm] @[700px]:pt-[6.5mm] @[700px]:pb-[6mm]" style={at("POLICIES")}>
            {c.blocks.show_surcharge_policy && c.custom_texts.surcharge_policy && (
              <div>
                <h3 className="pb-1 text-center text-[11.5px] font-bold tracking-wide uppercase italic">Chính sách phụ thu phát sinh (nếu có):</h3>
                <ol className="text-[10.5px] leading-5 uppercase @[700px]:text-[9.9px] @[700px]:leading-[5.4mm]">{lines(c.custom_texts.surcharge_policy).map((l, i) => <li key={i}>{l}</li>)}</ol>
              </div>
            )}
            {c.blocks.show_terms_conditions && c.custom_texts.terms_conditions && (
              <div>
                <h3 className="pb-1 text-center text-[11.5px] font-bold tracking-wide uppercase italic">Các điều khoản và điều kiện:</h3>
                <ol className="text-[10.5px] leading-5 uppercase @[700px]:text-[9.9px] @[700px]:leading-[5.4mm]">{lines(c.custom_texts.terms_conditions).map((l, i) => <li key={i}>{l}</li>)}</ol>
              </div>
            )}
          </div>
        </section>

        {/* ───── Cột phải: điều khoản huỷ, lời chào, QR vị trí ───── */}
        <section className="flex flex-col justify-between gap-8 px-8 py-7 @[700px]:gap-0 @[700px]:px-[4.3mm] @[700px]:pt-[22mm] @[700px]:pr-[2.5mm] @[700px]:pb-[11mm]" style={{ color: ink }}>
          <div style={at("POLICIES")}>
            {c.blocks.show_cancellation_policy && c.custom_texts.cancellation_policy && (
              <>
                <h3 className="pb-4 text-center text-[12px] font-bold tracking-wide uppercase @[700px]:pb-[5mm] @[700px]:text-[11px]">Điều khoản hủy booking:</h3>
                <ol className="space-y-2 text-[12px] leading-6 text-justify @[700px]:space-y-0 @[700px]:text-[10.5px] @[700px]:leading-[7.2mm]">{lines(c.custom_texts.cancellation_policy).map((l, i) => <li key={i}>{l}</li>)}</ol>
              </>
            )}
          </div>
          <div className="space-y-6 @[700px]:space-y-[6mm]" style={at("FOOTER")}>
            {c.custom_texts.footer_greeting && (
              <p className="text-center text-[11.5px] leading-[1.5] font-bold whitespace-pre-line italic @[700px]:text-[10.5px]">{c.custom_texts.footer_greeting}</p>
            )}
            {c.blocks.show_google_maps && v.mapsUrl && (
              <a href={v.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Mở vị trí trên Google Maps" className="flex flex-col items-center gap-2 text-center" style={{ color: ink }}>
                <MapQr url={v.mapsUrl} className="w-28 @[700px]:w-[28mm]" color="#000" />
                <span className="flex items-center gap-2 text-[11px] font-bold tracking-wide uppercase italic">
                  <MapPin className="size-5" strokeWidth={1.8} />Quét mã để lấy định vị
                </span>
              </a>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
