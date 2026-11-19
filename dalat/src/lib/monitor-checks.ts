import type { CheckResult } from "@/lib/monitor-core";

export const WORKER_HEARTBEAT_KEY = "dalat:worker:heartbeat";
const HOUR = 3600_000;
const fail = (name: string, detail: string): CheckResult => ({ name, ok: false, detail });
const ok = (name: string): CheckResult => ({ name, ok: true });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function checkWeb(url: string, f: typeof fetch = fetch): Promise<CheckResult> {
  try {
    const r = await f(url, { signal: AbortSignal.timeout(5000), headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) return fail("web", `HTTP ${r.status} từ ${url}`);
    const j = (await r.json().catch(() => null)) as { ok?: boolean } | null;
    return j?.ok === true ? ok("web") : fail("web", "Phản hồi sức khoẻ không hợp lệ");
  } catch (e) {
    return fail("web", `Không kết nối được ${url}: ${msg(e)}`);
  }
}

export async function checkDb(ping: () => Promise<unknown>): Promise<CheckResult> {
  try { await ping(); return ok("db"); } catch (e) { return fail("db", `DB không trả lời: ${msg(e)}`); }
}

export async function checkRedis(ping: () => Promise<unknown>): Promise<CheckResult> {
  try { await ping(); return ok("redis"); } catch (e) { return fail("redis", `Redis không trả lời: ${msg(e)}`); }
}

/** Worker ghi nhịp tim vào Redis mỗi 30 giây; quá `maxAgeMs` không thấy nghĩa là worker chết/kẹt. */
export async function checkWorker(read: () => Promise<string | null>, now: number, maxAgeMs = 120_000): Promise<CheckResult> {
  try {
    const v = await read();
    if (!v) return fail("worker", "Không thấy nhịp tim của worker (worker chưa chạy hoặc đã dừng)");
    const age = now - Number(v);
    if (!Number.isFinite(age)) return fail("worker", "Nhịp tim worker không hợp lệ");
    return age <= maxAgeMs ? ok("worker") : fail("worker", `Worker im lặng ${Math.round(age / 1000)} giây`);
  } catch (e) {
    return fail("worker", `Không đọc được nhịp tim worker: ${msg(e)}`);
  }
}

/** Giữ phòng đã quá hạn > 5 phút mà vẫn HOLDING = job nhả phòng và job quét đều không chạy. */
export async function checkStuckHolds(count: () => Promise<number>): Promise<CheckResult> {
  try {
    const n = await count();
    return n === 0 ? ok("holds") : fail("holds", `${n} booking giữ phòng đã quá hạn hơn 5 phút mà chưa được nhả`);
  } catch (e) {
    return fail("holds", `Không kiểm tra được: ${msg(e)}`);
  }
}

export type FsLike = {
  readdir(dir: string): Promise<string[]>;
  stat(path: string): Promise<{ mtimeMs: number }>;
  readFile(path: string): Promise<string>;
};

export async function checkBackups(dir: string, now: number, fs: FsLike, maxAgeH = 26): Promise<CheckResult> {
  try {
    const files = (await fs.readdir(dir)).filter((f) => /^dalat-.*\.dump$/.test(f));
    if (files.length === 0) return fail("backup", `Chưa có bản sao lưu nào trong ${dir}`);
    const times = await Promise.all(files.map(async (f) => (await fs.stat(`${dir}/${f}`)).mtimeMs));
    const age = now - Math.max(...times);
    return age <= maxAgeH * HOUR ? ok("backup") : fail("backup", `Bản sao lưu mới nhất đã ${Math.round(age / HOUR)} giờ tuổi (ngưỡng ${maxAgeH} giờ)`);
  } catch (e) {
    return fail("backup", `Không đọc được thư mục sao lưu: ${msg(e)}`);
  }
}

/** Dịch vụ đẩy sao lưu ra R2 ghi `.sync-status.json` sau mỗi lần chạy. */
export async function checkBackupSync(statusPath: string, now: number, fs: FsLike, maxAgeH = 26): Promise<CheckResult> {
  try {
    const s = JSON.parse(await fs.readFile(statusPath)) as { lastOk?: number; lastError?: string };
    if (!s.lastOk) return fail("backup-sync", `Chưa đồng bộ thành công lần nào${s.lastError ? `: ${s.lastError}` : ""}`);
    const age = now - s.lastOk;
    if (age > maxAgeH * HOUR) return fail("backup-sync", `Lần đồng bộ thành công gần nhất cách đây ${Math.round(age / HOUR)} giờ${s.lastError ? ` — lỗi: ${s.lastError}` : ""}`);
    return ok("backup-sync");
  } catch (e) {
    return fail("backup-sync", `Không đọc được trạng thái đồng bộ: ${msg(e)}`);
  }
}

export async function checkDisk(stat: () => Promise<{ blocks: number | bigint; bavail: number | bigint }>, maxUsed = 0.9): Promise<CheckResult> {
  try {
    const s = await stat();
    const blocks = Number(s.blocks), avail = Number(s.bavail);
    if (!blocks) return ok("disk");
    const used = 1 - avail / blocks;
    return used < maxUsed ? ok("disk") : fail("disk", `Đĩa đã dùng ${Math.round(used * 100)}% (ngưỡng ${Math.round(maxUsed * 100)}%)`);
  } catch (e) {
    return fail("disk", `Không đọc được dung lượng đĩa: ${msg(e)}`);
  }
}

export async function checkQueueFailed(failedCount: () => Promise<number>, max = 20): Promise<CheckResult> {
  try {
    const n = await failedCount();
    return n <= max ? ok("queue") : fail("queue", `${n} job nền bị lỗi (ngưỡng ${max}) — xem log worker`);
  } catch (e) {
    return fail("queue", `Không kiểm tra được hàng đợi: ${msg(e)}`);
  }
}
