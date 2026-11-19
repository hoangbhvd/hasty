"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VoucherActions({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function savePng() {
    setBusy(true);
    setError(undefined);
    try {
      const node = document.getElementById("voucher-capture");
      if (!node) throw new Error("Không tìm thấy phiếu");
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff", imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", filter: (n) => !(n instanceof HTMLElement && n.classList.contains("no-print")) });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${code}.png`;
      a.click();
    } catch (e) {
      setError(`Không xuất được ảnh: ${e instanceof Error ? e.message : "lỗi"}`);
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
      <p className="text-center text-xs text-muted-foreground">Mẹo: ở hộp thoại in, chọn “Lưu dưới dạng PDF”.</p>
    </div>
  );
}
