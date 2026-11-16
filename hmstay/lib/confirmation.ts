import { randomBytes } from "node:crypto";
import { withUser } from "./db";
import { dmy, money, nightsBetween } from "./format";

/** Biến dùng trong mẫu. Tên giữ theo mẫu Cottown ({{TEN_KHACH}}, {{CHECK_IN}}...). */
export const VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: "MA_BOOKING", label: "Mã booking", sample: "A1B2C3D4" },
  { key: "TEN_KHACH", label: "Tên khách", sample: "NGUYỄN VĂN A" },
  { key: "SO_DIEN_THOAI", label: "SĐT khách", sample: "0900 000 000" },
  { key: "SO_LUONG_KHACH", label: "Số khách", sample: "4" },
  { key: "CHECK_IN", label: "Ngày nhận phòng", sample: "04/12/2026" },
  { key: "CHECK_OUT", label: "Ngày trả phòng", sample: "06/12/2026" },
  { key: "SO_DEM", label: "Số đêm", sample: "2" },
  { key: "TEN_CO_SO", label: "Tên cơ sở", sample: "Cottown" },
  { key: "DIA_CHI", label: "Địa chỉ cơ sở", sample: "Đà Lạt" },
  { key: "TEN_PHONG", label: "Tên phòng", sample: "P101" },
  { key: "GIA_1_DEM", label: "Giá 1 đêm", sample: "900.000" },
  { key: "THANH_TIEN", label: "Thành tiền", sample: "1.800.000" },
  { key: "DA_COC", label: "Đã cọc", sample: "500.000" },
  { key: "CON_LAI", label: "Còn lại", sample: "1.300.000" },
  { key: "GHI_CHU", label: "Ghi chú", sample: "Check-in sau 14h" },
  { key: "NGUOI_BAN", label: "Người bán (tên)", sample: "Nguyễn Chủ" },
  { key: "SDT_NGUOI_BAN", label: "Người bán (SĐT)", sample: "0911 111 111" },
  { key: "NGAY_TAO", label: "Ngày lập", sample: "16/11/2026" },
];

export const SAMPLE_VARS: Record<string, string> = Object.fromEntries(VARIABLES.map((v) => [v.key, v.sample]));

/** Mẫu mặc định khi người dùng chưa tạo mẫu nào (cũng là điểm bắt đầu khi tạo mẫu mới). */
export const STARTER_HTML = `
<div class="page">
  <div class="head"><h1>XÁC NHẬN ĐẶT PHÒNG</h1><p>{{TEN_CO_SO}} · {{DIA_CHI}}</p></div>
  <p class="code">Mã booking: <b>{{MA_BOOKING}}</b> · Ngày lập: {{NGAY_TAO}}</p>
  <table class="info">
    <tr><td class="k">Khách hàng</td><td>{{TEN_KHACH}}</td></tr>
    <tr><td class="k">Số điện thoại</td><td>{{SO_DIEN_THOAI}}</td></tr>
    <tr><td class="k">Số khách</td><td>{{SO_LUONG_KHACH}}</td></tr>
    <tr><td class="k">Phòng</td><td>{{TEN_PHONG}}</td></tr>
    <tr><td class="k">Nhận phòng</td><td>{{CHECK_IN}}</td></tr>
    <tr><td class="k">Trả phòng</td><td>{{CHECK_OUT}} ({{SO_DEM}} đêm)</td></tr>
    <tr><td class="k">Thành tiền</td><td><b>{{THANH_TIEN}} VND</b></td></tr>
    <tr><td class="k">Đã đặt cọc</td><td>{{DA_COC}} VND</td></tr>
    <tr><td class="k">Còn lại</td><td><b>{{CON_LAI}} VND</b></td></tr>
  </table>
  <p class="note">Ghi chú: {{GHI_CHU}}</p>
  <p class="foot">Người lập: {{NGUOI_BAN}} · {{SDT_NGUOI_BAN}}<br>Cảm ơn quý khách đã lựa chọn chúng tôi.</p>
</div>`;

export const STARTER_CSS = `
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#333;font-size:14px}
.page{padding:32px 40px}
.head{background:#0f766e;color:#fff;text-align:center;padding:20px;border-radius:6px}
.head h1{margin:0 0 6px;font-size:22px;letter-spacing:1px}
.head p{margin:0;font-size:13px;opacity:.9}
.code{text-align:center;color:#64748b;margin:14px 0}
.info{width:100%;border-collapse:collapse;margin-top:8px}
.info td{padding:10px 12px;border-bottom:1px solid #e2e8f0}
.info td.k{width:35%;color:#64748b}
.note{margin-top:18px}
.foot{margin-top:28px;text-align:center;color:#64748b;font-size:13px}`;

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Dữ liệu biến cho một booking mà người dùng được phép lập xác nhận. null nếu không được. */
export async function loadConfirmationVars(uid: string, bookingId: string): Promise<Record<string, string> | null> {
  return withUser(uid, async (q) => {
    const [b] = await q<{
      id: string; guest_name: string; guest_phone: string | null; guests: number | null; check_in: string; check_out: string;
      sell_total: number; deposit_amount: number; note: string | null; status: string; broker_id: string | null;
      unit_name: string; property_name: string; address: string | null; owner_id: string;
      owner_name: string; owner_phone: string | null; broker_name: string | null; broker_phone: string | null;
    }>(
      `select b.id, b.guest_name, b.guest_phone, b.guests, b.check_in, b.check_out, b.sell_total, b.deposit_amount, b.note, b.status, b.broker_id,
              u.name unit_name, p.name property_name, p.address, p.owner_id,
              op.full_name owner_name, op.phone owner_phone, bp.full_name broker_name, bp.phone broker_phone
       from bookings b join units u on u.id=b.unit_id join properties p on p.id=u.property_id
       join profiles op on op.id=p.owner_id left join profiles bp on bp.id=b.broker_id
       where b.id=$1`, [bookingId]);
    if (!b) return null;
    // Người "bán" cho khách mới lập xác nhận: broker của booking, hoặc chủ với booking chủ tự nhập.
    const seller = b.broker_id ? b.broker_id === uid : b.owner_id === uid;
    if (!seller || !["holding", "deposit_reported", "confirmed"].includes(b.status)) return null;
    const nights = nightsBetween(b.check_in, b.check_out);
    const bySeller = b.broker_id ? { n: b.broker_name, p: b.broker_phone } : { n: b.owner_name, p: b.owner_phone };
    return {
      MA_BOOKING: b.id.slice(0, 8).toUpperCase(),
      TEN_KHACH: b.guest_name, SO_DIEN_THOAI: b.guest_phone ?? "", SO_LUONG_KHACH: b.guests ? String(b.guests) : "",
      CHECK_IN: dmy(b.check_in), CHECK_OUT: dmy(b.check_out), SO_DEM: String(nights),
      TEN_CO_SO: b.property_name, DIA_CHI: b.address ?? "", TEN_PHONG: b.unit_name,
      GIA_1_DEM: money(b.sell_total / nights), THANH_TIEN: money(b.sell_total),
      DA_COC: money(b.deposit_amount), CON_LAI: money(b.sell_total - b.deposit_amount),
      GHI_CHU: b.note ?? "", NGUOI_BAN: bySeller.n ?? "", SDT_NGUOI_BAN: bySeller.p ?? "",
      NGAY_TAO: dmy(new Date().toISOString().slice(0, 10)),
    };
  });
}

/**
 * Ghép biến vào mẫu, trả về {html, headers}. Mẫu do người dùng tự soạn nên tài liệu được cô lập
 * bằng CSP sandbox (opaque origin, không đọc được cookie/DOM của app) và chỉ cho chạy đúng
 * script in của chúng ta (nonce), chặn mọi script trong mẫu.
 */
export function renderConfirmation(html: string, css: string, vars: Record<string, string>) {
  const nonce = randomBytes(16).toString("base64");
  const body = html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k: string) => (k in vars ? esc(vars[k]) : m));
  const doc = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Xác nhận booking</title>
<style>@page{size:A4;margin:10mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}${css.replace(/<\/style/gi, "")}</style>
<style>#hm-print{position:fixed;top:12px;right:12px;z-index:99999;font:600 13px Arial;padding:10px 14px;border:0;border-radius:8px;background:#0f766e;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}@media print{#hm-print{display:none}}</style>
</head><body>${body}<button id="hm-print" type="button">In / Lưu PDF</button>
<script nonce="${nonce}">document.getElementById("hm-print").addEventListener("click",function(){window.print()})</script></body></html>`;
  return {
    html: doc,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' https://fonts.googleapis.com; ` +
        `font-src https://fonts.gstatic.com data:; img-src data: https:; base-uri 'none'; form-action 'none'; ` +
        `frame-ancestors 'self'; sandbox allow-scripts allow-modals`,
      "X-Content-Type-Options": "nosniff",
    },
  };
}
