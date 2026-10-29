import { Router, type Request, type Response, type NextFunction } from "express";
import type { Env } from "./config.js";
import { query } from "./db.js";
import { withCache } from "./cache.js";

export function createRouter(env: Env): Router {
  const router = Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    const provided = req.header("x-api-key");
    if (!provided || provided !== env.API_KEY) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  });

  router.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "oticas-integration-service" });
  });

  // ---------- Customers ----------
  router.get("/v1/customers", async (req, res, next) => {
    try {
      const limit = clampInt(req.query.limit, 100, 1, 1000);
      const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const key = `customers:${limit}:${offset}:${search}`;
      const rows = await withCache(key, env.CACHE_TTL_SECONDS, async () => {
        if (search) {
          const like = `%${search}%`;
          return query(
            env,
            `SELECT id, email, name, cpf, phone, address, created_at, updated_at, blocked
             FROM customers
             WHERE name ILIKE $1 OR email ILIKE $1 OR cpf ILIKE $1 OR phone ILIKE $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [like, limit, offset]
          );
        }
        return query(
          env,
          `SELECT id, email, name, cpf, phone, address, created_at, updated_at, blocked
           FROM customers
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
      });
      res.json({ data: rows, limit, offset });
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/customers/:id", async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const key = `customer:${id}`;
      const rows = await withCache(key, env.CACHE_TTL_SECONDS, () =>
        query(
          env,
          `SELECT id, email, name, cpf, phone, address, created_at, updated_at, blocked
           FROM customers WHERE id = $1`,
          [id]
        )
      );
      if (!rows.length) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ data: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  // ---------- Orders ----------
  router.get("/v1/orders", async (req, res, next) => {
    try {
      const limit = clampInt(req.query.limit, 100, 1, 1000);
      const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
      const customerId = typeof req.query.customer_id === "string" ? req.query.customer_id : "";
      const status = typeof req.query.status === "string" ? req.query.status : "";
      const since = typeof req.query.since === "string" ? req.query.since : "";
      const key = `orders:${limit}:${offset}:${customerId}:${status}:${since}`;
      const rows = await withCache(key, env.CACHE_TTL_SECONDS, async () => {
        const where: string[] = [];
        const params: unknown[] = [];
        if (customerId) {
          params.push(customerId);
          where.push(`customer_id = $${params.length}`);
        }
        if (status) {
          params.push(status);
          where.push(`status = $${params.length}`);
        }
        if (since) {
          params.push(since);
          where.push(`created_at >= $${params.length}::timestamptz`);
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        params.push(limit, offset);
        return query(
          env,
          `SELECT id, customer_id, status, payment_status, payment_method, delivery_method,
                  address, prescription, coupon_code, subtotal, discount, total,
                  tracking_code, created_at, updated_at
           FROM orders ${whereSql}
           ORDER BY created_at DESC
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        );
      });
      res.json({ data: rows, limit, offset });
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/orders/:id", async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const key = `order:${id}`;
      const [order] = await withCache(key, env.CACHE_TTL_SECONDS, () =>
        query(
          env,
          `SELECT id, customer_id, status, payment_status, payment_method, delivery_method,
                  address, prescription, coupon_code, subtotal, discount, total,
                  tracking_code, created_at, updated_at
           FROM orders WHERE id = $1`,
          [id]
        )
      );
      if (!order) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const itemsKey = `order-items:${id}`;
      const items = await withCache(itemsKey, env.CACHE_TTL_SECONDS, () =>
        query(
          env,
          `SELECT id, order_id, product_id, product_snapshot, quantity, unit_price
           FROM order_items WHERE order_id = $1 ORDER BY id`,
          [id]
        )
      );
      res.json({ data: { ...order, items } });
    } catch (err) {
      next(err);
    }
  });

  // ---------- Carts ----------
  router.get("/v1/carts/:customer_id", async (req, res, next) => {
    try {
      const customerId = String(req.params.customer_id);
      const key = `cart:${customerId}`;
      const rows = await withCache(key, env.CACHE_TTL_SECONDS, () =>
        query(
          env,
          `SELECT customer_id, items, updated_at FROM carts WHERE customer_id = $1`,
          [customerId]
        )
      );
      if (!rows.length) {
        res.json({ data: { customer_id: customerId, items: [], updated_at: null } });
        return;
      }
      res.json({ data: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  // ---------- Store settings / state ----------
  router.get("/v1/store/settings", async (_req, res, next) => {
    try {
      const rows = await withCache("store:settings", env.CACHE_TTL_SECONDS, () =>
        query(env, `SELECT data, updated_at FROM store_settings WHERE id = 1`)
      );
      res.json({ data: rows[0] ?? null });
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/store/state", async (_req, res, next) => {
    try {
      const rows = await withCache("store:state", env.CACHE_TTL_SECONDS, () =>
        query(env, `SELECT data, updated_at FROM store_state WHERE id = 1`)
      );
      res.json({ data: rows[0] ?? null });
    } catch (err) {
      next(err);
    }
  });

  // ---------- Stats (resumo para dashboards) ----------
  router.get("/v1/stats", async (_req, res, next) => {
    try {
      const key = "stats:summary";
      const data = await withCache(key, env.CACHE_TTL_SECONDS, async () => {
        const [customers] = await query<{ count: string }>(
          env,
          `SELECT COUNT(*)::text AS count FROM customers`
        );
        const [orders] = await query<{ count: string; revenue: string }>(
          env,
          `SELECT COUNT(*)::text AS count, COALESCE(SUM(total),0)::text AS revenue
           FROM orders WHERE payment_status <> 'demo_unpaid'`
        );
        const [recent] = await query<{ count: string }>(
          env,
          `SELECT COUNT(*)::text AS count FROM orders
           WHERE created_at >= NOW() - INTERVAL '30 days'`
        );
        return {
          customers: Number(customers.count),
          orders: Number(orders.count),
          revenue: Number(orders.revenue),
          orders_last_30d: Number(recent.count),
        };
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}