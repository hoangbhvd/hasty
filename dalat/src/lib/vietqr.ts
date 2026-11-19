export type QrParams = { bankId: string; accountNo: string; accountName?: string | null; amount?: number; info?: string };

/** URL ảnh VietQR động (https://img.vietqr.io). Chỉ gọi ở server — không đưa URL này ra client. */
export function vietQrUrl(p: QrParams): string {
  const acc = encodeURIComponent(p.accountNo.replace(/\s/g, ""));
  const q = new URLSearchParams();
  if (p.amount && p.amount > 0) q.set("amount", String(Math.round(p.amount)));
  if (p.info) q.set("addInfo", p.info.slice(0, 50));
  if (p.accountName) q.set("accountName", p.accountName.slice(0, 50));
  const qs = q.toString();
  const base = (process.env.VIETQR_BASE_URL ?? "https://img.vietqr.io").replace(/\/$/, "");
  return `${base}/image/${encodeURIComponent(p.bankId)}-${acc}-compact2.png${qs ? `?${qs}` : ""}`;
}
