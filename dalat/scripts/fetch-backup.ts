// Tải bản sao lưu từ R2 về và giải mã (dùng khi khôi phục).
//   docker compose -f docker-compose.prod.yml --env-file .env exec backup-sync \
//     node_modules/.bin/tsx scripts/fetch-backup.ts latest /backups/restore.dump
//   rồi:  docker compose ... exec -T db pg_restore -U dalat -d dalat --clean --if-exists < backups/restore.dump
// Dùng `list` thay cho đường dẫn để xem các bản đang có.
import "dotenv/config";
import fs from "node:fs/promises";
import { decryptBackup } from "../src/lib/backup-crypto";
import { PREFIX, backupConfigFromEnv, s3Store } from "../src/lib/backup-sync";

async function main() {
  const [, , what, out] = process.argv;
  const cfg = backupConfigFromEnv();
  if (!cfg) { console.error("Chưa cấu hình BACKUP_R2_BUCKET"); process.exit(2); }
  const store = s3Store(cfg.store);
  const all = (await store.list(PREFIX)).sort((a, b) => b.lastModified - a.lastModified);

  if (what === "list" || !what) {
    for (const o of all) console.log(`${new Date(o.lastModified).toISOString()}  ${o.key}`);
    return;
  }
  if (!out) { console.error("Dùng: fetch-backup.ts <latest|key> <file đầu ra>   hoặc   fetch-backup.ts list"); process.exit(2); }
  const key = what === "latest" ? all[0]?.key : what;
  if (!key) { console.error("Không có bản sao lưu nào trên remote"); process.exit(1); }

  let data = await store.get(key);
  if (key.endsWith(".enc")) {
    if (!cfg.passphrase) { console.error("Bản này đã mã hoá nhưng thiếu BACKUP_ENCRYPTION_KEY"); process.exit(2); }
    data = decryptBackup(data, cfg.passphrase);
  }
  await fs.writeFile(out, data);
  console.log(`Đã ghi ${data.length} byte từ ${key} -> ${out}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
