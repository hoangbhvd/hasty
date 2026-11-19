// Đồng bộ các bản sao lưu DB (do service backup-db tạo) lên bucket R2 RIÊNG, mã hoá bằng BACKUP_ENCRYPTION_KEY.
import "dotenv/config";
import fs from "node:fs/promises";
import { backupConfigFromEnv, s3Store, syncBackups } from "../src/lib/backup-sync";

const DIR = process.env.BACKUP_DIR || "/backups";
const EVERY_MS = (Number(process.env.BACKUP_SYNC_INTERVAL_SEC) || 3600) * 1000;
const STATUS = `${DIR}/.sync-status.json`;

async function readStatus(): Promise<{ lastOk?: number }> {
  try { return JSON.parse(await fs.readFile(STATUS, "utf8")); } catch { return {}; }
}
const writeStatus = (o: object) => fs.writeFile(STATUS, JSON.stringify(o)).catch((e) => console.error("[backup-sync] không ghi được trạng thái:", e.message));

async function main() {
  let cfg: ReturnType<typeof backupConfigFromEnv>;
  try {
    cfg = backupConfigFromEnv();
  } catch (e) {
    console.error("[backup-sync] cấu hình sai:", (e as Error).message);
    await writeStatus({ lastRun: Date.now(), lastError: (e as Error).message });
    return idle();
  }
  if (!cfg) { console.log("[backup-sync] chưa bật (thiếu BACKUP_R2_BUCKET). Dịch vụ ở chế độ chờ."); return idle(); }
  if (!cfg.passphrase) console.warn("[backup-sync] CẢNH BÁO: chưa đặt BACKUP_ENCRYPTION_KEY — bản sao lưu sẽ được tải lên KHÔNG mã hoá.");

  const store = s3Store(cfg.store);
  const run = async () => {
    const prev = await readStatus();
    try {
      const r = await syncBackups({
        dir: DIR, store, now: Date.now(), retentionDays: cfg!.retentionDays, passphrase: cfg!.passphrase,
        fs: { readdir: (d) => fs.readdir(d), readFile: (p) => fs.readFile(p) },
      });
      console.log(`[backup-sync] xong: tải lên ${r.uploaded}, xoá ${r.removed} bản quá ${cfg!.retentionDays} ngày`);
      await writeStatus({ lastRun: Date.now(), lastOk: Date.now(), ...r });
    } catch (e) {
      console.error("[backup-sync] LỖI:", (e as Error).message);
      await writeStatus({ lastRun: Date.now(), lastOk: prev.lastOk, lastError: (e as Error).message });
    }
  };
  await run();
  setInterval(run, EVERY_MS);
}

/** Giữ tiến trình sống (restart: unless-stopped sẽ không bị lặp khởi động liên tục khi chưa cấu hình). */
function idle() { setInterval(() => {}, 3600_000); }

main().catch((e) => { console.error(e); process.exit(1); });
