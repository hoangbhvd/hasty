import { qrPath } from "@/lib/qr-svg";

/** QR dẫn tới vị trí trên Google Maps (vẽ trực tiếp bằng SVG). */
export function MapQr({ url, className = "w-28", color = "#000" }: { url: string; className?: string; color?: string }) {
  const { size, d } = qrPath(url);
  return (
    <svg role="img" aria-label="Mã QR chỉ đường đến homestay" viewBox={`-2 -2 ${size + 4} ${size + 4}`} shapeRendering="crispEdges" className={className}>
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      <path d={d} fill={color} />
    </svg>
  );
}
