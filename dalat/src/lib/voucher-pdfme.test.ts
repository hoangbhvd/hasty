import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { generatePdfme, imageToA4Pdf, pdfToPng, pdfmeInputs, toPdfmeSchemas } from "./voucher-pdfme";
import { sampleVoucher } from "./voucher-sample";
import { DEFAULT_VOUCHER_CONFIG, type PdfmeSchema } from "./voucher-config";

const schemas: PdfmeSchema[] = [
  { name: "guest_name", type: "text", position: { x: 20, y: 40 }, width: 120, height: 10, fontSize: 18, fontColor: "#222222", alignment: "left", fontName: "BeVietnamPro-Bold" },
  { name: "remaining_amount", type: "text", position: { x: 20, y: 60 }, width: 120, height: 10, fontSize: 16, alignment: "right", fontName: "PlayfairDisplay" },
  { name: "vietqr_image", type: "image", position: { x: 150, y: 40 }, width: 30, height: 30 },
];

test("biến: đủ trường khách thấy, KHÔNG có giá Net/hoa hồng; ảnh QR chỉ có khi có dữ liệu", () => {
  const v = sampleVoucher(DEFAULT_VOUCHER_CONFIG);
  const inputs = pdfmeInputs(v, null);
  assert.equal(inputs.guest_name, "Nguyễn Văn Ánh");
  assert.equal(inputs.check_in_str, "14H 12/06/2026");
  assert.equal(inputs.remaining_amount, "3.000.000đ");
  assert.ok(!("vietqr_image" in inputs));
  assert.ok(!Object.keys(inputs).some((k) => /net|commission/i.test(k)));
  assert.equal(toPdfmeSchemas(schemas, inputs).length, 2); // QR bị bỏ vì chưa có dữ liệu
  assert.equal(toPdfmeSchemas(schemas, pdfmeInputs(v, "data:image/png;base64,AAAA")).length, 3);
});

test("ghép PDF nền + biến tiếng Việt → PDF 1 trang A4, rasterize ra PNG", async () => {
  // PNG 1×1 → bọc thành PDF A4 (đường nền từ ảnh)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const base = await imageToA4Pdf(png, "image/png");
  const doc = await PDFDocument.load(base);
  assert.equal(doc.getPageCount(), 1);
  const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
  assert.ok(Math.abs(w - 595.28) < 0.1 && Math.abs(h - 841.89) < 0.1);

  const inputs = pdfmeInputs(sampleVoucher(DEFAULT_VOUCHER_CONFIG), null);
  const pdf = await generatePdfme({ base_pdf_url: null, schemas }, inputs, base);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);

  const out = await pdfToPng(pdf);
  assert.equal(out.subarray(1, 4).toString(), "PNG");
  assert.ok(out.length > 1000);
});
