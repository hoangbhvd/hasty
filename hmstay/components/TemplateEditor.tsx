"use client";

import { useEffect, useRef, useState } from "react";
import "grapesjs/dist/css/grapes.min.css";
import { saveTemplateAction } from "@/lib/actions";

type Var = { key: string; label: string };
type Props = { id: string; name: string; project: unknown; html: string; css: string; variables: Var[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ed = any;

const HANDLES = { tl: true, tc: true, tr: true, cl: true, cr: true, bl: true, bc: true, br: true };

/** Thu ảnh về tối đa 1000px (JPEG ~80%) rồi nhúng thẳng vào mẫu dạng data URL để mẫu tự chứa. */
async function toDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d")!;
  if (file.type !== "image/png") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.82);
}

export default function TemplateEditor({ id, name: initialName, project, html, css, variables }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const ed = useRef<Ed>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const count = useRef(0);
  const [name, setName] = useState(initialName);
  const [tab, setTab] = useState<"style" | "layers" | "traits">("style");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(false);

  useEffect(() => {
    let editor: Ed;
    let dead = false;
    (async () => {
      const grapesjs = (await import("grapesjs")).default;
      if (dead || !box.current) return;
      editor = grapesjs.init({
        container: box.current,
        height: "100%",
        width: "auto",
        fromElement: false,
        storageManager: false,
        panels: { defaults: [] },
        // Kiểu Canva: kéo thả tự do trên trang, đổi cỡ bằng tay nắm
        dragMode: "absolute",
        styleManager: {
          appendTo: "#gjs-styles",
          sectors: [
            { name: "Chữ", open: true, properties: [
              { extend: "font-family", label: "Phông chữ", options: [
                { id: "Arial, Helvetica, sans-serif", label: "Arial" }, { id: "Tahoma, Geneva, sans-serif", label: "Tahoma" },
                { id: "Verdana, Geneva, sans-serif", label: "Verdana" }, { id: "'Times New Roman', Times, serif", label: "Times New Roman" },
                { id: "Georgia, serif", label: "Georgia" }, { id: "'Courier New', monospace", label: "Courier New" } ] },
              { extend: "font-size", label: "Cỡ chữ" }, { extend: "font-weight", label: "Độ đậm" },
              { extend: "color", label: "Màu chữ" }, { extend: "text-align", label: "Căn lề" },
              { extend: "line-height", label: "Giãn dòng" }, { extend: "letter-spacing", label: "Giãn chữ" },
            ] },
            { name: "Nền & viền", open: true, properties: [
              { extend: "background-color", label: "Màu nền" }, { extend: "border-radius", label: "Bo góc" },
              { extend: "border", label: "Viền" }, { extend: "opacity", label: "Độ trong suốt" },
            ] },
            { name: "Vị trí & kích thước", open: true, properties: [
              { extend: "left", label: "Trái" }, { extend: "top", label: "Trên" },
              { extend: "width", label: "Rộng" }, { extend: "height", label: "Cao" }, { extend: "z-index", label: "Lớp (z)" },
            ] },
          ],
        },
        layerManager: { appendTo: "#gjs-layers" },
        traitManager: { appendTo: "#gjs-traits" },
        canvas: { styles: [] },
        assetManager: {
          // Tự xử lý tải ảnh: nén rồi lưu thành data URL trong mẫu
          uploadFile: async (e: DragEvent) => {
            const input = e.target as HTMLInputElement | null;
            const files = Array.from(e.dataTransfer?.files ?? input?.files ?? []);
            for (const f of files) {
              if (!f.type.startsWith("image/")) continue;
              const src = await toDataUrl(f);
              editor.AssetManager.add({ src, name: f.name });
            }
          },
        },
      });
      ed.current = editor;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __gjs?: Ed }).__gjs = editor; // chỉ để kiểm thử khi dev

      // Trang A4 cố định: không kéo/xoá/nhân đôi được
      editor.DomComponents.addType("hm-page", {
        isComponent: (el: HTMLElement) => el.classList?.contains("hm-page") ? { type: "hm-page" } : undefined,
        model: { defaults: { name: "Trang", draggable: false, removable: false, copyable: false, resizable: false } },
      });

      // Mọi phần tử trên trang đều đổi cỡ được bằng 8 tay nắm
      const arm = (c: Ed) => { if (c.get("type") !== "hm-page" && c.get("type") !== "wrapper") c.set({ resizable: HANDLES }); };
      editor.on("component:add", arm);
      editor.on("component:selected", (c: Ed) => { arm(c); setSel(c.get("type") !== "hm-page" && c.get("type") !== "wrapper"); });
      editor.on("component:deselected", () => setSel(!!editor.getSelected()));

      if (project && typeof project === "object") editor.loadProjectData(project);
      else { editor.setComponents(html); editor.setStyle(css); }
      editor.getWrapper().find("*").forEach(arm);

      editor.on("load", () => {
        // Nền xám quanh trang, đổ bóng cho trang (chỉ trong trình soạn)
        const doc = editor.Canvas.getDocument();
        const st = doc.createElement("style");
        st.textContent = "body{background:#e2e8f0 !important;padding:16px 0}.hm-page{box-shadow:0 2px 12px rgba(0,0,0,.2)}";
        doc.head.appendChild(st);
      });
    })();
    return () => { dead = true; ed.current = null; editor?.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Thêm phần tử vào giữa-trái của trang, so le một chút để không chồng khít nhau. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function add(def: any) {
    const e = ed.current;
    if (!e) return;
    const page = e.getWrapper().find(".hm-page")[0] ?? e.getWrapper();
    const n = (count.current++ % 8) * 18;
    const [c] = page.append({ ...def, style: { position: "absolute", left: `${70 + n}px`, top: `${90 + n}px`, ...def.style } });
    arm2(c);
    e.select(c);
  }
  const arm2 = (c: Ed) => c?.set({ resizable: HANDLES });

  const addText = (content: string, style: Record<string, string> = {}) =>
    add({ type: "text", content, style: { width: "280px", "font-size": "16px", ...style } });

  async function addImage(f: File | undefined) {
    if (!f || !f.type.startsWith("image/")) return;
    const src = await toDataUrl(f);
    add({ type: "image", attributes: { src }, style: { width: "200px", height: "auto", "object-fit": "cover" } });
    if (fileIn.current) fileIn.current.value = "";
  }

  function layer(delta: number) {
    const s = ed.current?.getSelected();
    if (!s) return;
    const z = Number(s.getStyle()["z-index"]) || 1;
    s.addStyle({ "z-index": String(Math.max(0, z + delta)) });
  }
  function duplicate() {
    const s = ed.current?.getSelected();
    if (!s || !s.parent()) return;
    const st = s.getStyle();
    const c = s.clone();
    s.parent().append(c, { at: s.index() + 1 });
    c.addStyle({ left: `${(parseInt(st.left) || 0) + 20}px`, top: `${(parseInt(st.top) || 0) + 20}px` });
    arm2(c); ed.current.select(c);
  }
  function remove() {
    const s = ed.current?.getSelected();
    if (s && s.get("type") !== "hm-page") s.remove();
  }

  async function save(preview: boolean) {
    const e = ed.current;
    if (!e) return;
    setBusy(true); setMsg(null);
    const r = await saveTemplateAction(id, name, e.getHtml(), e.getCss(), e.getProjectData());
    setBusy(false);
    setMsg({ ok: r.ok, text: r.ok ? "Đã lưu." : r.error ?? "Lỗi" });
    if (r.ok && preview) window.open(`/api/template-preview/${id}`, "_blank");
  }

  const tabBtn = (t: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(t)} className={`flex-1 px-2 py-1.5 text-xs font-medium ${tab === t ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>
  );
  const tool = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";

  return (
    <div className="space-y-2">
      <style>{`.gjs-resizer-h{width:14px!important;height:14px!important;margin:-2px;border:2px solid #0f766e!important;background:#fff!important;border-radius:3px}.gjs-toolbar{background:#0f766e!important}`}</style>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1"><label className="label">Tên mẫu</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button type="button" className="btn-ghost" onClick={() => ed.current?.UndoManager.undo()}>Hoàn tác</button>
        <button type="button" className="btn-ghost" onClick={() => ed.current?.UndoManager.redo()}>Làm lại</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => save(true)}>Lưu &amp; xem thử</button>
        <button type="button" className="btn" disabled={busy} onClick={() => save(false)}>{busy ? "Đang lưu..." : "Lưu"}</button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <span className="text-xs font-semibold text-slate-500">Thêm:</span>
        <button type="button" className={tool} onClick={() => addText("Tiêu đề", { "font-size": "28px", "font-weight": "bold", width: "400px" })}>Tiêu đề</button>
        <button type="button" className={tool} onClick={() => addText("Nhập nội dung...")}>Văn bản</button>
        <button type="button" className={tool} onClick={() => fileIn.current?.click()}>Ảnh / Logo</button>
        <button type="button" className={tool} onClick={() => add({ tagName: "div", style: { width: "240px", height: "100px", "background-color": "#0f766e" } })}>Khung màu</button>
        <button type="button" className={tool} onClick={() => add({ tagName: "div", style: { width: "300px", height: "2px", "background-color": "#94a3b8" } })}>Đường kẻ</button>
        <input ref={fileIn} type="file" accept="image/*" className="hidden" onChange={(e) => addImage(e.target.files?.[0])} />
        <span className="mx-1 h-6 w-px bg-slate-300" />
        <button type="button" className={tool} disabled={!sel} onClick={duplicate}>Nhân đôi</button>
        <button type="button" className={tool} disabled={!sel} onClick={() => layer(1)}>Lên trên</button>
        <button type="button" className={tool} disabled={!sel} onClick={() => layer(-1)}>Xuống dưới</button>
        <button type="button" className={`${tool} !text-red-700`} disabled={!sel} onClick={remove}>Xoá</button>
      </div>
      <p className="text-xs text-slate-500">Bấm vào phần tử để chọn, <b>kéo để di chuyển</b>, kéo các <b>chấm ở góc/cạnh</b> để đổi kích thước. Bấm đúp vào chữ để sửa. Cột trái: bấm một “biến” để chèn thông tin tự điền (tên khách, ngày, tiền...).</p>

      <div className="grid h-[75vh] grid-cols-[150px_1fr_230px] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-y-auto border-r border-slate-200 p-2">
          <p className="mb-2 text-xs font-semibold text-slate-500">Biến tự điền</p>
          <div className="space-y-1.5">
            {variables.map((v) => (
              <button key={v.key} type="button" onClick={() => addText(`{{${v.key}}}`, { width: "200px" })}
                className="block w-full rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs hover:bg-teal-50">{v.label}</button>
            ))}
          </div>
        </div>
        <div ref={box} className="min-w-0" />
        <div className="flex min-h-0 flex-col border-l border-slate-200">
          <div className="flex">{tabBtn("style", "Kiểu")}{tabBtn("traits", "Thuộc tính")}{tabBtn("layers", "Lớp")}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div id="gjs-styles" style={{ display: tab === "style" ? "block" : "none" }} />
            <div id="gjs-traits" style={{ display: tab === "traits" ? "block" : "none" }} />
            <div id="gjs-layers" style={{ display: tab === "layers" ? "block" : "none" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
