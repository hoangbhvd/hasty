import { Queue, type ConnectionOptions } from "bullmq";

export const QUEUE_NAME = "bookings";
export const REMINDER_HOUR_VN = 14; // giờ check-in chuẩn 14:00

export function redisConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    maxRetriesPerRequest: null,
  };
}

/** Thời điểm nhắc: 24h trước 14:00 (giờ VN) của ngày check-in. */
export function reminderTime(checkIn: Date): Date {
  const day = checkIn.toISOString().slice(0, 10);
  const checkinAt = new Date(`${day}T${String(REMINDER_HOUR_VN).padStart(2, "0")}:00:00+07:00`);
  return new Date(checkinAt.getTime() - 24 * 3600_000);
}

let queue: Queue | undefined;
const getQueue = () => (queue ??= new Queue(QUEUE_NAME, { connection: { ...(redisConnection() as object), maxRetriesPerRequest: 1, enableOfflineQueue: false } as ConnectionOptions }));

const withTimeout = <T,>(p: Promise<T>, ms = 2500) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("redis timeout")), ms))]);

/** Không để lỗi Redis làm hỏng thao tác đặt phòng: worker còn có job quét dự phòng. */
async function safeAdd(name: string, data: object, opts: { jobId: string; delay?: number }) {
  try {
    await withTimeout(getQueue().add(name, data, { ...opts, removeOnComplete: true, removeOnFail: 100 }));
  } catch (e) {
    console.error(`[queue] không đẩy được job ${name}:`, (e as Error).message);
  }
}

export const scheduleHoldExpiry = (bookingId: string, expiresAt: Date) =>
  safeAdd("expire-hold", { bookingId }, { jobId: `hold-${bookingId}`, delay: Math.max(expiresAt.getTime() - Date.now(), 0) + 500 });

export async function scheduleCheckinReminder(bookingId: string, checkIn: Date) {
  const at = reminderTime(checkIn);
  const checkinAt = at.getTime() + 24 * 3600_000;
  if (checkinAt <= Date.now()) return; // đã qua giờ check-in
  await safeAdd("remind-checkin", { bookingId }, { jobId: `remind-${bookingId}`, delay: Math.max(at.getTime() - Date.now(), 0) });
}

export async function cancelBookingJobs(bookingId: string) {
  try {
    const q = getQueue();
    await withTimeout(Promise.all([`hold-${bookingId}`, `remind-${bookingId}`].map(async (id) => (await q.getJob(id))?.remove().catch(() => {}))));
  } catch (e) {
    console.error("[queue] không huỷ được job:", (e as Error).message);
  }
}
