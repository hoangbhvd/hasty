"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Phiếu A4 trên điện thoại: giữ NGUYÊN bố cục như trên máy tính (rộng 794px) rồi thu nhỏ vừa chiều rộng màn hình.
 * Dùng transform: scale (không dùng CSS `zoom`) để mọi trình duyệt — kể cả Safari/Firefox cũ — vẫn thấy
 * khung rộng đúng 794px nên bố cục 2 cột (container query) luôn được áp dụng. Khi in thì tắt thu nhỏ.
 */
export function A4Fit({ children, width = 794 }: { children: ReactNode; width?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>();
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const s = Math.min(1, o.clientWidth / width);
      setScale(s);
      setHeight(s < 1 ? i.offsetHeight * s : undefined);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(o); ro.observe(i); fit();
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} className="w-full overflow-hidden print:!h-auto" style={{ height }}>
      <div ref={inner} style={{ width, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "top left" }} className="print:!w-auto print:![transform:none]">{children}</div>
    </div>
  );
}
