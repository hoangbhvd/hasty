// Dịch vụ giám sát: kiểm tra định kỳ, báo quản trị viên qua Telegram/email khi có sự cố và khi hồi phục.
// Chạy trong docker compose (service `monitor`). Biến môi trường: xem .env.production.example.
import "dotenv/config";
import fs from "node:fs/promises";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import { prisma } from "../src/lib/db";
import { QUEUE_NAME, redisConnection } from "../src/lib/queue";
import { sendTelegram } from "../src/lib/telegram";
import { sendMail } from "../src/lib/mailer";
import { DEFAULTS, formatAlert, step, type Alert, type CheckResult, type State } from "../src/lib/monitor-core";
import {
  WORKER_HEARTBEAT_KEY, checkBackups, checkBackupSync, checkDb, checkDisk, checkQueueFailed, checkRedis, checkStuckHolds, checkWeb, checkWorker,
} from "../src/lib/monitor-checks";

const env = process.env;
const INTERVAL_MS = (Number(env.MONITOR_INTERVAL_SEC) || 60) * 1000;
const HOST = env.MONITOR_HOST_LABEL || "dalat";
const WEB_URL = env.MONITOR_WEB_URL || "http://web:3000/api/health";
const BACKUP_DIR = env.MONITOR_BACKUP_DIR ?? "/backups"; // đặt rỗng để bỏ qua kiểm tra sao lưu
const THRESHOLD = Number(env.MONITOR_FAIL_THRESHOLD) || DEFAULTS.threshold;
const REMINDER_MS = (Number(env.MONITOR_REMINDER_HOURS) || 6) * 3600_000;
const ADMIN_CHAT = env.ADMIN_TELEGRAM_CHAT_ID;
const ADMIN_EMAIL = env.ADMIN_EMAIL;

const nodeFs = {
  readdir: (d: string) => fs.readdir(d),
  stat: (p: string) => fs.stat(p),
  readFile: (p: string) => fs.readFile(p, "utf8"),
};

async function notifyAdmin(text: string) {
  console.log(`[monitor] ${text.replace(/\n/g, " | ")}`);
  await Promise.allSettled([
    ADMIN_CHAT ? sendTelegram(ADMIN_CHAT, text) : Promise.resolve(false),
    ADMIN_EMAIL ? sendMail(ADMIN_EMAIL, text.split("\n")[0].slice(0, 120), text) : Promise.resolve(false),
  ]);
}

async function main() {
  if (!ADMIN_CHAT && !ADMIN_EMAIL) console.warn("[monitor] CHƯA cấu hình ADMIN_TELEGRAM_CHAT_ID / ADMIN_EMAIL: cảnh báo chỉ ghi vào log!");

  const redis = new IORedis({ ...(redisConnection() as object), lazyConnect: false } as never);
  redis.on("error", () => {}); // lỗi Redis được phản ánh qua check, không làm sập tiến trình
  const queue = new Queue(QUEUE_NAME, { connection: redisConnection() });
  queue.on("error", () => {});

  async function runChecks(): Promise<CheckResult[]> {
    const now = Date.now();
    const tasks: Promise<CheckResult>[] = [
      checkWeb(WEB_URL),
      checkDb(() => prisma.$queryRaw`SELECT 1`),
      checkRedis(() => redis.ping()),
      checkWorker(() => redis.get(WORKER_HEARTBEAT_KEY), now),
      checkStuckHolds(() => prisma.booking.count({ where: { status: "HOLDING", holdExpiresAt: { lt: new Date(now - 5 * 60_000) } } })),
      checkQueueFailed(async () => (await queue.getJobCounts("failed")).failed ?? 0),
      checkDisk(() => fs.statfs(BACKUP_DIR || "/")),
    ];
    if (BACKUP_DIR) tasks.push(checkBackups(BACKUP_DIR, now, nodeFs));
    if (BACKUP_DIR && env.BACKUP_R2_BUCKET) tasks.push(checkBackupSync(`${BACKUP_DIR}/.sync-status.json`, now, nodeFs));
    return Promise.all(tasks);
  }

  let state: State = {};
  async function cycle() {
    let results: CheckResult[];
    try {
      results = await runChecks();
    } catch (e) {
      console.error("[monitor] lỗi khi chạy kiểm tra:", e);
      return;
    }
    const r = step(state, results, Date.now(), { threshold: THRESHOLD, reminderMs: REMINDER_MS });
    state = r.state;
    for (const a of r.alerts as Alert[]) await notifyAdmin(formatAlert(a, HOST));
    const bad = results.filter((x) => !x.ok).map((x) => x.name);
    if (bad.length) console.log(`[monitor] đang lỗi: ${bad.join(", ")}`);
    // "Dead-man's switch": ping dịch vụ bên ngoài (healthchecks.io, Better Stack...). Ngừng ping = cả VPS/Docker có vấn đề.
    if (env.HEARTBEAT_URL) await fetch(env.HEARTBEAT_URL, { signal: AbortSignal.timeout(5000) }).catch(() => {});
  }

  await notifyAdmin(`🟢 [${HOST}] Giám sát đã khởi động (kiểm tra mỗi ${Math.round(INTERVAL_MS / 1000)} giây).`);
  await cycle();
  const timer = setInterval(() => { cycle().catch((e) => console.error("[monitor]", e)); }, INTERVAL_MS);
  const stop = async () => { clearInterval(timer); await queue.close(); redis.disconnect(); await prisma.$disconnect(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
