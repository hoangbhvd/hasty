import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash, verify } from "@node-rs/argon2";
import { pool } from "./db";

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
  try {
    const { payload } = await jwtVerify(t, secret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
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

export async function loginUser(email: string, password: string): Promise<string | null> {
  const r = await pool.query("select * from find_user_for_login($1)", [email]);
  const u = r.rows[0];
  if (!u) return null;
  return (await verify(u.password_hash, password)) ? (u.id as string) : null;
}
