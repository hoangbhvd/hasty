import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, duration, formatAlert, step, type CheckResult, type State } from "./monitor-core";
import { checkBackups, checkBackupSync, checkDb, checkDisk, checkQueueFailed, checkStuckHolds, checkWeb, checkWorker, type FsLike } from "./monitor-checks";

const R = (name: string, ok: boolean, detail?: string): CheckResult => ({ name, ok, detail });
const MIN = 60_000;

test("1 lần lỗi chập chờn KHÔNG báo; lỗi liên tiếp đủ ngưỡng mới báo DOWN đúng 1 lần", () => {
  let s: State = {};
  let r = step(s, [R("web", false, "HTTP 502")], 0); s = r.state;
  assert.deepEqual(r.alerts, []);
  r = step(s, [R("web", false, "HTTP 502")], MIN); s = r.state;
  assert.deepEqual(r.alerts, [{ kind: "DOWN", name: "web", detail: "HTTP 502" }]);
  r = step(s, [R("web", false)], 2 * MIN); s = r.state;
  assert.deepEqual(r.alerts, []); // không báo lại ngay
});

test("lỗi rồi tự hết giữa chừng (chưa đủ ngưỡng) → không báo gì, kể cả khi hồi phục", () => {
  let s: State = {};
  s = step(s, [R("db", false)], 0).state;
  const r = step(s, [R("db", true)], MIN);
  assert.deepEqual(r.alerts, []);
  assert.equal(r.state.db.consecutive, 0);
});

test("hồi phục: báo RECOVERED kèm thời gian gián đoạn tính từ lần lỗi ĐẦU TIÊN", () => {
  let s: State = {};
  s = step(s, [R("worker", false)], 10 * MIN).state;
  s = step(s, [R("worker", false)], 11 * MIN).state;
  const r = step(s, [R("worker", true)], 40 * MIN);
  assert.deepEqual(r.alerts, [{ kind: "RECOVERED", name: "worker", downForMs: 30 * MIN }]);
  assert.equal(step(r.state, [R("worker", true)], 41 * MIN).alerts.length, 0); // sau đó im lặng
});

test("nhắc lại sau 6 giờ nếu vẫn chưa sửa, và không nhắc sớm hơn", () => {
  let s: State = {};
  s = step(s, [R("disk", false)], 0).state;
  s = step(s, [R("disk", false, "92%")], MIN).state; // DOWN lúc phút 1
  assert.equal(step(s, [R("disk", false)], 5 * 3600_000).alerts.length, 0);
  const r = step(s, [R("disk", false, "93%")], MIN + 6 * 3600_000);
  assert.equal(r.alerts[0].kind, "REMINDER");
  assert.ok((r.alerts[0] as { downForMs: number }).downForMs >= 6 * 3600_000);
  assert.equal(step(r.state, [R("disk", false)], MIN + 7 * 3600_000).alerts.length, 0); // đồng hồ nhắc được đặt lại
});

test("mỗi check có trạng thái độc lập; nhiều check hỏng cùng lúc báo riêng từng cái", () => {
  let s: State = {};
  s = step(s, [R("web", false), R("redis", true), R("db", false)], 0).state;
  const r = step(s, [R("web", false), R("redis", true), R("db", true)], MIN);
  assert.deepEqual(r.alerts.map((a) => `${a.kind}:${a.name}`), ["DOWN:web"]);
  assert.equal(r.state.redis.consecutive, 0);
});

test("ngưỡng tuỳ chỉnh (threshold=1 báo ngay)", () => {
  const r = step({}, [R("web", false)], 0, { ...DEFAULTS, threshold: 1 });
  assert.equal(r.alerts[0].kind, "DOWN");
});

test("định dạng tin cảnh báo bằng tiếng Việt, có tên dịch vụ và chi tiết", () => {
  assert.match(formatAlert({ kind: "DOWN", name: "worker", detail: "Worker im lặng 300 giây" }, "vps1"), /🔴 \[vps1\] Worker.*sự cố\nWorker im lặng 300 giây/);
  assert.match(formatAlert({ kind: "RECOVERED", name: "web", downForMs: 7 * MIN }), /🟢.*Web.*hoạt động lại.*kéo dài 7 phút kể từ lúc phát hiện/);
  assert.match(formatAlert({ kind: "REMINDER", name: "disk", downForMs: 7 * 3600_000 }), /vẫn chưa được khắc phục.*7 giờ/);
  assert.equal(duration(30_000), "dưới 1 phút");
  assert.equal(duration(3 * 24 * 3600_000), "3 ngày");
});

const resp = (status: number, body: unknown) => (async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;

test("checkWeb: 200 + {ok:true} mới là khoẻ; 503/sai nội dung/lỗi mạng đều là hỏng", async () => {
  assert.equal((await checkWeb("http://w/api/health", resp(200, { ok: true }))).ok, true);
  assert.equal((await checkWeb("http://w", resp(503, { ok: false }))).ok, false);
  assert.equal((await checkWeb("http://w", resp(200, { ok: false }))).ok, false);
  assert.equal((await checkWeb("http://w", resp(200, null))).ok, false);
  const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
  const r = await checkWeb("http://w", down);
  assert.equal(r.ok, false); assert.match(r.detail!, /ECONNREFUSED/);
});

test("checkDb / checkWorker / checkStuckHolds / checkQueueFailed", async () => {
  assert.equal((await checkDb(async () => 1)).ok, true);
  assert.equal((await checkDb(async () => { throw new Error("x"); })).ok, false);

  const now = 1_000_000_000;
  assert.equal((await checkWorker(async () => String(now - 30_000), now)).ok, true);
  assert.equal((await checkWorker(async () => String(now - 200_000), now)).ok, false); // im lặng quá 120s
  assert.match((await checkWorker(async () => null, now)).detail!, /chưa chạy/);
  assert.equal((await checkWorker(async () => "abc", now)).ok, false);
  assert.equal((await checkWorker(async () => { throw new Error("redis down"); }, now)).ok, false);

  assert.equal((await checkStuckHolds(async () => 0)).ok, true);
  const h = await checkStuckHolds(async () => 3);
  assert.equal(h.ok, false); assert.match(h.detail!, /3 booking/);

  assert.equal((await checkQueueFailed(async () => 20)).ok, true);
  assert.equal((await checkQueueFailed(async () => 21)).ok, false);
});

const fsOf = (files: Record<string, { mtimeMs: number; body?: string }>): FsLike => ({
  readdir: async () => Object.keys(files),
  stat: async (p) => { const f = files[p.split("/").pop()!]; if (!f) throw new Error("ENOENT"); return f; },
  readFile: async (p) => { const f = files[p.split("/").pop()!]; if (!f?.body) throw new Error("ENOENT"); return f.body; },
});

test("checkBackups: bản mới nhất còn trong 26 giờ là khoẻ; không có/cũ/thư mục lỗi là hỏng; bỏ qua file lạ", async () => {
  const now = 10 * 24 * 3600_000, H = 3600_000;
  assert.equal((await checkBackups("/b", now, fsOf({ "dalat-1.dump": { mtimeMs: now - 30 * H }, "dalat-2.dump": { mtimeMs: now - 2 * H } }))).ok, true);
  const old = await checkBackups("/b", now, fsOf({ "dalat-1.dump": { mtimeMs: now - 30 * H } }));
  assert.equal(old.ok, false); assert.match(old.detail!, /30 giờ/);
  assert.equal((await checkBackups("/b", now, fsOf({ "ghi-chu.txt": { mtimeMs: now } }))).ok, false);
  assert.equal((await checkBackups("/b", now, fsOf({}))).ok, false);
  assert.equal((await checkBackups("/b", now, { ...fsOf({}), readdir: async () => { throw new Error("ENOENT"); } })).ok, false);
});

test("checkBackupSync: đọc trạng thái đồng bộ; quá cũ / có lỗi / thiếu file là hỏng", async () => {
  const now = 10 * 24 * 3600_000, H = 3600_000;
  const st = (o: object) => fsOf({ ".sync-status.json": { mtimeMs: 0, body: JSON.stringify(o) } });
  assert.equal((await checkBackupSync("/b/.sync-status.json", now, st({ lastOk: now - H }))).ok, true);
  const stale = await checkBackupSync("/b/.sync-status.json", now, st({ lastOk: now - 40 * H, lastError: "AccessDenied" }));
  assert.equal(stale.ok, false); assert.match(stale.detail!, /AccessDenied/);
  assert.equal((await checkBackupSync("/b/.sync-status.json", now, st({ lastError: "AccessDenied" }))).ok, false);
  assert.equal((await checkBackupSync("/b/.sync-status.json", now, fsOf({}))).ok, false);
});

test("checkDisk: dưới ngưỡng 90% là khoẻ (chấp nhận BigInt của statfs)", async () => {
  assert.equal((await checkDisk(async () => ({ blocks: 1000, bavail: 500 }))).ok, true);
  assert.equal((await checkDisk(async () => ({ blocks: BigInt(1000), bavail: BigInt(100) }))).ok, false); // 90% → hỏng
  const r = await checkDisk(async () => ({ blocks: 1000, bavail: 50 }));
  assert.match(r.detail!, /95%/);
  assert.equal((await checkDisk(async () => { throw new Error("x"); })).ok, false);
});
