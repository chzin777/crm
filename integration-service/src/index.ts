import express, { type Request, type Response, type NextFunction } from "express";
import { loadEnv } from "./config.js";
import { getPool, closePool } from "./db.js";
import { initCache, closeCache } from "./cache.js";
import { createRouter } from "./routes.js";

const env = loadEnv();
const app = express();

app.use(express.json({ limit: "256kb" }));

app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(createRouter(env));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[error]", err);
  res.status(500).json({ error: "internal_server_error" });
});

async function start(): Promise<void> {
  await initCache(env);
  // warm up the pool so misconfiguration fails fast
  await getPool(env).query("SELECT 1");
  console.log("[db] pool ready");

  const server = app.listen(env.PORT, () => {
    console.log(`[server] listening on :${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[server] received ${signal}, shutting down`);
    server.close(() => {
      Promise.all([closePool(), closeCache()])
        .catch((e) => console.error("[shutdown] cleanup error", e))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("[fatal] failed to start", err);
  process.exit(1);
});