import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVoucherResult } from "@/lib/voucher";
import { VoucherView } from "@/components/voucher-view";
import { VoucherActions } from "@/components/voucher-actions";

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
      <VoucherActions code={v.bookingCode} />
      {/* In ra A4 1 trang: bỏ khung/đổ bóng, thu nhỏ chữ, ẩn nút bấm */}
      <style>{`
        @page { size: A4; margin: 8mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          main { padding: 0 !important; }
          #voucher-capture { max-width: none !important; width: 100% !important; box-shadow: none !important; border: 0 !important; padding: 0 !important; display: block !important; font-size: 8.6pt; column-count: 2; column-gap: 8mm; }
          #voucher-capture > * { break-inside: avoid; margin-bottom: 2mm !important; }
          #voucher-capture header, #voucher-capture img.aspect-\\[4\\/5\\] { column-span: all; }
          #voucher-capture img.aspect-\\[4\\/5\\] { aspect-ratio: 6 / 1 !important; }
          #voucher-capture img[alt*="VietQR"] { width: 28mm !important; }
          #voucher-capture section { padding-top: 2mm !important; }
          /* gọn khoảng cách bên trong khối (mẫu Luxury dùng khoảng cách rộng trên màn hình) */
          #voucher-capture section > * { margin-block: 0.8mm !important; }
          #voucher-capture footer { padding-top: 2mm !important; }
        }
      `}</style>
    </main>
  );
}
