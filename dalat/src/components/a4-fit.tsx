"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Phiếu A4 trên điện thoại: giữ NGUYÊN bố cục như trên máy tính (rộng 794px) rồi thu nhỏ vừa chiều rộng màn hình.
 * Khi in thì tắt thu nhỏ. Khách có thể chụm 2 ngón để phóng to xem chi tiết.
 */
export function A4Fit({ children, width = 794 }: { children: ReactNode; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / width));
    const ro = new ResizeObserver(fit);
    ro.observe(el); fit();
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={box} className="w-full overflow-hidden">
      <div style={{ width, zoom }} className="mx-auto print:!w-auto print:![zoom:1]">{children}</div>
    </div>
  );
}
