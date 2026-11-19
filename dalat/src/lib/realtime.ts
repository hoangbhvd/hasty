import IORedis from "ioredis";

/**
 * Phát sự kiện real-time tới người dùng (phòng socket `user:<id>`).
 *  - Trong tiến trình web (custom server) → emit trực tiếp qua Socket.io.
 *  - Ngoài tiến trình web (worker BullMQ) → publish lên Redis, server web nhận và chuyển tiếp.
 * Lỗi được nuốt: real-time chỉ là tiện ích, không được làm hỏng nghiệp vụ.
 */
export const RT_CHANNEL = "dalat:rt";
export const userRoom = (id: string) => `user:${id}`;

type IoLike = { to(room: string | string[]): { emit(event: string, payload: unknown): unknown } };
const g = globalThis as unknown as { __io?: IoLike; __rtPub?: IORedis };

export function setIo(io: IoLike | undefined) { g.__io = io; }

function publisher(): IORedis {
  if (!g.__rtPub) {
    const u = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
    g.__rtPub = new IORedis({
      host: u.hostname, port: Number(u.port || 6379), password: u.password ? decodeURIComponent(u.password) : undefined,
      maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true,
    });
    g.__rtPub.on("error", () => {}); // tránh log spam khi Redis tắt
  }
  return g.__rtPub;
}

export type RtMessage = { rooms: string[]; event: string; payload: unknown };

export async function emitToUsers(userIds: (string | null | undefined)[], event: string, payload: unknown): Promise<void> {
  const rooms = [...new Set(userIds.filter((x): x is string => !!x))].map(userRoom);
  if (rooms.length === 0) return;
  try {
    if (g.__io) {
      g.__io.to(rooms).emit(event, payload);
      return;
    }
    const pub = publisher();
    if (pub.status === "wait") await pub.connect();
    await Promise.race([
      pub.publish(RT_CHANNEL, JSON.stringify({ rooms, event, payload } satisfies RtMessage)),
      new Promise((_, rej) => setTimeout(() => rej(new Error("redis timeout")), 1500)),
    ]);
  } catch (e) {
    console.error("[realtime] không phát được sự kiện:", (e as Error).message);
  }
}
