"use client";

import { useEffect, useRef, useState } from "react";
import "grapesjs/dist/css/grapes.min.css";
import { saveTemplateAction } from "@/lib/actions";

type Var = { key: string; label: string };
type Props = { id: string; name: string; project: unknown; html: string; css: string; variables: Var[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ed = any;

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
  const [name, setName] = useState(initialName);
  const [tab, setTab] = useState<"style" | "layers" | "traits">("style");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
        blockManager: { appendTo: "#gjs-blocks" },
        styleManager: { appendTo: "#gjs-styles" },
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

      const B = editor.Blocks;
      const sec = "Bố cục";
      B.add("tieu-de", { label: "Tiêu đề", category: sec, content: '<h1 style="margin:0 0 8px;font-size:24px">Tiêu đề</h1>' });
      B.add("doan-van", { label: "Đoạn văn", category: sec, content: '<p style="margin:0 0 8px">Nhập nội dung...</p>' });
      B.add("hinh-anh", { label: "Hình ảnh / Logo", category: sec, content: { type: "image", style: { "max-width": "100%", height: "auto" }, activeOnRender: 1 } });
      B.add("hai-cot", { label: "2 cột", category: sec, content: '<div style="display:flex;gap:16px"><div style="flex:1;padding:8px">Cột trái</div><div style="flex:1;padding:8px">Cột phải</div></div>' });
      B.add("khung-mau", { label: "Khung nền màu", category: sec, content: '<div style="background:#0f766e;color:#fff;padding:20px;text-align:center;border-radius:6px">Nội dung nổi bật</div>' });
      B.add("bang", { label: "Bảng thông tin", category: sec, content: '<table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;width:35%;color:#64748b">Nhãn</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">Giá trị</td></tr><tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Nhãn</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">Giá trị</td></tr></table>' });
      B.add("duong-ke", { label: "Đường kẻ", category: sec, content: '<hr style="border:0;border-top:1px solid #cbd5e1;margin:16px 0">' });
      B.add("khoang-trong", { label: "Khoảng trống", category: sec, content: '<div style="height:32px"></div>' });
      for (const v of variables) {
        B.add("var-" + v.key, { label: v.label, category: "Biến booking (tự điền)", content: `<span>{{${v.key}}}</span>` });
      }

      if (project && typeof project === "object") editor.loadProjectData(project);
      else { editor.setComponents(html); editor.setStyle(css); }
    })();
    return () => { dead = true; ed.current = null; editor?.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1"><label className="label">Tên mẫu</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button type="button" className="btn-ghost" onClick={() => ed.current?.UndoManager.undo()}>Hoàn tác</button>
        <button type="button" className="btn-ghost" onClick={() => ed.current?.UndoManager.redo()}>Làm lại</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => save(true)}>Lưu &amp; xem thử</button>
        <button type="button" className="btn" disabled={busy} onClick={() => save(false)}>{busy ? "Đang lưu..." : "Lưu"}</button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <p className="text-xs text-slate-500">Kéo khối từ cột trái vào trang. Chọn “Biến booking” để chèn thông tin tự điền. Bấm đúp vào chữ để sửa. Ảnh/logo được nén và nhúng thẳng vào mẫu.</p>
      <div className="grid h-[75vh] grid-cols-[210px_1fr_250px] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div id="gjs-blocks" className="overflow-y-auto border-r border-slate-200" />
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
