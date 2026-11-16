import fs from "node:fs/promises";
import path from "node:path";
import { currentUserId } from "@/lib/auth";

const DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (!(await currentUserId())) return new Response("Unauthorized", { status: 401 });
  const { key } = await params;
  const full = path.resolve(DIR, key.join("/"));
  if (!full.startsWith(DIR + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(full);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
