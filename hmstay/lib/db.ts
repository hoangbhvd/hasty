import { Pool, types } from "pg";

// date -> "YYYY-MM-DD" (không lệch múi giờ), bigint -> number
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => Number(v));

const g = globalThis as unknown as { _hmPool?: Pool };
export const pool: Pool = (g._hmPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Q = <T = any>(text: string, params?: unknown[]) => Promise<T[]>;

/** Chạy fn trong 1 transaction với app.user_id đã set => RLS áp dụng đúng user. */
export async function withUser<T>(uid: string, fn: (q: Q) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.user_id', $1, true)", [uid]);
    const out = await fn(async (text, params) => (await c.query(text, params)).rows);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
