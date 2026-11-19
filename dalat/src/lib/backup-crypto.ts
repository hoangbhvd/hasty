import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Mã hoá bản sao lưu trước khi đưa ra khỏi VPS (AES-256-GCM, khoá dẫn xuất từ passphrase bằng scrypt).
 * Định dạng: "DLB1" | salt(16) | iv(12) | ciphertext | tag(16). GCM có xác thực nên file bị sửa sẽ giải mã thất bại.
 */
const MAGIC = Buffer.from("DLB1");
export const MIN_PASSPHRASE = 16;

const keyOf = (pass: string, salt: Buffer) => scryptSync(pass, salt, 32);

export function encryptBackup(plain: Buffer, passphrase: string): Buffer {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`BACKUP_ENCRYPTION_KEY phải dài ít nhất ${MIN_PASSPHRASE} ký tự`);
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(passphrase, salt), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, body, c.getAuthTag()]);
}

export function decryptBackup(blob: Buffer, passphrase: string): Buffer {
  if (blob.length < MAGIC.length + 16 + 12 + 16 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error("Không phải file sao lưu đã mã hoá (sai định dạng)");
  const salt = blob.subarray(4, 20), iv = blob.subarray(20, 32), tag = blob.subarray(blob.length - 16), body = blob.subarray(32, blob.length - 16);
  const d = createDecipheriv("aes-256-gcm", keyOf(passphrase, salt), iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(body), d.final()]);
  } catch {
    throw new Error("Giải mã thất bại: sai khoá hoặc file đã bị sửa");
  }
}
