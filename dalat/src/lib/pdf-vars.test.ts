import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { detectPdfVars, findVarsInItems } from "./pdf-vars";

test("ghép mảnh chữ cùng dòng rồi tìm {{biến}}", () => {
  const items = [
    { str: "Tên khách: ", x: 50, y: 700, w: 60, h: 12 },
    { str: "{{var", x: 110, y: 700, w: 25, h: 12 },
    { str: "-1}}", x: 135, y: 700, w: 20, h: 12 },
    { str: "{{ sdt }}", x: 50, y: 650, w: 45, h: 12 },
    { str: "{{var-1}} lần hai", x: 50, y: 500, w: 80, h: 12 }, // trùng tên: bỏ
  ];
  const v = findVarsInItems(items, 842);
  assert.deepEqual(v.map((x) => x.tag).sort(), ["sdt", "var-1"]);
  const v1 = v.find((x) => x.tag === "var-1")!;
  assert.ok(v1.x > 35 && v1.x < 42 && v1.w > 12); // ~110pt = 38.8mm
});

test("PDF thật: nhận biến, lấy màu nền quanh chữ để che", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(0.77, 0.61, 0.54) });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("{{var-1}}", { x: 100, y: 600, size: 16, font, color: rgb(1, 1, 1) });
  page.drawText("{{ten_khach}}", { x: 100, y: 500, size: 12, font, color: rgb(1, 1, 1) });
  const vars = await detectPdfVars(await doc.save());
  assert.deepEqual(vars.map((v) => v.tag), ["var-1", "ten_khach"]); // từ trên xuống
  const v = vars[0];
  assert.ok(Math.abs(v.x - 35.3) < 3, String(v.x)); // 100pt ≈ 35.3mm
  assert.ok(v.fontSize >= 14 && v.fontSize <= 18, String(v.fontSize));
  assert.match(v.cover, /^#C[0-9A-F]{5}$/); // nền nâu hồng (đỏ ~C4)
  assert.ok(v.cover !== "#FFFFFF");
  assert.match(v.color, /^#F[0-9A-F]F[0-9A-F]F[0-9A-F]$/); // chữ gốc màu trắng → dữ liệu cũng trắng
  assert.equal(v.font, "BeVietnamPro"); // Helvetica thường
  const d2 = await PDFDocument.create();
  d2.addPage([595.28, 841.89]).drawText("{{x}}", { x: 100, y: 600, size: 16, font: await d2.embedFont(StandardFonts.HelveticaBold) });
  assert.equal((await detectPdfVars(await d2.save()))[0].font, "BeVietnamPro-Bold");
});

test("fontFor: đậm / có chân / thường", async () => {
  const { fontFor } = await import("./pdf-vars");
  assert.equal(fontFor("ABCDEF+Arial-Bold"), "BeVietnamPro-Bold");
  assert.equal(fontFor("PlayfairDisplay-Regular"), "PlayfairDisplay");
  assert.equal(fontFor("Arial-Regular"), "BeVietnamPro");
  assert.equal(fontFor("TTCommonsProTrial-ExpandedBold"), "Montserrat-Bold");
  assert.equal(fontFor("TTCommonsPro-Regular"), "Montserrat");
  assert.equal(fontFor(undefined), "BeVietnamPro");
});

test("nhãn + biến cùng một chuỗi: khung biến khớp đúng vị trí thật (đo bằng ảnh render)", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(1, 1, 1) });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const label = "TEN KHACH WWW: ", v = "{{var-1}}";
  page.drawText(label + v, { x: 60, y: 700, size: 14, font, color: rgb(0.45, 0.35, 0.3) });
  page.drawText("SO DIEN THOAI: {{sdt}}", { x: 60, y: 676, size: 14, font, color: rgb(0.45, 0.35, 0.3) });
  const out = await detectPdfVars(await doc.save());
  const a = out.find((x) => x.tag === "var-1")!;
  const startMm = (60 + font.widthOfTextAtSize(label, 14)) * 25.4 / 72;
  const widthMm = font.widthOfTextAtSize(v, 14) * 25.4 / 72;
  assert.ok(Math.abs(a.x - startMm) < 1.5, `x=${a.x} mong đợi ${startMm}`);
  assert.ok(Math.abs(a.w - widthMm) < 2.5, `w=${a.w} mong đợi ${widthMm}`);
});
