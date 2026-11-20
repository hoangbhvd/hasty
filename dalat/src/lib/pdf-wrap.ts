import { PDFDocument } from "pdf-lib";

/** Bọc ảnh PNG/JPG thành PDF 1 trang A4 (ảnh phủ kín trang). Dùng được cả ở trình duyệt lẫn server. */
export async function imageToA4Pdf(bytes: Uint8Array, mime: "image/png" | "image/jpeg"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const img = mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.addPage([595.28, 841.89]);
  page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  return doc.save();
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}
