import { createClient, type RedisClientType } from "redis";
import type { Env } from "./config.js";

let client: RedisClientType | null = null;
let enabled = false;

export async function initCache(env: Env): Promise<void> {
  if (!env.REDIS_URL) {
    enabled = false;
    console.warn("[cache] REDIS_URL not set — caching disabled");
    return;
  }
  try {
    client = createClient({ url: env.REDIS_URL });
    client.on("error", (err) => console.error("[cache] redis error", err));
    await client.connect();
    enabled = true;
    console.log("[cache] connected to", env.REDIS_URL);
  } catch (err) {
    enabled = false;
    console.error("[cache] failed to connect, caching disabled", err);
  }
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (!enabled || !client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (!enabled || !client || ttlSeconds <= 0) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    /* ignore */
  }
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  await setCached(key, fresh, ttlSeconds);
  return fresh;
}

export async function closeCache(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
  enabled = false;
}