import { prisma } from "@/lib/prisma";

/**
 * Chave de telefone: só dígitos, sem o 55 e considerando DDD + últimos 8 dígitos,
 * para que "(62) 99618-3309", "62996183309" e "556296183309" sejam o mesmo número.
 */
export function phoneKey(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (!local) return "";
  return local.length === 10 || local.length === 11 ? local.slice(0, 2) + local.slice(-8) : local;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { ids: string[]; at: number } | null = null;
let pending: Promise<string[]> | null = null;

/**
 * IDs dos contatos que repetem o telefone de outro. Em cada grupo fica visível o
 * cadastro com mais compras (empate: maior gasto, depois o mais antigo).
 */
export async function getDuplicateContactIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.ids;
  if (pending) return pending;
  pending = prisma.$queryRaw<{ id: string }[]>`
    WITH digits AS (
      SELECT id, purchases, "totalSpent", "createdAt", regexp_replace(phone, '\\D', '', 'g') AS d
      FROM "Contact" WHERE phone IS NOT NULL AND phone <> ''
    ), locals AS (
      SELECT id, purchases, "totalSpent", "createdAt",
        CASE WHEN d LIKE '55%' AND length(d) >= 12 THEN substr(d, 3) ELSE d END AS l
      FROM digits
    ), keyed AS (
      SELECT id, purchases, "totalSpent", "createdAt",
        CASE WHEN length(l) IN (10, 11) THEN left(l, 2) || right(l, 8) ELSE l END AS k
      FROM locals WHERE l <> ''
    ), ranked AS (
      SELECT id, row_number() OVER (PARTITION BY k ORDER BY purchases DESC, "totalSpent" DESC, "createdAt" ASC) AS rn
      FROM keyed
    )
    SELECT id FROM ranked WHERE rn > 1
  `
    .then((rows) => {
      const ids = rows.map((row) => row.id);
      cache = { ids, at: Date.now() };
      return ids;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
