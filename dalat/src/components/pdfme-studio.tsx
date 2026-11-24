"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PDFME_FIELDS, type PdfmeSchema, type PdfmeVar } from "@/lib/voucher-config";
import { imageToA4Pdf, pdfPageCount } from "@/lib/pdf-wrap";
import { detectPdfmeVarsAction, registerPdfmeBaseAction, savePdfmeAction, setVoucherModeAction } from "@/app/(app)/voucher-actions";

type DesignerLike = {
  destroy?: () => void;
  getTemplate: () => { schemas: Record<string, unknown>[][] };
  updateTemplate: (t: unknown) => void;
};

// Placeholder cho ô ảnh (QR) trong trình thiết kế: ô xám 2×2 — chỉ để nhìn thấy vị trí, không lưu
const IMG_PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNkYGD4z8DAwMDEQAYYBQAUSAEDlAP0aQAAAABJRU5ErkJggg==";
const FONT_FILES = { BeVietnamPro: "BeVietnamPro-Regular.ttf", "BeVietnamPro-Bold": "BeVietnamPro-Bold.ttf", PlayfairDisplay: "PlayfairDisplay-Regular.ttf", Montserrat: "Montserrat-Regular.ttf", "Montserrat-Bold": "Montserrat-Bold.ttf" } as const;

async function loadFonts() {
  const out: Record<string, { data: ArrayBuffer; fallback?: boolean }> = {};
  for (const [name, file] of Object.entries(FONT_FILES)) {
    const r = await fetch(`/fonts/${file}`);
    if (!r.ok) throw new Error(`Không tải được font ${file}`);
    out[name] = { data: await r.arrayBuffer(), ...(name === "BeVietnamPro" ? { fallback: true } : {}) };
  }
  return out;
}

const sampleOf = (name: string) => PDFME_FIELDS.find((f) => f.name === name)?.sample ?? "";

export function PdfmeStudio({
  propertyId, baseUrl, schemas, vars: initialVars, mode, r2Ready, previews,
}: {
  propertyId: string; baseUrl: string | null; schemas: PdfmeSchema[]; vars: PdfmeVar[]; mode: "TEMPLATE" | "CUSTOM_PDFME"; r2Ready: boolean;
  previews: { token: string; label: string }[];
}) {
  const hasBase = !!baseUrl;
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const designer = useRef<DesignerLike | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [used, setUsed] = useState<string[]>(schemas.map((s) => s.name));
  const [vars, setVars] = useState<PdfmeVar[]>(initialVars);
  const [map, setMap] = useState<Record<string, string>>(() => Object.fromEntries(initialVars.filter((v) => v.field).map((v) => [v.tag, v.field!])));
  const [sel, setSel] = useState(previews[0]?.token ?? "");

  // Dựng trình thiết kế kéo thả khi đã có PDF nền
  useEffect(() => {
    if (!hasBase || !box.current) return;
    let dead = false;
    (async () => {
      try {
        const [{ Designer }, { text, image, barcodes }, font, pdf] = await Promise.all([
          import("@pdfme/ui"), import("@pdfme/schemas"), loadFonts(),
          fetch(`/api/voucher-template/${propertyId}`).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Không tải được PDF nền"); return r.arrayBuffer(); }),
        ]);
        if (dead || !box.current) return;
        const initial = schemas.map((s) => ({ ...s, content: s.type === "image" ? IMG_PLACEHOLDER : sampleOf(s.name) }));
        const d = new Designer({
          domContainer: box.current,
          template: { basePdf: new Uint8Array(pdf), schemas: [initial] } as never,
          plugins: { text, image, qrcode: barcodes.qrcode } as never,
          options: { font, lang: "en" } as never,
        }) as unknown as DesignerLike & { onChangeTemplate: (cb: (t: { schemas: Record<string, unknown>[][] }) => void) => void };
        d.onChangeTemplate((t) => setUsed(t.schemas[0].map((s) => String(s.name))));
        designer.current = d;
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : "Không mở được trình thiết kế");
      }
    })();
    return () => { dead = true; designer.current?.destroy?.(); designer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBase, propertyId, baseUrl]);

  async function upload(f: File) {
    setBusy("Đang tải PDF nền…"); setError(undefined); setNote(undefined);
    try {
      let bytes: Uint8Array = new Uint8Array(await f.arrayBuffer());
      if (f.type === "image/png" || f.type === "image/jpeg") bytes = await imageToA4Pdf(bytes, f.type);
      else if (f.type !== "application/pdf") throw new Error("Chỉ nhận PDF, PNG hoặc JPG");
      if ((await pdfPageCount(bytes)) !== 1) throw new Error("PDF nền chỉ được có 1 trang A4");
      const res = await fetch("/api/media/presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "bcpdf", propertyId, contentType: "application/pdf", size: bytes.length }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Không tải lên được");
      const put = await fetch(j.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: new Blob([bytes as BlobPart]) });
      if (!put.ok) throw new Error("Tải lên R2 thất bại (kiểm tra CORS của bucket)");
      const r = await registerPdfmeBaseAction(propertyId);
      if (r.error) throw new Error(r.error);
      setBusy("Đang tìm biến {{...}} trong PDF…");
      const d = await detectPdfmeVarsAction(propertyId);
      if (d.error) throw new Error(d.error);
      applyDetected(d.vars ?? []);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi tải PDF"); } finally { setBusy(undefined); if (file.current) file.current.value = ""; }
  }

  function applyDetected(found: PdfmeVar[]) {
    setVars(found);
    setMap(Object.fromEntries(found.filter((v) => v.field).map((v) => [v.tag, v.field!])));
    setNote(found.length ? `Tìm thấy ${found.length} biến trong PDF. Chọn dữ liệu cho từng biến ở bảng bên dưới.` : "Không thấy biến dạng {{ten-bien}} trong PDF. Bạn vẫn có thể thêm ô thủ công bằng các nút bên dưới.");
  }

  async function rescan() {
    setBusy("Đang quét biến…"); setError(undefined); setNote(undefined);
    const d = await detectPdfmeVarsAction(propertyId);
    setBusy(undefined);
    if (d.error) setError(d.error); else applyDetected(d.vars ?? []);
  }

  /** Gán dữ liệu cho biến {{...}}: đặt ô điền đúng vị trí chữ trong PDF (thay ô cũ của biến đó nếu có). */
  function assign(v: PdfmeVar, field: string) {
    const d = designer.current;
    const prev = map[v.tag];
    setMap((m) => ({ ...m, [v.tag]: field }));
    if (!d) return;
    const t = d.getTemplate();
    let page = t.schemas[0];
    if (prev) page = page.filter((s) => s.name !== prev);
    if (field && !page.some((s) => s.name === field)) {
      const f = PDFME_FIELDS.find((x) => x.name === field)!;
      const center = v.align === "center";
      const tw = center ? Math.max(v.w, 36) : Math.max(v.room, v.w, 30);
      const tx = center ? Math.max(v.x + v.w / 2 - tw / 2, 0) : v.x;
      page.push("image" in f
        ? { name: field, type: "image", content: IMG_PLACEHOLDER, position: { x: v.x, y: v.y }, width: Math.max(v.w, 20), height: Math.max(v.h, 20) }
        : { name: field, type: "text", content: f.sample, position: { x: tx, y: v.y }, width: tw, height: v.h, fontSize: v.fontSize, fontColor: v.color, alignment: center ? "center" : "left", fontName: v.font });
    }
    t.schemas[0] = page;
    d.updateTemplate(t);
    setUsed(page.map((s) => String(s.name)));
  }

  const addField = useCallback((name: string) => {
    const d = designer.current;
    if (!d) return;
    const f = PDFME_FIELDS.find((x) => x.name === name)!;
    const t = d.getTemplate();
    const page = t.schemas[0];
    if (page.some((s) => s.name === name)) return;
    const isImg = "image" in f;
    const n = page.length;
    page.push(isImg
      ? { name, type: "image", content: IMG_PLACEHOLDER, position: { x: 150, y: 30 }, width: 30, height: 30 }
      : { name, type: "text", content: f.sample, position: { x: 20, y: 20 + (n % 12) * 12 }, width: 70, height: 8, fontSize: 12, fontColor: "#000000", alignment: "left", fontName: "BeVietnamPro" });
    d.updateTemplate(t);
    setUsed(page.map((s) => String(s.name)));
  }, []);

  async function save() {
    const d = designer.current;
    if (!d) return;
    setBusy("Đang lưu…"); setError(undefined); setNote(undefined);
    const out: PdfmeSchema[] = d.getTemplate().schemas[0].map((s) => ({
      name: String(s.name), type: s.type === "image" ? "image" : "text",
      position: s.position as { x: number; y: number }, width: Number(s.width), height: Number(s.height),
      fontSize: Number(s.fontSize ?? 12), fontColor: String(s.fontColor ?? "#000000"),
      alignment: (s.alignment as PdfmeSchema["alignment"]) ?? "left", fontName: String(s.fontName ?? "BeVietnamPro"),
    }));
    const r = await savePdfmeAction(propertyId, out, map);
    setBusy(undefined);
    if (r.error) setError(r.error); else { setNote("Đã lưu mẫu"); router.refresh(); }
  }

  async function setMode(m: "TEMPLATE" | "CUSTOM_PDFME") {
    setBusy("Đang đổi chế độ…"); setError(undefined); setNote(undefined);
    const r = await setVoucherModeAction(propertyId, m);
    setBusy(undefined);
    if (r.error) setError(r.error); else router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-black bg-white p-3 text-sm">
        <p className="font-medium">Dùng thiết kế Canva của bạn làm nền</p>
        <ol className="list-decimal space-y-1 pl-5 pt-1 text-muted-foreground">
          <li>Trong Canva, gõ sẵn các biến vào chỗ cần điền, ví dụ <code className="font-mono">{"{{var-1}}"}</code>, <code className="font-mono">{"{{var-2}}"}</code>. Xuất file A4 (1 trang) dạng PDF.</li>
          <li>Tải PDF lên: hệ thống tự nhận các biến này. Chọn dữ liệu cho từng biến (Tên khách, SĐT, Check-in…), ô điền sẽ nằm đúng chỗ đó; chữ <code className="font-mono">{"{{...}}"}</code> được che đi khi xuất phiếu.</li>
          <li>Cần thêm ô không có biến sẵn: bấm tên dữ liệu bên dưới rồi kéo thả; chỉnh cỡ chữ/màu/căn lề ở bảng bên phải.</li>
          <li>Bấm “Lưu mẫu”, rồi “Dùng mẫu này”. Giá Net và hoa hồng không bao giờ có trong danh sách biến.</li>
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" hidden accept="application/pdf,image/png,image/jpeg" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button type="button" variant="outline" className="h-11" disabled={!r2Ready || !!busy} onClick={() => file.current?.click()}>{hasBase ? "Đổi PDF nền" : "Tải PDF nền (A4)"}</Button>
        <span className={`rounded border border-black px-2 py-1 text-xs font-bold ${mode === "CUSTOM_PDFME" ? "bg-primary" : "bg-white"}`}>
          {mode === "CUSTOM_PDFME" ? "Đang dùng: PDF Canva" : "Đang dùng: Mẫu có sẵn"}
        </span>
        {!r2Ready && <span className="text-xs text-red-700">Chưa cấu hình Cloudflare R2.</span>}
      </div>

      {hasBase && (
        <>
          <section className="space-y-2 rounded border border-black bg-white p-3" aria-label="Biến trong PDF">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Biến trong PDF ({vars.length})</h3>
              <button type="button" disabled={!!busy} onClick={rescan} className="text-xs underline disabled:opacity-50">Quét lại</button>
            </div>
            {vars.length === 0
              ? <p className="text-xs text-muted-foreground">Chưa thấy biến dạng {"{{ten-bien}}"} nào. Gõ biến vào thiết kế Canva rồi tải lại PDF, hoặc bấm “Quét lại”.</p>
              : (
                <ul className="divide-y divide-black/15">
                  {vars.map((v) => (
                    <li key={v.tag} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <code className="font-mono text-sm">{`{{${v.tag}}}`}</code>
                      <select aria-label={`Dữ liệu cho ${v.tag}`} value={map[v.tag] ?? ""} onChange={(e) => assign(v, e.target.value)}
                        className="brutal-input h-10 min-w-44 bg-white px-2 text-sm">
                        <option value="">— Không điền —</option>
                        {PDFME_FIELDS.map((f) => (
                          <option key={f.name} value={f.name} disabled={Object.entries(map).some(([t, n]) => n === f.name && t !== v.tag)}>{f.label}</option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
          </section>
          <div className="flex flex-wrap gap-1.5" aria-label="Biến động">
            {PDFME_FIELDS.map((f) => (
              <button key={f.name} type="button" disabled={used.includes(f.name)} onClick={() => addField(f.name)}
                className="brutal-btn h-9 bg-white px-2 text-xs text-black disabled:bg-muted disabled:opacity-50">
                {used.includes(f.name) ? "✓ " : "+ "}{f.label}
              </button>
            ))}
          </div>
          <div ref={box} className="min-h-[560px] overflow-hidden rounded border border-black bg-muted" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="lg" className="h-12" disabled={!!busy} onClick={save}>{busy ?? "Lưu mẫu"}</Button>
            {mode === "CUSTOM_PDFME"
              ? <Button type="button" variant="outline" className="h-12" disabled={!!busy} onClick={() => setMode("TEMPLATE")}>Quay về mẫu có sẵn</Button>
              : <Button type="button" variant="outline" className="h-12" disabled={!!busy} onClick={() => setMode("CUSTOM_PDFME")}>Dùng mẫu này</Button>}
            {previews.length > 0 && (
              <span className="inline-flex items-center gap-2">
                <select aria-label="Booking xem thử" value={sel} onChange={(e) => setSel(e.target.value)} className="brutal-input h-12 max-w-56 bg-white px-2 text-sm">
                  {previews.map((p) => <option key={p.token} value={p.token}>{p.label}</option>)}
                </select>
                <a href={`/api/voucher/${sel || previews[0].token}/export?format=png&inline=1`} target="_blank" rel="noopener noreferrer" className="brutal-btn inline-flex h-12 items-center bg-white px-4 text-sm text-black">Xem thử (đã lưu)</a>
              </span>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      {note && <p role="status" className="text-sm font-medium text-green-800">{note}</p>}
    </div>
  );
}
