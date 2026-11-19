import "dotenv/config";
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { WORKER_HEARTBEAT_KEY } from "../src/lib/monitor-checks";
import { QUEUE_NAME, redisConnection } from "../src/lib/queue";
import { expireHold, sendCheckinReminder, sweepExpiredHolds } from "../src/lib/booking-jobs";
import { closeExpiredRequests } from "../src/lib/requests";

async function main() {
  const connection = redisConnection();

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "expire-hold":
          return expireHold(job.data.bookingId);
        case "remind-checkin":
          return sendCheckinReminder(job.data.bookingId);
        case "sweep": {
          const n = await sweepExpiredHolds();
          if (n) console.log(`[worker] sweep: nhả ${n} booking quá hạn`);
          const q = await closeExpiredRequests();
          if (q) console.log(`[worker] sweep: đóng ${q} yêu cầu tìm gấp hết hạn`);
          return n + q;
        }
        default:
          console.warn(`[worker] job không rõ: ${job.name}`);
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => console.error(`[worker] ${job?.name} #${job?.id} lỗi:`, err.message));
  worker.on("completed", (job, result) => console.log(`[worker] ${job.name} #${job.id} xong ->`, result));

  // Job lặp mỗi phút: lưới an toàn nếu job nhả phòng bị mất/trễ
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.upsertJobScheduler("sweep-expired-holds", { every: 60_000 }, { name: "sweep" });

  // Nhịp tim: ghi mốc thời gian vào Redis mỗi 30 giây (hết hạn sau 120 giây). Dịch vụ giám sát báo nếu không thấy.
  const hb = new IORedis({ ...(connection as object) } as never);
  hb.on("error", () => {});
  const beat = () => hb.set(WORKER_HEARTBEAT_KEY, String(Date.now()), "EX", 120).catch(() => {});
  await beat();
  const hbTimer = setInterval(beat, 30_000);

  console.log(`[worker] đang chạy (TZ=${process.env.TZ ?? "?"})`);
  const stop = async () => { clearInterval(hbTimer); hb.disconnect(); await worker.close(); await queue.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
