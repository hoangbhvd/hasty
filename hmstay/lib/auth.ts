import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db";
import { sendMail } from "./mail";

const COOKIE = "hm_session";
const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET phải có ít nhất 32 ký tự");
  return new TextEncoder().encode(s);
};

export async function startSession(uid: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" })
    .setSubject(uid).setIssuedAt().setExpirationTime("30d").sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
    secure: process.env.COOKIE_SECURE === "true",
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUserId(): Promise<string | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  let sub: string | undefined, iat: number | undefined;
  try {
    const { payload } = await jwtVerify(t, secret());
    sub = payload.sub; iat = payload.iat;
  } catch {
    return null;
  }
  if (!sub || !iat) return null;
  // Phiên cấp trước lần đổi mật khẩu gần nhất (hoặc user đã bị xoá) coi như hết hiệu lực
  const r = await pool.query("select session_valid($1,$2) as ok", [sub, iat]);
  return r.rows[0]?.ok === true ? sub : null;
}

export async function requireUser(): Promise<string> {
  const uid = await currentUserId();
  if (!uid) redirect("/login");
  return uid;
}

export async function registerUser(email: string, password: string, name: string, phone: string) {
  const h = await hash(password);
  const r = await pool.query("select register_user($1,$2,$3,$4) as id", [email, h, name, phone || null]);
  return r.rows[0].id as string;
}

export async function loginUser(email: string, password: string): Promise<{ id: string; verified: boolean } | null> {
  const r = await pool.query("select * from find_user_for_login($1)", [email]);
  const u = r.rows[0];
  if (!u) return null;
  return (await verify(u.password_hash, password)) ? { id: u.id as string, verified: u.verified === true } : null;
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Luôn thành công với người gọi (không lộ email nào tồn tại). Email chỉ gửi nếu có tài khoản. */
export async function requestPasswordReset(email: string) {
  const token = randomBytes(32).toString("base64url");
  const r = await pool.query("select * from create_password_reset($1,$2)", [email, sha256(token)]);
  const u = r.rows[0];
  if (!u) return;
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = `${base}/reset?token=${token}`;
  const name = u.full_name || "bạn";
  await sendMail(
    u.email, "Đặt lại mật khẩu HMStay",
    `Chào ${name},\n\nBấm vào liên kết sau để đặt mật khẩu mới (hiệu lực 1 giờ, dùng một lần):\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    `<p>Chào ${name.replace(/[<>&]/g, "")},</p><p><a href="${link}">Đặt mật khẩu mới</a> (hiệu lực 1 giờ, dùng một lần).</p><p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
  );
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  if (!token) return false;
  const h = await hash(newPassword);
  const r = await pool.query("select consume_password_reset($1,$2) as ok", [sha256(token), h]);
  return r.rows[0].ok === true;
}

/** Gửi email xác minh tới tài khoản chưa xác minh. Im lặng nếu không có/đã xác minh/quá 3 lần mỗi giờ (không lộ email nào tồn tại). */
export async function sendEmailVerification(email: string) {
  const token = randomBytes(32).toString("base64url");
  const r = await pool.query("select * from create_email_verification($1,$2)", [email, sha256(token)]);
  const u = r.rows[0];
  if (!u) return;
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = `${base}/verify?token=${token}`;
  const name = u.full_name || "bạn";
  await sendMail(
    u.email, "Xác minh email HMStay",
    `Chào ${name},\n\nBấm vào liên kết sau để xác minh email và kích hoạt tài khoản (hiệu lực 24 giờ):\n${link}\n\nNếu bạn không đăng ký, hãy bỏ qua email này.`,
    `<p>Chào ${name.replace(/[<>&]/g, "")},</p><p><a href="${link}">Xác minh email và kích hoạt tài khoản</a> (hiệu lực 24 giờ).</p><p>Nếu bạn không đăng ký, hãy bỏ qua email này.</p>`,
  );
}

export async function verifyEmail(token: string): Promise<boolean> {
  if (!token) return false;
  const r = await pool.query("select consume_email_verification($1) as ok", [sha256(token)]);
  return r.rows[0].ok === true;
}
