/* eslint-disable @next/next/no-img-element */
import type { VoucherConfig } from "@/lib/voucher-config";

/** Logo homestay (vị trí + kích thước theo cấu hình). Không có logo hoặc tắt khối thì không vẽ gì. */
export function VoucherLogo({ config, className = "" }: { config: VoucherConfig; className?: string }) {
  const { logo_url, logo_position, logo_size_px } = config.branding;
  if (!config.blocks.show_logo || !logo_url) return null;
  const justify = logo_position === "LEFT" ? "justify-start" : logo_position === "RIGHT" ? "justify-end" : "justify-center";
  return (
    <div className={`flex w-full ${justify} ${className}`}>
      <img src={logo_url} alt="Logo" crossOrigin="anonymous" style={{ height: logo_size_px, width: "auto", maxWidth: "70%" }} className="object-contain" />
    </div>
  );
}
