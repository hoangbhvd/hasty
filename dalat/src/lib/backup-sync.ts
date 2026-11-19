import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { encryptBackup } from "@/lib/backup-crypto";

export const PREFIX = "backups/";
const DAY = 86_400_000;
/** Luôn giữ lại ít nhất ngần này bản mới nhất trên remote, bất kể tuổi — phòng khi đồng hồ lệch hoặc đồng bộ ngừng. */
export const KEEP_NEWEST = 3;

export type RemoteObj = { key: string; lastModified: number };
export type ObjectStore = {
  list(prefix: string): Promise<RemoteObj[]>;
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
};

export const remoteKeyFor = (file: string, encrypted: boolean) => `${PREFIX}${file}${encrypted ? ".enc" : ""}`;
export const isDump = (f: string) => /^dalat-.*\.dump$/.test(f);

/** Quyết định tải lên cái gì và xoá cái gì (hàm thuần). */
export function planSync(local: string[], remote: RemoteObj[], now: number, retentionDays: number, encrypted: boolean) {
  const have = new Set(remote.map((r) => r.key));
  const upload = local.filter(isDump).filter((f) => !have.has(remoteKeyFor(f, encrypted))).sort();
  const protectedKeys = new Set([...remote].sort((a, b) => b.lastModified - a.lastModified).slice(0, KEEP_NEWEST).map((r) => r.key));
  const remove = remote
    .filter((r) => r.key.startsWith(PREFIX) && now - r.lastModified > retentionDays * DAY && !protectedKeys.has(r.key))
    .map((r) => r.key);
  return { upload, remove };
}

export type SyncFs = { readdir(dir: string): Promise<string[]>; readFile(path: string): Promise<Buffer> };

export async function syncBackups(o: { dir: string; store: ObjectStore; fs: SyncFs; now: number; retentionDays: number; passphrase?: string }) {
  const encrypted = !!o.passphrase;
  const plan = planSync(await o.fs.readdir(o.dir), await o.store.list(PREFIX), o.now, o.retentionDays, encrypted);
  for (const f of plan.upload) {
    const raw = await o.fs.readFile(`${o.dir}/${f}`);
    await o.store.put(remoteKeyFor(f, encrypted), encrypted ? encryptBackup(raw, o.passphrase!) : raw);
  }
  // Chỉ xoá bản cũ SAU KHI tải lên thành công (không bao giờ xoá khi đang lỗi)
  for (const k of plan.remove) await o.store.remove(k);
  return { uploaded: plan.upload.length, removed: plan.remove.length };
}

export type S3Config = { bucket: string; accountId?: string; endpoint?: string; accessKeyId: string; secretAccessKey: string };

export function s3Store(c: S3Config): ObjectStore {
  const custom = !!c.endpoint; // MinIO/tự host: dùng path-style
  const s3 = new S3Client({
    // WHEN_REQUIRED: không gắn trailer checksum aws-chunked mặc định của SDK mới (R2 và S3 tương thích khuyến nghị tắt)
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    region: "auto", endpoint: c.endpoint ?? `https://${c.accountId}.r2.cloudflarestorage.com`, forcePathStyle: custom,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return {
    async list(prefix) {
      const out: RemoteObj[] = [];
      let token: string | undefined;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket: c.bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents ?? []) if (o.Key) out.push({ key: o.Key, lastModified: o.LastModified?.getTime() ?? 0 });
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
    async put(key, body) { await s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: body })); },
    async get(key) {
      const r = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
    async remove(key) { await s3.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key })); },
  };
}

/** Đọc cấu hình sao lưu từ biến môi trường; null nếu chưa bật. Từ chối dùng chung bucket với kho ảnh công khai. */
export function backupConfigFromEnv(env: Record<string, string | undefined> = process.env) {
  const bucket = env.BACKUP_R2_BUCKET;
  if (!bucket) return null;
  if (bucket === env.R2_BUCKET) throw new Error("BACKUP_R2_BUCKET trùng R2_BUCKET (bucket ảnh công khai) — hãy dùng 1 bucket RIÊNG, không công khai, cho sao lưu");
  const store: S3Config = {
    bucket,
    accountId: env.BACKUP_R2_ACCOUNT_ID ?? env.R2_ACCOUNT_ID,
    endpoint: env.BACKUP_S3_ENDPOINT || undefined,
    accessKeyId: env.BACKUP_R2_ACCESS_KEY_ID ?? env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.BACKUP_R2_SECRET_ACCESS_KEY ?? env.R2_SECRET_ACCESS_KEY ?? "",
  };
  if (!store.accessKeyId || !store.secretAccessKey || (!store.endpoint && !store.accountId)) throw new Error("Thiếu khoá R2 cho sao lưu (BACKUP_R2_* hoặc R2_*)");
  return { store, passphrase: env.BACKUP_ENCRYPTION_KEY || undefined, retentionDays: Number(env.BACKUP_RETENTION_DAYS ?? 30) || 30 };
}
