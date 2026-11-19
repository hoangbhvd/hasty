import "server-only";
import { cookies } from "next/headers";

export type Mode = "host" | "broker";
const COOKIE = "dalat_mode";

export async function getMode(): Promise<Mode> {
  const v = (await cookies()).get(COOKIE)?.value;
  return v === "broker" ? "broker" : "host";
}

export async function setMode(mode: Mode) {
  (await cookies()).set(COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
