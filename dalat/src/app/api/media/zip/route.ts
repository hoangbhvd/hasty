import { Zip, ZipPassThrough } from "fflate";
import { getCurrentUser } from "@/lib/session";
import { canViewProperty } from "@/lib/access";
import { loadGallery, type MediaDto } from "@/lib/albums";
import { keyFromUrl } from "@/lib/r2";

export const runtime = "nodejs";

const safe = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "files";

/**
 * GET /api/media/zip?property=<id>&album=<albumId|general>  (bỏ `album` = cả căn)
 * Gói .zip ảnh/video sạch để CTV lấy đúng bộ khách cần. Chỉ chủ căn / CTV đã được duyệt. Stream qua, không giữ cả file trong RAM.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const propertyId = q.get("property") ?? "";
  const album = q.get("album");
  if (!/^[0-9a-f-]{36}$/.test(propertyId) || !(await canViewProperty(user.id, propertyId))) return Response.json({ error: "Không tìm thấy" }, { status: 404 });

  const g = await loadGallery(propertyId, album === "general" ? { general: true } : album ? { albumId: album } : undefined);
  if (!g) return Response.json({ error: "Không tìm thấy" }, { status: 404 });
  const files: { name: string; m: MediaDto }[] = [
    ...g.general.map((m, i) => ({ name: `Anh-chung/${String(i + 1).padStart(2, "0")}-${keyFromUrl(m.url.split("?")[0])?.split("/").pop() ?? m.id}`, m })),
    ...g.albums.flatMap((a) => a.media.map((m, i) => ({ name: `${safe(a.name)}/${String(i + 1).padStart(2, "0")}-${keyFromUrl(m.url.split("?")[0])?.split("/").pop() ?? m.id}`, m }))),
  ];
  if (files.length === 0) return Response.json({ error: "Chưa có ảnh/video" }, { status: 404 });
  const scope = album === "general" ? "anh-chung" : album ? safe(g.albums[0]?.name ?? "bo-anh") : "tat-ca";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      (async () => {
        try {
          for (const f of files) {
            const res = await fetch(f.m.url);
            if (!res.ok || !res.body) continue;
            const entry = new ZipPassThrough(f.name); // ảnh/video đã nén sẵn: chỉ đóng gói, không nén lại
            zip.add(entry);
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              entry.push(value);
            }
            entry.push(new Uint8Array(0), true);
          }
          zip.end();
        } catch (e) { controller.error(e); }
      })();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safe(g.propertyName)}-${scope}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
