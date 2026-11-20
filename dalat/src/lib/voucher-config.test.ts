import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VOUCHER_CONFIG, parseVoucherConfig } from "./voucher-config";

test("cấu hình cũ (không có mode/logo/pdfme) vẫn đọc được với mặc định mới", () => {
  const c = parseVoucherConfig({ template_id: "LUXURY_MINIMAL", branding: { brand_name: "A" } });
  assert.equal(c.mode, "TEMPLATE");
  assert.equal(c.branding.logo_url, null);
  assert.equal(c.branding.logo_position, "CENTER");
  assert.equal(c.branding.logo_size_px, 72);
  assert.equal(c.blocks.show_logo, true);
  assert.deepEqual(c.pdfme_config, { base_pdf_url: null, schemas: [] });
  assert.deepEqual(parseVoucherConfig(null), DEFAULT_VOUCHER_CONFIG);
});

test("logo: chỉ nhận https, cỡ kẹp 40–140px, vị trí sai về mặc định", () => {
  const p = (b: Record<string, unknown>) => parseVoucherConfig({ branding: b }).branding;
  assert.equal(p({ logo_url: "http://x/y.png" }).logo_url, null);
  assert.equal(p({ logo_url: "javascript:alert(1)" }).logo_url, null);
  assert.equal(p({ logo_url: "https://r2.example/a.png" }).logo_url, "https://r2.example/a.png");
  assert.equal(p({ logo_size_px: 10 }).logo_size_px, 40);
  assert.equal(p({ logo_size_px: 999 }).logo_size_px, 140);
  assert.equal(p({ logo_size_px: "abc" }).logo_size_px, 72);
  assert.equal(p({ logo_position: "TOP" }).logo_position, "CENTER");
  assert.equal(p({ logo_position: "RIGHT" }).logo_position, "RIGHT");
});

test("pdfme: chỉ giữ biến cho phép (không bao giờ có giá Net), kẹp toạ độ, ép kiểu ảnh/chữ", () => {
  const c = parseVoucherConfig({
    mode: "CUSTOM_PDFME",
    pdfme_config: {
      base_pdf_url: "https://r2.example/bc.pdf",
      schemas: [
        { name: "guest_name", position: { x: 20, y: 30 }, width: 60, height: 8, fontSize: 14, fontColor: "#112233", alignment: "center" },
        { name: "host_net_price", position: { x: 0, y: 0 }, width: 10, height: 5 }, // bị loại
        { name: "commission_amount", position: { x: 0, y: 0 }, width: 10, height: 5 }, // bị loại
        { name: "vietqr_image", type: "text", position: { x: 999, y: -5 }, width: 5000, height: 1 },
        { name: "booking_code", fontColor: "red", fontName: "Comic" },
      ],
    },
  });
  assert.equal(c.mode, "CUSTOM_PDFME");
  assert.deepEqual(c.pdfme_config.schemas.map((s) => s.name), ["guest_name", "vietqr_image", "booking_code"]);
  const [g, q, b] = c.pdfme_config.schemas;
  assert.deepEqual([g.type, g.alignment, g.fontColor, g.fontSize], ["text", "center", "#112233", 14]);
  assert.equal(q.type, "image");
  assert.deepEqual([q.position.x, q.position.y, q.width, q.height], [210, 0, 210, 3]);
  assert.deepEqual([b.fontColor, b.fontName], ["#000000", "BeVietnamPro"]);
  assert.equal(parseVoucherConfig({ pdfme_config: { base_pdf_url: "http://x/a.pdf" } }).pdfme_config.base_pdf_url, null);
  assert.equal(parseVoucherConfig({ mode: "HACK" }).mode, "TEMPLATE");
});
