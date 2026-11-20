/** Nén + cắt ảnh ngay trên trình duyệt trước khi upload (spec: avatar 400×400 1:1, cover ≤1200×800). WebP, nếu trình duyệt không hỗ trợ thì JPEG. */
export async function compressImage(file: File, opts: { maxW: number; maxH: number; square?: boolean; png?: boolean }): Promise<{ blob: Blob; type: "image/webp" | "image/jpeg" | "image/png" }> {
  const bmp = await createImageBitmap(file);
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height, w: number, h: number;
  if (opts.square) {
    const s = Math.min(bmp.width, bmp.height);
    sx = (bmp.width - s) / 2; sy = (bmp.height - s) / 2; sw = sh = s;
    w = h = Math.min(opts.maxW, s);
  } else {
    const k = Math.min(1, opts.maxW / bmp.width, opts.maxH / bmp.height);
    w = Math.round(bmp.width * k); h = Math.round(bmp.height * k);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  bmp.close();
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  if (opts.png) { // logo: giữ nền trong suốt
    const png = await toBlob("image/png", 1);
    if (png) return { blob: png, type: "image/png" };
  }
  const webp = await toBlob("image/webp", 0.85);
  if (webp && webp.type === "image/webp") return { blob: webp, type: "image/webp" };
  const jpg = await toBlob("image/jpeg", 0.85);
  if (!jpg) throw new Error("Không xử lý được ảnh");
  return { blob: jpg, type: "image/jpeg" };
}
