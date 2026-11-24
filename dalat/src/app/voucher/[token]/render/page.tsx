import type { Metadata } from "next";
import { isA4Template } from "@/lib/voucher-config";
import { notFound } from "next/navigation";
import { getVoucherResult } from "@/lib/voucher";
import { VoucherView } from "@/components/voucher-view";
import { VoucherPrintStyle } from "@/components/voucher-print-style";

// Trang để Gotenberg dựng PDF/PNG: chỉ có phiếu A4, không nút bấm. Cùng quyền truy cập (token) và cùng dữ liệu với trang công khai.
export const metadata: Metadata = { title: "Booking Confirmation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function VoucherRenderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ scale?: string; layout?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const r = await getVoucherResult(token);
  if (r.kind !== "ok") notFound();
  const scale = Math.min(Math.max(Number(sp.scale) || 1, 1), 3);
  if (sp.layout === "card") {
    // Thẻ dọc (không dùng CSS in A4): ảnh PNG cao theo nội dung
    return (
      <main style={{ padding: 12, background: "#fff", zoom: scale }}>
        <VoucherView v={r.data} token={token} />
        <style>{`html, body { background: #fff !important; min-height: 0 !important; height: auto !important; } .no-print { display: none !important; }`}</style>
      </main>
    );
  }
  return (
    <main>
      <VoucherView v={r.data} token={token} />
      <VoucherPrintStyle boutique={isA4Template(r.data.config.template_id)} forced scale={scale} />
    </main>
  );
}
