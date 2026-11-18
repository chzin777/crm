import "server-only";
import { prisma } from "@/lib/prisma";
import { firstDispatch } from "@/lib/chat/conversation";
import { DEFAULT_ATTRIBUTION_DAYS, MAX_ATTRIBUTION_DAYS } from "@/lib/automations/nodes";

const RUN_EVERY_MS = 5 * 60 * 1000;

/**
 * Atribuição de vendas do VMSet às automações: cada venda (pedido) vista nos últimos 3 dias conta para todos os
 * nós por onde o cliente passou (passo concluído) entre a data do pedido menos a janela do fluxo (padrão 7 dias,
 * em Configurações da automação) e o momento em que a venda chegou do VMSet. Idempotente (uma vez por nó e pedido).
 */
export async function attributeSales(now = new Date()): Promise<number> {
  if (!(await firstDispatch(`automation-attribution:${Math.floor(now.getTime() / RUN_EVERY_MS)}`))) return 0;
  const since = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  return prisma.$executeRaw`
    WITH sales AS (
      SELECT v."sourceKey", v.store || '-' || v."orderNumber" AS "saleKey", min(v."orderDate")::timestamp AS "orderDate",
        min(v."syncedAt") AS "seenAt", COALESCE(sum(v.amount), 0)::float8 AS total
      FROM "VmsetSale" v
      WHERE v.type = 'Venda' AND v."syncedAt" >= ${since} AND v."sourceKey" IS NOT NULL AND v."orderNumber" IS NOT NULL
      GROUP BY v."sourceKey", v.store, v."orderNumber"
    )
    INSERT INTO "AutomationSaleAttribution" ("id", "flowId", "nodeId", "contactId", "saleKey", "amount", "saleDate", "createdAt")
    SELECT DISTINCT ON (e."flowId", l."nodeId", s."saleKey")
      md5(e."flowId" || ':' || l."nodeId" || ':' || s."saleKey"), e."flowId", l."nodeId", c.id, s."saleKey", s.total, s."orderDate", now()
    FROM sales s
    JOIN "Contact" c ON c."sourceKey" = s."sourceKey"
    JOIN "AutomationExecution" e ON e."contactId" = c.id
    JOIN "AutomationFlow" f ON f.id = e."flowId"
    JOIN "AutomationStepLog" l ON l."executionId" = e.id AND l.status = 'ok'
    WHERE l."createdAt" <= s."seenAt"
      AND l."createdAt" >= s."orderDate" - make_interval(days => LEAST(${MAX_ATTRIBUTION_DAYS}::int, GREATEST(1, COALESCE(CASE WHEN (f.settings->>'attributionDays') ~ '^[0-9]+$' THEN (f.settings->>'attributionDays')::int END, ${DEFAULT_ATTRIBUTION_DAYS}::int))))
    ON CONFLICT ("flowId", "nodeId", "saleKey") DO NOTHING`;
}
