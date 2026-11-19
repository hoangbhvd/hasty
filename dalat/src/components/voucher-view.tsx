import { formatDateVi, formatVnd } from "@/lib/format";
import type { VoucherData } from "@/lib/voucher";
import { VoucherQr } from "@/components/voucher-qr";

const FONT = { MODERN: "font-sans", CLASSIC: "font-serif", MONO: "font-mono" } as const;
const STATUS: Record<string, string> = {
  HOLDING: "ĐANG GIỮ PHÒNG", CONFIRMED: "ĐÃ XÁC NHẬN", CHECKED_IN: "ĐANG LƯU TRÚ", CHECKED_OUT: "ĐÃ TRẢ PHÒNG", CANCELLED: "ĐÃ HUỶ",
};

const dateOf = (s: string) => formatDateVi(new Date(`${s}T00:00:00Z`));
const lines = (t: string) => t.split("\n").filter((l) => l.trim());

type Look = { brutal: boolean; main: string };

function Section({ look, title, children }: { look: Look; title: string; children: React.ReactNode }) {
  return (
    <section
      className={`${look.brutal ? "border-t-2 border-dashed border-black" : "border-t"} space-y-1.5 pt-4`}
      style={look.brutal ? undefined : { borderColor: look.main }}
    >
      <h3 className="text-[11px] font-bold tracking-widest uppercase" style={{ color: look.brutal ? undefined : look.main }}>{title}</h3>
      {children}
    </section>
  );
}

function Policy({ look, title, text }: { look: Look; title: string; text: string }) {
  return (
    <Section look={look} title={title}>
      <ol className="space-y-1 text-[12px] leading-relaxed">{lines(text).map((l, i) => <li key={i}>{l}</li>)}</ol>
    </Section>
  );
}

/** Phiếu Booking Confirmation. Dùng chung cho 2 mẫu; `id="voucher-capture"` là vùng xuất PNG/PDF. */
export function VoucherView({ v, token }: { v: VoucherData; token: string }) {
  const { config: c } = v;
  const brutal = c.template_id === "GUMROAD_BRUTAL";
  const main = c.branding.primary_color;
  const look: Look = { brutal, main };
  const sep = brutal ? "border-t-2 border-dashed border-black" : "border-t";
  const sepStyle = brutal ? undefined : { borderColor: main };

  const frame =
    c.branding.image_frame_style === "ARCH" ? "rounded-t-[999px] rounded-b-md" : c.branding.image_frame_style === "ROUNDED" ? "rounded-2xl" : "rounded-none";

  return (
    <div
      id="voucher-capture"
      className={`mx-auto w-full max-w-[430px] space-y-4 p-5 text-black ${FONT[c.branding.font_style]} ${
        brutal ? "border-2 border-black bg-white shadow-[6px_6px_0px_0px_#000]" : "border"
      }`}
      style={brutal ? undefined : { backgroundColor: c.branding.background_color, borderColor: main }}
    >
      <header className="space-y-1 text-center">
        {c.branding.brand_name && (
          <div className="text-xs font-bold tracking-[0.3em] uppercase" style={{ color: brutal ? undefined : main }}>{c.branding.brand_name}</div>
        )}
        <h1 className="text-xl font-extrabold tracking-tight">{c.custom_texts.header_title}</h1>
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="font-mono font-bold">{v.bookingCode}</span>
          <span className={`rounded-full border border-black px-2 py-0.5 text-[10px] font-bold ${v.status === "CANCELLED" ? "bg-status-cancelled" : v.status === "HOLDING" ? "bg-status-holding" : "bg-status-confirmed-bg"}`}>
            {STATUS[v.status]}
          </span>
        </div>
      </header>

      {c.blocks.show_cover_image && c.branding.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.branding.cover_image_url} alt={v.propertyName} crossOrigin="anonymous"
          className={`aspect-[4/5] w-full object-cover ${frame} ${brutal ? "border-2 border-black" : "border-2"}`}
          style={brutal ? undefined : { borderColor: main }}
        />
      )}

      <section className="space-y-1 text-center">
        <div className="text-lg font-bold">{v.propertyName}</div>
        <div className="text-sm">{v.roomLabel}</div>
      </section>

      <Section look={look} title="Thông tin lưu trú">
        <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
          <dt>Khách</dt><dd className="text-right font-semibold">{v.guestName}</dd>
          <dt>Nhận phòng</dt><dd className="money-num text-right font-semibold">{dateOf(v.checkIn)}</dd>
          <dt>Trả phòng</dt><dd className="money-num text-right font-semibold">{dateOf(v.checkOut)}</dd>
          <dt>Số khách</dt><dd className="money-num text-right font-semibold">{v.guestCount}</dd>
        </dl>
      </Section>

      {c.blocks.show_price_table && (
        <Section look={look} title="Chi phí">
          <table className="money-num w-full text-[12px]">
            <thead>
              <tr className="text-left">
                <th className="py-1 font-semibold">Giá 1 đêm</th>
                <th className="py-1 text-center font-semibold">Số đêm</th>
                <th className="py-1 text-right font-semibold">Thành tiền</th>
                <th className="py-1 text-right font-semibold">Đã cọc</th>
              </tr>
            </thead>
            <tbody>
              <tr className={brutal ? "border-t border-black" : "border-t"} style={sepStyle}>
                <td className="py-1.5">{formatVnd(v.pricePerNight)}</td>
                <td className="py-1.5 text-center">{v.nights}</td>
                <td className="py-1.5 text-right">{formatVnd(v.roomTotal)}</td>
                <td className="py-1.5 text-right">{formatVnd(v.paid)}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {(v.addons.length > 0 || v.extraFees > 0) && (
        <Section look={look} title="Dịch vụ & phụ thu">
          <ul className="money-num space-y-1 text-sm">
            {v.addons.map((a, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{a.name} × {a.quantity}</span><span>{formatVnd(a.guestPrice * a.quantity)}</span></li>
            ))}
            {v.extraFees > 0 && <li className="flex justify-between gap-2"><span>Phụ thu</span><span>{formatVnd(v.extraFees)}</span></li>}
          </ul>
        </Section>
      )}

      <Section look={look} title="Thanh toán">
        <dl className="money-num grid grid-cols-2 gap-y-1 text-sm">
          <dt>Tổng cộng</dt><dd className="text-right font-semibold">{formatVnd(v.grandTotal)}</dd>
          <dt>Đã thanh toán</dt><dd className="text-right font-semibold">{formatVnd(v.paid)}</dd>
          <dt className="font-bold">Còn lại</dt>
          <dd className="text-right text-base font-extrabold">{formatVnd(Math.max(v.remaining, 0))}</dd>
        </dl>
        {c.blocks.show_vietqr && v.hasQr && <VoucherQr token={token} code={v.bookingCode} />}
      </Section>

      <Section look={look} title="Hướng dẫn đến nhà">
        {v.checkinGuide && <p className="text-sm whitespace-pre-line">{v.checkinGuide}</p>}
        <div className="space-y-0.5 text-sm">
          {c.blocks.show_caretaker_phone && v.caretakerPhone && <div>Quản gia: <b className="money-num">{v.caretakerPhone}</b></div>}
          {v.supportPhone && <div>{v.supportLabel}: <b className="money-num">{v.supportPhone}</b></div>}
        </div>
        {c.blocks.show_google_maps && v.mapsUrl && (
          <a
            href={v.mapsUrl} target="_blank" rel="noopener noreferrer"
            className="no-print brutal-btn mt-1 inline-flex h-10 items-center bg-primary px-4 text-sm text-black"
          >
            📍 Mở Google Maps
          </a>
        )}
      </Section>

      {c.blocks.show_surcharge_policy && c.custom_texts.surcharge_policy && <Policy look={look} title="Chính sách phụ thu phát sinh" text={c.custom_texts.surcharge_policy} />}
      {c.blocks.show_terms_conditions && c.custom_texts.terms_conditions && <Policy look={look} title="Các điều khoản và điều kiện" text={c.custom_texts.terms_conditions} />}
      {c.blocks.show_cancellation_policy && c.custom_texts.cancellation_policy && <Policy look={look} title="Điều khoản hủy booking" text={c.custom_texts.cancellation_policy} />}

      {c.custom_texts.footer_greeting && (
        <footer className={`${sep} pt-4 text-center text-[12px] leading-relaxed whitespace-pre-line`} style={sepStyle}>
          {c.custom_texts.footer_greeting}
        </footer>
      )}
    </div>
  );
}
