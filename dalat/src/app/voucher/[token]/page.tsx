import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVoucherResult } from "@/lib/voucher";
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
      <VoucherView v={v} token={token} />
      <VoucherActions token={token} mapsUrl={v.config.blocks.show_google_maps ? v.mapsUrl : null} phone={v.supportPhone ?? v.caretakerPhone} />
      <VoucherPrintStyle boutique={v.config.template_id === "DALAT_BOUTIQUE"} />
    </main>
  );
}
