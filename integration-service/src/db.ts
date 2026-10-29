import pg from "pg";
import type { Env } from "./config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(env: Env): pg.Pool {
  if (!pool) {
    pool = new Pool({
      host: env.VMSET_DB_HOST,
      port: env.VMSET_DB_PORT,
      database: env.VMSET_DB_NAME,
      user: env.VMSET_DB_USER,
      password: env.VMSET_DB_PASSWORD,
      max: env.DB_POOL_MAX,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", (err) => {
      console.error("[db] unexpected pool error", err);
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  env: Env,
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool(env).query<T>(text, params);
  return result.rows;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}