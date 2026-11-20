import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const env = () => ({
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
  publicUrl: process.env.R2_PUBLIC_URL?.replace(/\/$/, ""),
});

export function r2Configured(): boolean {
  const e = env();
  return !!(e.accountId && e.accessKeyId && e.secretAccessKey && e.bucket && e.publicUrl);
}

function client() {
  const e = env();
  return new S3Client({
    region: "auto",
    endpoint: `https://${e.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.accessKeyId!, secretAccessKey: e.secretAccessKey! },
  });
}

export const ALLOWED_TYPES: Record<string, { media: "IMAGE" | "VIDEO"; ext: string; maxBytes: number }> = {
  "image/jpeg": { media: "IMAGE", ext: "jpg", maxBytes: 15 * 1024 * 1024 },
  "image/png": { media: "IMAGE", ext: "png", maxBytes: 15 * 1024 * 1024 },
  "image/webp": { media: "IMAGE", ext: "webp", maxBytes: 15 * 1024 * 1024 },
  "video/mp4": { media: "VIDEO", ext: "mp4", maxBytes: 300 * 1024 * 1024 },
  "video/quicktime": { media: "VIDEO", ext: "mov", maxBytes: 300 * 1024 * 1024 },
};

export const keyPrefix = (propertyId: string) => `properties/${propertyId}/`;

export const billPrefix = (bookingId: string) => `bills/${bookingId}/`;

/** Ký URL upload thẳng lên R2. `prefix` quyết định thư mục (ảnh căn hoặc ảnh bill). */
export async function presignUpload(prefix: string, contentType: string) {
  const type = ALLOWED_TYPES[contentType];
  const key = `${prefix}${randomUUID()}.${type.ext}`;
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: env().bucket, Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  );
  return { key, uploadUrl };
}

export const publicUrlFor = (key: string) => `${env().publicUrl}/${key}`;

/** Lấy object key từ URL công khai; null nếu URL không thuộc bucket của mình. */
export function keyFromUrl(url: string): string | null {
  const base = env().publicUrl;
  return base && url.startsWith(base + "/") ? url.slice(base.length + 1) : null;
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: env().bucket, Key: key }));
}

/** Ảnh đại diện (avatar/cover) đã nén ở client: key cố định, ghi đè khi đổi ảnh. */
export const IMAGE_EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg" };
export const avatarKey = (userId: string, ext: string) => `avatars/${userId}.${ext}`;
export const coverKey = (propertyId: string, ext: string) => `properties/${propertyId}/cover.${ext}`;

export async function presignFixed(key: string, contentType: string) {
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: env().bucket, Key: key, ContentType: contentType, CacheControl: "public, max-age=31536000" }),
    { expiresIn: 600 },
  );
  return { key, uploadUrl };
}
