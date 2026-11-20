import { Download, MapPin, Phone, Printer } from "lucide-react";

/** Nút trên trang công khai. PNG/PDF do server (Gotenberg) dựng nên giống hệt trên mọi thiết bị, kể cả Safari/iPhone. */
export function VoucherActions({ token, mapsUrl, phone }: { token: string; mapsUrl: string | null; phone: string | null }) {
  const btn = "brutal-btn inline-flex h-12 items-center justify-center gap-2 px-3 text-sm font-semibold text-black";
  const tel = phone?.replace(/[^\d+]/g, "");
  return (
    <div className="no-print mx-auto w-full max-w-[430px] space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <a href={`/api/voucher/${token}/export?format=png`} download className={`${btn} bg-primary`}><Download className="size-4" /> Tải ảnh gửi Zalo (PNG)</a>
        <a href={`/api/voucher/${token}/export?format=pdf`} download className={`${btn} bg-white`}><Printer className="size-4" /> Tải file in (PDF)</a>
      </div>
      {(mapsUrl || tel) && (
        <div className="grid grid-cols-2 gap-3">
          {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={`${btn} bg-white`}><MapPin className="size-4" /> Mở Google Maps</a> : <span />}
          {tel ? <a href={`tel:${tel}`} className={`${btn} bg-white`}><Phone className="size-4" /> Gọi hotline</a> : <span />}
        </div>
      )}
    </div>
  );
}
