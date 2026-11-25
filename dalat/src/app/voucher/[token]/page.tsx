import type { Metadata } from "next";
import { isA4Template } from "@/lib/voucher-config";
import { notFound } from "next/navigation";
import { getVoucherResult } from "@/lib/voucher";
import { A4Fit } from "@/components/a4-fit";
import { VoucherView } from "@/components/voucher-view";
import { VoucherActions } from "@/components/voucher-actions";
import { VoucherPrintStyle } from "@/components/voucher-print-style";

// Trang công khai: không cho công cụ tìm kiếm lập chỉ mục, không gửi Referer (token nằm trong URL)
export const metadata: Metadata = {
  title: "Xác nhận đặt phòng",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VoucherPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await getVoucherResult(token);
  if (r.kind === "missing") notFound();
  if (r.kind === "expired") {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm space-y-2 rounded border-2 border-black bg-white p-6 text-center shadow-brutal-sm">
          <h1 className="text-xl font-bold">Link đã hết hạn</h1>
          <p className="text-sm text-muted-foreground">Vui lòng liên hệ người đặt phòng để được gửi lại link xác nhận mới.</p>
        </div>
      </main>
    );
  }
  const v = r.data;

  return (
    <main className="min-h-dvh space-y-5 px-3 py-6">
      {v.config.mode === "CUSTOM_PDFME" && v.config.pdfme_config.base_pdf_url ? (
        // Chế độ 2: phiếu do server ghép từ PDF nền → hiển thị đúng bản sẽ tải về
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/voucher/${token}/export?format=png&inline=1`} alt={`Xác nhận đặt phòng ${v.bookingCode}`} className="mx-auto w-full max-w-[820px] border border-black bg-white" />
      ) : (
        isA4Template(v.config.template_id)
          ? <A4Fit><VoucherView v={v} token={token} /></A4Fit> // A4: giữ nguyên bố cục máy tính, thu nhỏ vừa màn hình điện thoại
          : <VoucherView v={v} token={token} />
      )}
      <VoucherActions token={token} mapsUrl={v.config.blocks.show_google_maps ? v.mapsUrl : null} phone={v.supportPhone ?? v.caretakerPhone} />
      {v.config.mode !== "CUSTOM_PDFME" && <VoucherPrintStyle boutique={isA4Template(v.config.template_id)} />}
    </main>
  );
}
