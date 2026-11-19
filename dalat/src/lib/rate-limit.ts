import { createHash } from "node:crypto";
import IORedis from "ioredis";

/** Kho đếm có hạn dùng: Redis (nhiều tiến trình) hoặc bộ nhớ (dự phòng khi Redis tắt / khi test). */
export type Store = {
  /** Tăng bộ đếm của khoá; đặt hạn `windowSec` ở lần tăng đầu tiên. Trả về giá trị sau khi tăng và số giây còn lại. */
  incr(key: string, windowSec: number): Promise<{ count: number; ttl: number }>;
  peek(key: string): Promise<{ count: number; ttl: number }>;
  del(key: string): Promise<void>;
};

export function memoryStore(now: () => number = Date.now): Store {
  const m = new Map<string, { count: number; expires: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.expires <= now()) { m.delete(k); return undefined; }
    return e;
  };
  return {
    async incr(key, windowSec) {
      const e = live(key) ?? { count: 0, expires: now() + windowSec * 1000 };
      e.count++;
      m.set(key, e);
      return { count: e.count, ttl: Math.max(Math.ceil((e.expires - now()) / 1000), 1) };
    },
    async peek(key) {
      const e = live(key);
      return e ? { count: e.count, ttl: Math.max(Math.ceil((e.expires - now()) / 1000), 1) } : { count: 0, ttl: 0 };
    },
    async del(key) { m.delete(key); },
  };
}

export function redisStore(url = process.env.REDIS_URL ?? "redis://localhost:6380"): Store {
  const u = new URL(url);
  const r = new IORedis({
    host: u.hostname, port: Number(u.port || 6379), password: u.password ? decodeURIComponent(u.password) : undefined,
    maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true, connectTimeout: 1500,
  });
  r.on("error", () => {});
  const ready = async () => { if (r.status === "wait" || r.status === "end") await r.connect(); };
  return {
    async incr(key, windowSec) {
      await ready();
      const count = await r.incr(key);
      if (count === 1) await r.expire(key, windowSec);
      const ttl = await r.ttl(key);
      return { count, ttl: ttl > 0 ? ttl : windowSec };
    },
    async peek(key) {
      await ready();
      const [v, ttl] = await Promise.all([r.get(key), r.ttl(key)]);
      return { count: v ? Number(v) : 0, ttl: ttl > 0 ? ttl : 0 };
    },
    async del(key) { await ready(); await r.del(key); },
  };
}

/** Thử `primary`; lỗi (Redis tắt) thì dùng `fallback` để vẫn có giới hạn thay vì mở toang. */
export function resilientStore(primary: Store, fallback: Store): Store {
  const run = async <T>(f: (s: Store) => Promise<T>): Promise<T> => {
    try { return await f(primary); } catch { return f(fallback); }
  };
  return { incr: (k, w) => run((s) => s.incr(k, w)), peek: (k) => run((s) => s.peek(k)), del: (k) => run((s) => s.del(k)) };
}

let defaultStore: Store | undefined;
const store = () => (defaultStore ??= resilientStore(redisStore(), memoryStore()));
/** Dành cho test. */
export function setStore(s: Store | undefined) { defaultStore = s; }

/** Băm định danh (SĐT/email) để không lưu thông tin cá nhân dạng rõ trong khoá Redis. */
export const keyOf = (scope: string, id: string) => `rl:${scope}:${createHash("sha256").update(id.trim().toLowerCase()).digest("hex").slice(0, 24)}`;

export type Rule = { limit: number; windowSec: number };
export type Verdict = { allowed: boolean; retryAfterSec: number };

/** Mỗi lần gọi tính 1 lượt (đăng ký, quên mật khẩu...). */
export async function hit(key: string, rule: Rule, s: Store = store()): Promise<Verdict> {
  const { count, ttl } = await s.incr(key, rule.windowSec);
  return { allowed: count <= rule.limit, retryAfterSec: count <= rule.limit ? 0 : ttl };
}

/** Chỉ xem đã bị khoá chưa (không tính lượt) — dùng trước khi thử đăng nhập. */
export async function isBlocked(key: string, rule: Rule, s: Store = store()): Promise<Verdict> {
  const { count, ttl } = await s.peek(key);
  return count >= rule.limit ? { allowed: false, retryAfterSec: ttl } : { allowed: true, retryAfterSec: 0 };
}

export const fail = (key: string, rule: Rule, s: Store = store()) => s.incr(key, rule.windowSec);
export const clear = (key: string, s: Store = store()) => s.del(key);

/** Giờ/phút dạng "5 phút" / "40 giây" cho thông báo. */
export function waitText(sec: number): string {
  return sec >= 90 ? `${Math.ceil(sec / 60)} phút` : `${Math.max(sec, 1)} giây`;
}

/** IP client phía sau nginx: ưu tiên X-Real-IP (nginx đặt = $remote_addr, client không giả được); X-Forwarded-For lấy phần tử CUỐI (do proxy của mình thêm). */
export function clientIp(h: { get(name: string): string | null }): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? "unknown";
  return "unknown";
}

export const RULES = {
  loginFailPerAccount: { limit: 5, windowSec: 15 * 60 },
  loginFailPerIp: { limit: 30, windowSec: 15 * 60 },
  registerPerIp: { limit: 10, windowSec: 60 * 60 },
  forgotPerAccount: { limit: 3, windowSec: 60 * 60 },
  forgotPerIp: { limit: 10, windowSec: 60 * 60 },
  resetPerIp: { limit: 20, windowSec: 60 * 60 },
} satisfies Record<string, Rule>;
