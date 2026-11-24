// Nhận diện biến {{ten-bien}} gõ sẵn trong PDF nền (Canva) + lấy màu nền quanh chữ để che đi khi xuất phiếu.
import { PDF_VAR_TAG, type PdfmeVar } from "@/lib/voucher-config";

const PT_MM = 25.4 / 72;
const RE = /\{\{\s*([A-Za-z0-9_-]{1,40})\s*\}\}/g;

type Item = { str: string; x: number; y: number; w: number; h: number };
export type FoundVar = Omit<PdfmeVar, "field" | "cover">;
/** Đo độ rộng chuỗi (tuỳ chọn) để tính vị trí {{...}} trong một mảnh chữ chính xác hơn so với đếm ký tự. */
export type Measure = (text: string) => number;

/** Gộp các mảnh chữ cùng dòng (Canva hay tách 1 cụm chữ thành nhiều mảnh) rồi tìm {{...}}; toạ độ trả về là mm, gốc trên-trái. */
export function findVarsInItems(items: Item[], pageH: number, pageW = 0, measure?: Measure): FoundVar[] {
  const lines: Item[][] = [];
  for (const it of items) {
    if (!it.str) continue;
    const line = lines.find((l) => Math.abs(l[0].y - it.y) < Math.max(1.5, it.h * 0.3));
    if (line) line.push(it); else lines.push([it]);
  }
  const out: FoundVar[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let text = "";
    const at: { item: Item; from: number }[] = [];
    for (const it of line) { at.push({ item: it, from: text.length }); text += it.str; }
    for (const m of text.matchAll(RE)) {
      const tag = m[1];
      if (!PDF_VAR_TAG.test(tag) || seen.has(tag)) continue;
      const start = m.index!, end = start + m[0].length;
      // x theo tỉ lệ ký tự trong từng mảnh
      const xAt = (pos: number) => {
        const seg = [...at].reverse().find((a) => a.from <= pos) ?? at[0];
        const str = seg.item.str, k = pos - seg.from;
        let frac = str.length ? k / str.length : 0;
        if (measure && str.length) { const tot = measure(str); if (tot > 0) frac = measure(str.slice(0, k)) / tot; }
        return seg.item.x + seg.item.w * Math.min(Math.max(frac, 0), 1);
      };
      const x0 = xAt(start), x1 = xAt(end);
      const first = at.find((a) => a.from <= start && start < a.from + a.item.str.length) ?? at[0];
      const h = first.item.h;
      seen.add(tag);
      // Biến đứng một mình (ô bảng) → căn giữa; còn lại (sau nhãn "TÊN KHÁCH:") → căn trái, được dùng khoảng trống bên phải đến chữ kế tiếp / lề trang
      const alone = text.trim() === m[0];
      const next = line.filter((it) => it.str.trim() && it.x > x1 + 1).map((it) => it.x)[0];
      const roomEnd = next ?? (pageW ? pageW - 8 / PT_MM : x1 + 60 / PT_MM);
      const room = Math.max((roomEnd - x0) * PT_MM - 1, 0);
      const padX = 0.6, padY = 0.5; // mm: chừa lề nhỏ để che sạch nét chữ
      out.push({
        tag,
        x: Math.max(x0 * PT_MM - padX, 0), y: Math.max((pageH - first.item.y - h * 0.9) * PT_MM - padY, 0),
        w: Math.max((x1 - x0) * PT_MM + padX * 2, 4), h: h * 1.25 * PT_MM + padY * 2,
        fontSize: Math.min(Math.max(Math.round(h * 2) / 2, 6), 48), room: Math.round(room * 10) / 10, align: alone ? "center" : "left",
      });
    }
  }
  return out;
}

async function makeMeasure(): Promise<Measure | undefined> {
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const ctx = createCanvas(10, 10).getContext("2d");
    ctx.font = "bold 40px sans-serif";
    return (t) => ctx.measureText(t).width;
  } catch { return undefined; }
}

async function sampleCover(pdf: Uint8Array, found: FoundVar[], pageW: number): Promise<string[]> {
  try {
    const { pdf: open } = await import("pdf-to-img");
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const scale = 2;
    const doc = await open(Buffer.from(pdf), { scale });
    let png: Buffer;
    try { png = await doc.getPage(1); } finally { await doc.destroy(); }
    const img = await loadImage(png);
    const cv = createCanvas(img.width, img.height);
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const k = img.width / (pageW * PT_MM); // px / mm
    return found.map((f) => {
      // lấy mẫu 8 điểm ngay ngoài khung chữ, chọn màu xuất hiện nhiều nhất
      const pts: [number, number][] = [];
      for (const gap of [1.2, 2.5]) {
        for (const fx of [0, 0.25, 0.5, 0.75, 1]) { pts.push([f.x + f.w * fx, f.y - gap], [f.x + f.w * fx, f.y + f.h + gap]); }
        for (const fy of [0.25, 0.5, 0.75]) { pts.push([f.x - gap, f.y + f.h * fy], [f.x + f.w + gap, f.y + f.h * fy]); }
      }
      const count = new Map<string, number>();
      for (const [mx, my] of pts) {
        const px = Math.round(mx * k), py = Math.round(my * k);
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
        const d = ctx.getImageData(px, py, 1, 1).data;
        // làm tròn mỗi kênh về bội của 8 để các điểm gần giống nhau gộp được
        const q = (n: number) => Math.min(255, Math.round(n / 8) * 8);
        const c = `#${[d[0], d[1], d[2]].map((n) => q(n).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
        count.set(c, (count.get(c) ?? 0) + 1);
      }
      return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#FFFFFF";
    });
  } catch {
    return found.map(() => "#FFFFFF");
  }
}

/** Đọc trang 1 của PDF: các biến {{...}} (theo thứ tự từ trên xuống) kèm vị trí và màu nền để che. */
export async function detectPdfVars(pdf: Uint8Array): Promise<Omit<PdfmeVar, "field">[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const [x0, y0, x1, y1] = page.view;
    const pageW = x1 - x0, pageH = y1 - y0;
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items as { str?: string; transform: number[]; width: number; height: number }[]) {
      if (typeof it.str !== "string") continue;
      const h = it.height || Math.abs(it.transform[3]) || 10;
      items.push({ str: it.str, x: it.transform[4] - x0, y: it.transform[5] - y0, w: it.width, h });
    }
    const measure = await makeMeasure();
    const found = findVarsInItems(items, pageH, pageW, measure).sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 40);
    const covers = found.length ? await sampleCover(pdf, found, pageW) : [];
    return found.map((f, i) => ({ ...f, cover: covers[i] }));
  } finally {
    await task.destroy();
  }
}
