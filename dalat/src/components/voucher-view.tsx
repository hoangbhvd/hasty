import { formatDateVi, formatVnd } from "@/lib/format";
import type { VoucherData } from "@/lib/voucher";
import type { VoucherConfig } from "@/lib/voucher-config";
import { BoutiqueView } from "@/components/voucher-boutique";
import { VoucherQr } from "@/components/voucher-qr";

const FONT = { MODERN: "font-sans", CLASSIC: "font-serif", MONO: "font-mono" } as const;
const STATUS: Record<string, string> = {
  HOLDING: "ĐANG GIỮ PHÒNG", CONFIRMED: "ĐÃ XÁC NHẬN", CHECKED_IN: "ĐANG LƯU TRÚ", CHECKED_OUT: "ĐÃ TRẢ PHÒNG", CANCELLED: "ĐÃ HUỶ",
};

const dateOf = (s: string) => formatDateVi(new Date(`${s}T00:00:00Z`));
const lines = (t: string) => t.split("\n").filter((l) => l.trim());

type Variant = VoucherConfig["template_id"];
type Look = { variant: Variant; main: string };

/** Màu chủ đạo (đã được kiểm tra là #RRGGBB) kèm độ trong suốt dạng hex: hairline mảnh cho mẫu sang trọng. */
const faint = (main: string, alpha: string) => `${main}${alpha}`;

function Section({ look, title, children }: { look: Look; title: string; children: React.ReactNode }) {
  const { variant, main } = look;
  if (variant === "RECEIPT_COMPACT") {
    return (
      <section className="space-y-1 border-t-2 border-dashed border-black pt-2">
        <h3 className="text-center text-[11px] font-bold tracking-wider uppercase">— {title} —</h3>
        {children}
      </section>
    );
  }
  if (variant === "LUXURY_MINIMAL") {
    return (
      <section className="space-y-3 border-t pt-6" style={{ borderColor: faint(main, "55") }}>
        <h3 className="text-center text-[10px] font-medium tracking-[0.3em] uppercase" style={{ color: main }}>{title}</h3>
        {children}
      </section>
    );
  }
  const brutal = variant === "GUMROAD_BRUTAL";
  return (
    <section className={`${brutal ? "border-t-2 border-dashed border-black" : "border-t"} space-y-1.5 pt-4`} style={brutal ? undefined : { borderColor: main }}>
      <h3 className="text-[11px] font-bold tracking-widest uppercase" style={{ color: brutal ? undefined : main }}>{title}</h3>
      {children}
    </section>
  );
}

/** 1 dòng "nhãn … giá trị". Mẫu biên lai có đường chấm dẫn như hoá đơn in nhiệt. */
function Row({ look, k, v, strong }: { look: Look; k: string; v: React.ReactNode; strong?: boolean }) {
  if (look.variant === "RECEIPT_COMPACT") {
    return (
      <div className="flex items-baseline gap-1">
        <dt className={strong ? "font-bold" : undefined}>{k}</dt>
        <span aria-hidden className="min-w-3 flex-1 border-b border-dotted border-black/60" />
        <dd className={`money-num text-right ${strong ? "text-sm font-extrabold" : "font-semibold"}`}>{v}</dd>
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-bold" : undefined}>{k}</dt>
      <dd className={`money-num text-right ${strong ? (look.variant === "LUXURY_MINIMAL" ? "text-lg font-medium" : "text-base font-extrabold") : "font-semibold"}`} style={strong && look.variant === "LUXURY_MINIMAL" ? { color: look.main } : undefined}>{v}</dd>
    </div>
  );
}

function Policy({ look, title, text }: { look: Look; title: string; text: string }) {
  return (
    <Section look={look} title={title}>
      <ol className={`space-y-1 leading-relaxed ${look.variant === "RECEIPT_COMPACT" ? "text-[11px]" : "text-[12px]"} ${look.variant === "LUXURY_MINIMAL" ? "text-black/80" : ""}`}>
        {lines(text).map((l, i) => <li key={i}>{l}</li>)}
      </ol>
    </Section>
  );
}

/** Phiếu Booking Confirmation: 4 mẫu dùng chung nội dung. `id="voucher-capture"` là vùng xuất PNG/PDF. */
export function VoucherView({ v, token }: { v: VoucherData; token: string }) {
  if (v.config.template_id === "DALAT_BOUTIQUE") return <BoutiqueView v={v} />;
  const { config: c } = v;
  const variant = c.template_id;
  const brutal = variant === "GUMROAD_BRUTAL";
  const luxury = variant === "LUXURY_MINIMAL";
  const receipt = variant === "RECEIPT_COMPACT";
  const main = c.branding.primary_color;
  const look: Look = { variant, main };

  const frame =
    c.branding.image_frame_style === "ARCH" ? "rounded-t-[999px] rounded-b-md" : c.branding.image_frame_style === "ROUNDED" ? "rounded-2xl" : "rounded-none";

  const wrapperClass = receipt
    ? "max-w-[360px] space-y-3 border-y-2 border-dashed border-black px-4 py-5 font-mono text-[12px]"
    : luxury
      ? `max-w-[430px] space-y-6 border p-9 ${FONT[c.branding.font_style]}`
      : brutal
        ? `max-w-[430px] space-y-4 border-2 border-black bg-white p-5 shadow-[6px_6px_0px_0px_#000] ${FONT[c.branding.font_style]}`
        : `max-w-[430px] space-y-4 border p-5 ${FONT[c.branding.font_style]}`;
  const wrapperStyle: React.CSSProperties | undefined = brutal
    ? undefined
    : receipt
      ? { backgroundColor: c.branding.background_color }
      : luxury
        ? { backgroundColor: c.branding.background_color, borderColor: faint(main, "66"), outline: `1px solid ${faint(main, "33")}`, outlineOffset: "-10px" }
        : { backgroundColor: c.branding.background_color, borderColor: main };

  const statusPill = `rounded-full border border-black px-2 py-0.5 text-[10px] font-bold ${v.status === "CANCELLED" ? "bg-status-cancelled" : v.status === "HOLDING" ? "bg-status-holding" : "bg-status-confirmed-bg"}`;

  return (
    <div id="voucher-capture" data-template={variant} className={`mx-auto w-full text-black ${wrapperClass}`} style={wrapperStyle}>
      {/* ───── Đầu phiếu ───── */}
      {luxury ? (
        <header className="space-y-3 text-center">
          {c.branding.brand_name && <div className="text-[10px] font-medium tracking-[0.45em] uppercase" style={{ color: main }}>{c.branding.brand_name}</div>}
          <h1 className="font-serif text-2xl font-normal tracking-[0.12em] uppercase">{c.custom_texts.header_title}</h1>
          <div aria-hidden className="mx-auto h-px w-12" style={{ background: main }} />
          <div className="space-x-3 text-[11px] tracking-[0.25em] text-black/60">
            <span className="font-mono">{v.bookingCode}</span>
            <span>{STATUS[v.status]}</span>
          </div>
        </header>
      ) : receipt ? (
        <header className="space-y-0.5 text-center">
          {c.branding.brand_name && <div className="text-sm font-extrabold tracking-wider uppercase">{c.branding.brand_name}</div>}
          <h1 className="text-[13px] font-bold uppercase">{c.custom_texts.header_title}</h1>
          <div className="font-bold">{v.bookingCode} · {STATUS[v.status]}</div>
        </header>
      ) : (
        <header className="space-y-1 text-center">
          {c.branding.brand_name && (
            <div className="text-xs font-bold tracking-[0.3em] uppercase" style={{ color: brutal ? undefined : main }}>{c.branding.brand_name}</div>
          )}
          <h1 className="text-xl font-extrabold tracking-tight">{c.custom_texts.header_title}</h1>
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="font-mono font-bold">{v.bookingCode}</span>
            <span className={statusPill}>{STATUS[v.status]}</span>
          </div>
        </header>
      )}

      {c.blocks.show_cover_image && c.branding.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.branding.cover_image_url} alt={v.propertyName} crossOrigin="anonymous"
          className={receipt ? "aspect-video w-full object-cover grayscale contrast-125" : `aspect-[4/5] w-full object-cover ${frame} ${brutal ? "border-2 border-black" : "border-2"}`}
          style={receipt || brutal ? undefined : { borderColor: luxury ? faint(main, "66") : main, ...(luxury ? { borderWidth: 1 } : {}) }}
        />
      )}

      <section className="space-y-1 text-center">
        <div className={luxury ? "font-serif text-xl tracking-wide" : receipt ? "text-[13px] font-bold" : "text-lg font-bold"}>{v.propertyName}</div>
        <div className={luxury ? "text-xs tracking-[0.2em] text-black/60 uppercase" : "text-sm"}>{v.roomLabel}</div>
      </section>

      <Section look={look} title="Thông tin lưu trú">
        <dl className={`space-y-1.5 ${receipt ? "" : "text-sm"}`}>
          <Row look={look} k="Khách" v={v.guestName} />
          <Row look={look} k="Nhận phòng" v={`${dateOf(v.checkIn)} · từ ${v.config.stay_times.checkin_time}`} />
          <Row look={look} k="Trả phòng" v={`${dateOf(v.checkOut)} · trước ${v.config.stay_times.checkout_time}`} />
          <Row look={look} k="Số khách" v={v.guestCount} />
        </dl>
      </Section>

      {c.blocks.show_price_table && (
        <Section look={look} title="Chi phí">
          {receipt ? (
            <dl className="space-y-1">
              <Row look={look} k="Giá 1 đêm" v={formatVnd(v.pricePerNight)} />
              <Row look={look} k="Số đêm" v={v.nights} />
              <Row look={look} k="Thành tiền" v={formatVnd(v.roomTotal)} />
              <Row look={look} k="Đã cọc" v={formatVnd(v.paid)} />
            </dl>
          ) : (
            <table className="money-num w-full text-[12px]">
              <thead>
                <tr className={`text-left ${luxury ? "text-[10px] tracking-widest text-black/60 uppercase" : ""}`}>
                  <th className="py-1 font-semibold">Giá 1 đêm</th>
                  <th className="py-1 text-center font-semibold">Số đêm</th>
                  <th className="py-1 text-right font-semibold">Thành tiền</th>
                  <th className="py-1 text-right font-semibold">Đã cọc</th>
                </tr>
              </thead>
              <tbody>
                <tr className={brutal ? "border-t border-black" : "border-t"} style={brutal ? undefined : { borderColor: luxury ? faint(main, "55") : main }}>
                  <td className="py-1.5">{formatVnd(v.pricePerNight)}</td>
                  <td className="py-1.5 text-center">{v.nights}</td>
                  <td className="py-1.5 text-right">{formatVnd(v.roomTotal)}</td>
                  <td className="py-1.5 text-right">{formatVnd(v.paid)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Section>
      )}

      {(v.addons.length > 0 || v.extraFees > 0) && (
        <Section look={look} title="Dịch vụ & phụ thu">
          <dl className={`space-y-1 ${receipt ? "" : "text-sm"}`}>
            {v.addons.map((a, i) => <Row key={i} look={look} k={`${a.name} × ${a.quantity}`} v={formatVnd(a.guestPrice * a.quantity)} />)}
            {v.extraFees > 0 && <Row look={look} k="Phụ thu" v={formatVnd(v.extraFees)} />}
          </dl>
        </Section>
      )}

      <Section look={look} title="Thanh toán">
        <dl className={`space-y-1 ${receipt ? "" : "text-sm"}`}>
          <Row look={look} k="Tổng cộng" v={formatVnd(v.grandTotal)} />
          <Row look={look} k="Đã thanh toán" v={formatVnd(v.paid)} />
          <Row look={look} k="Còn lại" v={formatVnd(Math.max(v.remaining, 0))} strong />
        </dl>
        {c.blocks.show_vietqr && v.hasQr && <VoucherQr token={token} code={v.bookingCode} className={receipt ? "w-36" : "w-48"} />}
      </Section>

      <Section look={look} title="Hướng dẫn đến nhà">
        {v.checkinGuide && <p className={`whitespace-pre-line ${receipt ? "" : "text-sm"} ${luxury ? "text-center text-black/80" : ""}`}>{v.checkinGuide}</p>}
        <div className={`space-y-0.5 ${receipt ? "" : "text-sm"} ${luxury ? "text-center" : ""}`}>
          {c.blocks.show_caretaker_phone && v.caretakerPhone && <div>Quản gia: <b className="money-num">{v.caretakerPhone}</b></div>}
          {v.supportPhone && <div>{v.supportLabel}: <b className="money-num">{v.supportPhone}</b></div>}
        </div>
        {c.blocks.show_google_maps && v.mapsUrl && (
          <div className={luxury ? "text-center" : undefined}>
            <a
              href={v.mapsUrl} target="_blank" rel="noopener noreferrer"
              className={`no-print mt-1 inline-flex h-10 items-center px-4 text-sm text-black ${luxury ? "border text-[11px] tracking-[0.2em] uppercase" : "brutal-btn bg-primary"}`}
              style={luxury ? { borderColor: main } : undefined}
            >
              {luxury ? "Mở Google Maps" : "📍 Mở Google Maps"}
            </a>
          </div>
        )}
      </Section>

      {c.blocks.show_surcharge_policy && c.custom_texts.surcharge_policy && <Policy look={look} title="Chính sách phụ thu phát sinh" text={c.custom_texts.surcharge_policy} />}
      {c.blocks.show_terms_conditions && c.custom_texts.terms_conditions && <Policy look={look} title="Các điều khoản và điều kiện" text={c.custom_texts.terms_conditions} />}
      {c.blocks.show_cancellation_policy && c.custom_texts.cancellation_policy && <Policy look={look} title="Điều khoản hủy booking" text={c.custom_texts.cancellation_policy} />}

      {c.custom_texts.footer_greeting && (
        <footer
          className={`pt-4 text-center whitespace-pre-line ${receipt ? "border-t-2 border-dashed border-black text-[11px]" : brutal ? "border-t-2 border-dashed border-black text-[12px] leading-relaxed" : luxury ? "border-t pt-6 font-serif text-[13px] leading-loose text-black/70 italic" : "border-t text-[12px] leading-relaxed"}`}
          style={receipt || brutal ? undefined : { borderColor: luxury ? faint(main, "55") : main }}
        >
          {c.custom_texts.footer_greeting}
        </footer>
      )}
    </div>
  );
}
