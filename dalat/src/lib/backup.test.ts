import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptBackup, encryptBackup } from "./backup-crypto";
import { backupConfigFromEnv, KEEP_NEWEST, planSync, remoteKeyFor, syncBackups, type ObjectStore, type RemoteObj } from "./backup-sync";

const KEY = "mot-khoa-du-dai-16+";
const DAY = 86_400_000;

test("mã hoá/giải mã: khứ hồi đúng; mỗi lần mã hoá khác nhau; bản mã không lộ nội dung", () => {
  const plain = Buffer.from("PGDMP-bank-account-0123456789-secret".repeat(50));
  const a = encryptBackup(plain, KEY), b = encryptBackup(plain, KEY);
  assert.deepEqual(decryptBackup(a, KEY), plain);
  assert.notDeepEqual(a, b); // salt/iv ngẫu nhiên
  assert.equal(a.includes(Buffer.from("bank-account")), false);
  assert.equal(a.subarray(0, 4).toString(), "DLB1");
});

test("giải mã thất bại: sai khoá, file bị sửa (1 bit), cắt cụt, sai định dạng", () => {
  const blob = encryptBackup(Buffer.from("dữ liệu"), KEY);
  assert.throws(() => decryptBackup(blob, "khoa-sai-khoa-sai-khoa"), /sai khoá hoặc file đã bị sửa/);
  const tampered = Buffer.from(blob); tampered[40] ^= 1;
  assert.throws(() => decryptBackup(tampered, KEY), /sai khoá hoặc file đã bị sửa/);
  assert.throws(() => decryptBackup(blob.subarray(0, 30), KEY), /sai định dạng/);
  assert.throws(() => decryptBackup(Buffer.from("PGDMP thuần, không mã hoá".repeat(5)), KEY), /sai định dạng/);
});

test("khoá quá ngắn bị từ chối (không mã hoá bằng khoá yếu)", () => {
  assert.throws(() => encryptBackup(Buffer.from("x"), "ngan"), /ít nhất 16/);
});

const R = (key: string, ageDays: number, now: number): RemoteObj => ({ key, lastModified: now - ageDays * DAY });

test("planSync: chỉ tải lên file chưa có trên remote; bỏ qua file không phải dump", () => {
  const now = 100 * DAY;
  const p = planSync(["dalat-a.dump", "dalat-b.dump", "note.txt", "dalat-c.sql"], [R("backups/dalat-a.dump", 1, now)], now, 30, false);
  assert.deepEqual(p.upload, ["dalat-b.dump"]);
  assert.deepEqual(p.remove, []);
});

test("planSync: tên remote khác nhau giữa bản mã hoá và không mã hoá (không nhầm lẫn)", () => {
  assert.equal(remoteKeyFor("dalat-a.dump", false), "backups/dalat-a.dump");
  assert.equal(remoteKeyFor("dalat-a.dump", true), "backups/dalat-a.dump.enc");
  const now = 100 * DAY;
  // đã có bản không mã hoá cũ → bật mã hoá thì vẫn tải bản .enc
  assert.deepEqual(planSync(["dalat-a.dump"], [R("backups/dalat-a.dump", 1, now)], now, 30, true).upload, ["dalat-a.dump"]);
});

test("planSync: xoá bản quá hạn nhưng LUÔN giữ lại 3 bản mới nhất; không đụng file ngoài thư mục backups/", () => {
  const now = 200 * DAY;
  const remote = [R("backups/d1", 90, now), R("backups/d2", 80, now), R("backups/d3", 70, now), R("backups/d4", 60, now), R("backups/d5", 5, now), R("avatar/x.png", 400, now)];
  const p = planSync([], remote, now, 30, false);
  assert.deepEqual(p.remove.sort(), ["backups/d1", "backups/d2"]); // d3,d4 nằm trong 3 bản mới nhất cùng d5
  // toàn bộ bản đều quá hạn (đồng bộ ngừng lâu) → vẫn giữ KEEP_NEWEST bản
  const stale = planSync([], [R("backups/a", 90, now), R("backups/b", 80, now), R("backups/c", 70, now), R("backups/d", 60, now)], now, 30, false);
  assert.equal(stale.remove.length, 4 - KEEP_NEWEST);
  assert.deepEqual(stale.remove, ["backups/a"]);
});

function memStore(initial: RemoteObj[] = []) {
  const objs = new Map<string, { body: Buffer; lastModified: number }>(initial.map((o) => [o.key, { body: Buffer.from(""), lastModified: o.lastModified }]));
  const calls: string[] = [];
  const store: ObjectStore = {
    list: async () => [...objs].map(([key, v]) => ({ key, lastModified: v.lastModified })),
    put: async (k, b) => { calls.push(`put ${k}`); objs.set(k, { body: b, lastModified: Date.now() }); },
    get: async (k) => objs.get(k)!.body,
    remove: async (k) => { calls.push(`rm ${k}`); objs.delete(k); },
  };
  return { store, objs, calls };
}
const fsOf = (files: Record<string, string>) => ({ readdir: async () => Object.keys(files), readFile: async (p: string) => Buffer.from(files[p.split("/").pop()!]) });

test("syncBackups: tải lên bản mã hoá, giải mã lại được; chạy lần 2 không tải lại", async () => {
  const m = memStore();
  const fs = fsOf({ "dalat-20261120-0100.dump": "DUMP-1", "dalat-20261121-0100.dump": "DUMP-2" });
  const r1 = await syncBackups({ dir: "/b", store: m.store, fs, now: Date.now(), retentionDays: 30, passphrase: KEY });
  assert.deepEqual(r1, { uploaded: 2, removed: 0 });
  const body = m.objs.get("backups/dalat-20261120-0100.dump.enc")!.body;
  assert.notEqual(body.toString(), "DUMP-1");
  assert.equal(decryptBackup(body, KEY).toString(), "DUMP-1");
  const r2 = await syncBackups({ dir: "/b", store: m.store, fs, now: Date.now(), retentionDays: 30, passphrase: KEY });
  assert.deepEqual(r2, { uploaded: 0, removed: 0 });
  assert.equal(m.calls.filter((c) => c.startsWith("put")).length, 2);
});

test("syncBackups: không mã hoá nếu không có khoá; lỗi tải lên thì KHÔNG xoá bản cũ trên remote", async () => {
  const m = memStore();
  await syncBackups({ dir: "/b", store: m.store, fs: fsOf({ "dalat-x.dump": "PLAIN" }), now: Date.now(), retentionDays: 30 });
  assert.equal(m.objs.get("backups/dalat-x.dump")!.body.toString(), "PLAIN");

  const now = 500 * DAY;
  const old = memStore([R("backups/o1", 100, now), R("backups/o2", 99, now), R("backups/o3", 98, now), R("backups/o4", 97, now)]);
  old.store.put = async () => { throw new Error("AccessDenied"); };
  await assert.rejects(syncBackups({ dir: "/b", store: old.store, fs: fsOf({ "dalat-new.dump": "N" }), now, retentionDays: 30 }), /AccessDenied/);
  assert.deepEqual(old.calls, []); // chưa xoá gì
  assert.equal(old.objs.size, 4);
});

test("cấu hình từ env: tắt khi thiếu bucket; từ chối bucket trùng bucket ảnh công khai; thiếu khoá thì báo lỗi", () => {
  assert.equal(backupConfigFromEnv({}), null);
  assert.throws(() => backupConfigFromEnv({ BACKUP_R2_BUCKET: "media", R2_BUCKET: "media", R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" }), /RIÊNG/);
  assert.throws(() => backupConfigFromEnv({ BACKUP_R2_BUCKET: "bk" }), /Thiếu khoá/);
  const c = backupConfigFromEnv({ BACKUP_R2_BUCKET: "bk", R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", BACKUP_ENCRYPTION_KEY: KEY, BACKUP_RETENTION_DAYS: "14" })!;
  assert.equal(c.retentionDays, 14); assert.equal(c.store.accountId, "acc"); assert.equal(c.passphrase, KEY);
  assert.equal(backupConfigFromEnv({ BACKUP_R2_BUCKET: "bk", BACKUP_S3_ENDPOINT: "http://minio:9000", BACKUP_R2_ACCESS_KEY_ID: "a", BACKUP_R2_SECRET_ACCESS_KEY: "b" })!.retentionDays, 30);
});
