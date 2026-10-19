import "server-only";
import Redis from "ioredis";

const PREFIX = "crm:cache:";

const globalForRedis = globalThis as typeof globalThis & {
  redis?: Redis | null;
  cacheInflight?: Map<string, Promise<unknown>>;
};

function getRedis(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    globalForRedis.redis = null;
    return null;
  }
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1_000,
    commandTimeout: 500,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
  });
  let reported = false;
  client.on("error", (error) => {
    if (reported) return;
    reported = true;
    console.error("[cache] Redis indisponível, consultando o banco diretamente:", error.message);
  });
  client.on("ready", () => { reported = false; });
  globalForRedis.redis = client;
  return client;
}

const inflight = (globalForRedis.cacheInflight ??= new Map());

/**
 * Returns the cached JSON value for `key`, or runs `loader` and stores the result for `ttlSeconds`.
 * Any Redis failure falls back to `loader`, so the cache is never a hard dependency.
 */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return loader();
  const fullKey = PREFIX + key;

  try {
    const hit = await redis.get(fullKey);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    return loader();
  }

  const pending = inflight.get(fullKey) as Promise<T> | undefined;
  if (pending) return pending;

  const request = (async () => {
    const value = await loader();
    try {
      await redis.set(fullKey, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // A failed write only means the next request recomputes the value.
    }
    return value;
  })().finally(() => inflight.delete(fullKey));
  inflight.set(fullKey, request);
  return request;
}

/** Deletes every cached entry whose key starts with one of the given prefixes. */
export async function invalidateCache(...prefixes: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    for (const prefix of prefixes) {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await redis.scan(cursor, "MATCH", `${PREFIX}${prefix}*`, "COUNT", 200);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== "0");
      if (keys.length) await redis.del(...keys);
    }
  } catch {
    // Entries expire on their own TTL if invalidation cannot reach Redis.
  }
}
