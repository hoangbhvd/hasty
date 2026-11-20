// Dựng HTML tĩnh của phiếu cho cả 4 mẫu và kiểm tra nội dung / an toàn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { VoucherView } from "../components/voucher-view";
import { AVAILABLE_TEMPLATES, DEFAULT_VOUCHER_CONFIG, SAMPLE_TEXTS, TEMPLATE_IDS, parseVoucherConfig } from "./voucher-config";
import type { VoucherData } from "./voucher";

const data = (template: string, over: Partial<VoucherData["config"]["blocks"]> = {}, extra: Partial<VoucherData> = {}): VoucherData => ({
  bookingCode: "DL-2611-889", status: "CONFIRMED", propertyName: "Villa Đồi Thông", roomLabel: "Nguyên căn",
  checkIn: "2026-12-04", checkOut: "2026-12-06", nights: 2, guestName: "Nguyễn Văn Khách", guestCount: 4,
  pricePerNight: 2_200_000, roomTotal: 4_400_000, extraFees: 100_000, addons: [{ name: "Thuê xe máy", quantity: 2, guestPrice: 150_000 }],
  grandTotal: 4_800_000, paid: 2_000_000, remaining: 2_800_000, mapsUrl: "https://maps.example/x", checkinGuide: "Rẽ trái ở ngã ba thông",
  houseRules: null, caretakerPhone: "0911222333", supportPhone: "0966000002", supportLabel: "Người đặt phòng (CTV)", hasQr: true,
  config: parseVoucherConfig({
    template_id: template, branding: { brand_name: "Cottown", primary_color: "#B08978" },
    blocks: { show_vietqr: true, ...over },
    custom_texts: { surcharge_policy: SAMPLE_TEXTS.surcharge_policy, terms_conditions: SAMPLE_TEXTS.terms_conditions, cancellation_policy: SAMPLE_TEXTS.cancellation_policy },
  }),
  ...extra,
});
const html = (v: VoucherData) => renderToStaticMarkup(<VoucherView v={v} token="11111111-1111-4111-8111-111111111111" />);

test("cả 4 mẫu đều được chọn được và có giao diện riêng", () => {
  assert.deepEqual([...AVAILABLE_TEMPLATES].sort(), [...TEMPLATE_IDS].sort());
  assert.equal(TEMPLATE_IDS.length, 4);
  for (const t of TEMPLATE_IDS) assert.equal(parseVoucherConfig({ template_id: t }).template_id, t, t);
  assert.equal(parseVoucherConfig({ template_id: "HACK" }).template_id, DEFAULT_VOUCHER_CONFIG.template_id);
});

test("mỗi mẫu hiển thị đủ thông tin khách cần: tên, ngày, tiền, còn lại, chính sách, QR", () => {
  for (const t of TEMPLATE_IDS) {
    const h = html(data(t));
    assert.ok(h.includes(`data-template="${t}"`), `${t}: thiếu data-template`);
    for (const must of ["Villa Đồi Thông", "Nguyễn Văn Khách", "04/12/2026", "06/12/2026", "DL-2611-889", "Cottown", "XÁC NHẬN ĐẶT PHÒNG", "Thuê xe máy", "0911222333"]) {
      assert.ok(h.includes(must), `${t}: thiếu "${must}"`);
    }
    // tiền: tổng 4.800.000đ, đã trả 2.000.000đ, còn lại 2.800.000đ
    for (const money of ["4.800.000", "2.000.000", "2.800.000", "2.200.000"]) assert.ok(h.includes(money), `${t}: thiếu ${money}`);
    assert.ok(h.includes("Chính sách phụ thu phát sinh") && h.includes("Các điều khoản và điều kiện") && h.includes("Điều khoản hủy booking"), `${t}: thiếu chính sách`);
    assert.ok(h.includes("/api/voucher/11111111-1111-4111-8111-111111111111/qr"), `${t}: thiếu QR`);
    assert.ok(h.includes('href="https://maps.example/x"') && h.includes("no-print"), `${t}: thiếu nút bản đồ`);
  }
});

test("các mẫu thực sự KHÁC nhau về cấu trúc (không phải cùng 1 giao diện)", () => {
  const out = Object.fromEntries(TEMPLATE_IDS.map((t) => [t, html(data(t))]));
  assert.equal(new Set(Object.values(out)).size, 4);
  assert.ok(out.RECEIPT_COMPACT.includes("font-mono") && out.RECEIPT_COMPACT.includes("border-dotted") && !out.RECEIPT_COMPACT.includes("<table"));
  assert.ok(out.LUXURY_MINIMAL.includes("tracking-[0.3em]") && out.LUXURY_MINIMAL.includes("font-serif"));
  assert.ok(out.GUMROAD_BRUTAL.includes("shadow-[6px_6px_0px_0px_#000]"));
  assert.ok(out.DALAT_BOUTIQUE.includes("<table") && !out.DALAT_BOUTIQUE.includes("border-dotted"));
  // bảng giá 4 cột chỉ ở các mẫu có bảng; mẫu biên lai dùng dòng chấm
  for (const t of ["DALAT_BOUTIQUE", "GUMROAD_BRUTAL", "LUXURY_MINIMAL"]) assert.ok(out[t].includes("Giá 1 đêm") && out[t].includes("<table"), t);
});

test("tắt khối trong cấu hình thì mẫu nào cũng ẩn khối đó", () => {
  for (const t of TEMPLATE_IDS) {
    const h = html(data(t, { show_price_table: false, show_vietqr: false, show_google_maps: false, show_terms_conditions: false, show_caretaker_phone: false }));
    assert.ok(!h.includes("Chi phí"), `${t}: vẫn có bảng giá`);
    assert.ok(!h.includes("/qr"), `${t}: vẫn có QR`);
    assert.ok(!h.includes("maps.example"), `${t}: vẫn có bản đồ`);
    assert.ok(!h.includes("Các điều khoản và điều kiện"), `${t}: vẫn có điều khoản`);
    assert.ok(!h.includes("0911222333"), `${t}: vẫn có SĐT quản gia`);
    assert.ok(h.includes("Điều khoản hủy booking"), `${t}: mất khối không tắt`);
  }
});

test("booking đã huỷ / hết QR: hiển thị trạng thái huỷ, không có QR", () => {
  for (const t of TEMPLATE_IDS) {
    const h = html(data(t, {}, { status: "CANCELLED", hasQr: false }));
    assert.ok(h.includes("ĐÃ HUỶ"), t);
    assert.ok(!h.includes("/qr"), t);
  }
});

test("an toàn: màu chủ đạo độc hại bị loại, tên/chính sách được escape (không chèn được HTML/CSS)", () => {
  for (const t of TEMPLATE_IDS) {
    const v = data(t);
    v.config = parseVoucherConfig({
      template_id: t,
      branding: { primary_color: 'red;background:url(//evil)"><script>x</script>', brand_name: "<img src=x onerror=alert(1)>" },
      custom_texts: { terms_conditions: "<script>alert(1)</script>\n2. ok" },
    });
    const h = html(v);
    assert.ok(!h.includes("evil") && !h.includes("<script>") && !h.includes("<img src=x"), `${t}: lọt mã độc`);
    assert.ok(h.includes("&lt;img src=x onerror=alert(1)&gt;"), `${t}: tên thương hiệu không được escape`);
    // Brutal và Receipt luôn đơn sắc (đen) nên không dùng màu chủ đạo; 2 mẫu còn lại phải quay về màu mặc định
    if (t === "DALAT_BOUTIQUE" || t === "LUXURY_MINIMAL") assert.ok(h.includes("#B08978"), `${t}: phải quay về màu mặc định`);
  }
});

test("phiếu KHÔNG chứa giá Net/hoa hồng: dữ liệu đầu vào không có và HTML không có các từ khoá nội bộ", () => {
  for (const t of TEMPLATE_IDS) {
    const h = html(data(t)).toLowerCase();
    for (const k of ["hostnet", "net_price", "netprice", "commission", "hoa hồng", "công nợ"]) assert.ok(!h.includes(k), `${t}: lộ "${k}"`);
  }
});

test("giờ nhận/trả phòng: mặc định 14:00/12:00, giá trị sai bị bỏ, hiển thị trong phiếu", () => {
  assert.deepEqual(parseVoucherConfig({}).stay_times, { checkin_time: "14:00", checkout_time: "12:00" });
  assert.deepEqual(parseVoucherConfig({ stay_times: { checkin_time: "25:99", checkout_time: "11:30" } }).stay_times, { checkin_time: "14:00", checkout_time: "11:30" });
  for (const t of TEMPLATE_IDS) {
    const v = data(t);
    v.config = parseVoucherConfig({ ...v.config, stay_times: { checkin_time: "13:15", checkout_time: "10:45" } });
    const out = html(v);
    assert.match(out, /13:15/, t);
    assert.match(out, /10:45/, t);
  }
});
