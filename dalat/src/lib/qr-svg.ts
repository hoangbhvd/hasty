import QRCode from "qrcode";

/** Ma trận QR → đường vẽ SVG (đồng bộ, không gọi mạng nên xuất PNG/PDF luôn có QR). */
export function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
  }
  return { size, d };
}
