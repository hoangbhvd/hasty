"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAD = 8;
class TimeoutError extends Error {}
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new TimeoutError("timeout")), ms))]);

export function VoucherActions({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();

  async function savePng() {
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      const node = document.getElementById("voucher-capture");
      if (!node) throw new Error("Không tìm thấy phiếu");
      const { toPng } = await import("html-to-image");
      const base = {
        // cacheBust: false — bật thì mỗi file font bị tải lại với tham số thời gian khác nhau (hàng trăm request, rất chậm).
        // Ảnh bìa đã có crossOrigin nên không cần phá cache để tránh lỗi CORS.
        pixelRatio: 2, cacheBust: false, backgroundColor: "#ffffff",
        // Phiếu được căn giữa bằng margin:auto; bản sao giữ nguyên lề đó (hàng trăm px) nên nội dung bị đẩy lệch và cắt mất.
        // Xoá lề của bản sao và chừa viền PAD để không cắt đổ bóng (mẫu Brutal).
        style: { margin: `${PAD}px`, maxWidth: "none" },
        width: node.offsetWidth + PAD * 2, height: node.offsetHeight + PAD * 2,
        imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      };
      const keep = (skipQr: boolean) => (n: Node) =>
        !(n instanceof HTMLElement && (n.classList.contains("no-print") || (skipQr && n.tagName === "IMG" && (n as HTMLImageElement).alt.includes("VietQR"))));

      let dataUrl: string;
      try {
        // Một ảnh nhúng không tải được có thể làm html-to-image chờ mãi → giới hạn thời gian
        dataUrl = await withTimeout(toPng(node, { ...base, filter: keep(false) }), 15_000);
      } catch (e) {
        if (!(e instanceof TimeoutError)) throw e;
        dataUrl = await withTimeout(toPng(node, { ...base, filter: keep(true) }), 15_000);
        setNote("Không nhúng được mã QR vào ảnh, nên ảnh tải về không có QR. Hãy gửi kèm mã QR riêng hoặc dùng “Lưu PDF”.");
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${code}.png`;
      a.click();
    } catch (e) {
      setError(`Không xuất được ảnh: ${e instanceof TimeoutError ? "quá thời gian chờ, hãy thử lại hoặc dùng “Lưu PDF”" : e instanceof Error ? e.message : "lỗi"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print mx-auto w-full max-w-[430px] space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" className="h-12" disabled={busy} onClick={savePng}>
          <Download className="size-4" /> {busy ? "Đang tạo…" : "Tải ảnh (PNG)"}
        </Button>
        <Button type="button" variant="outline" className="h-12" onClick={() => window.print()}>
          <Printer className="size-4" /> Lưu PDF (A4)
        </Button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      {note && <p role="status" className="rounded border border-black bg-status-holding p-2 text-sm font-medium">{note}</p>}
      <p className="text-center text-xs text-muted-foreground">Mẹo: ở hộp thoại in, chọn “Lưu dưới dạng PDF”.</p>
    </div>
  );
}
