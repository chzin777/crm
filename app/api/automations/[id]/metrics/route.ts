import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { readFlowSettings } from "@/lib/automations/nodes";
import type { FlowMetrics, NodeMetrics } from "@/lib/automations/metrics";

type Context = { params: Promise<{ id: string }> };


const empty = (): NodeMetrics => ({ entered: 0, completed: 0, errors: 0, sent: 0, delivered: 0, replied: 0, sales: 0, revenue: 0 });

/** Métricas do canvas: contadores por nó, entregas/respostas dos envios e vendas do VMSet atribuídas. */
export async function GET(_request: Request, { params }: Context) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const { id } = await params;
  const flow = await prisma.automationFlow.findUnique({ where: { id }, select: { settings: true } });
  if (!flow) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });
  const [stats, touches, sales, executions, leads, totals] = await Promise.all([
    prisma.automationNodeStat.findMany({ where: { flowId: id } }),
    prisma.$queryRaw<{ nodeId: string; sent: number; delivered: number; replied: number }[]>`
      SELECT t."nodeId", count(*)::int AS sent,
        count(*) FILTER (WHERE t."deliveredAt" IS NOT NULL OR m.delivery::text IN ('delivered', 'read'))::int AS delivered,
        count(*) FILTER (WHERE t."repliedAt" IS NOT NULL)::int AS replied
      FROM "AutomationMessageTouch" t LEFT JOIN "ChatMessage" m ON m."externalId" = t."externalId"
      WHERE t."flowId" = ${id} GROUP BY t."nodeId"`,
    prisma.automationSaleAttribution.groupBy({ by: ["nodeId"], where: { flowId: id }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.automationExecution.groupBy({ by: ["status"], where: { flowId: id }, _count: { _all: true } }),
    prisma.$queryRaw<{ leads: number; replied: number }[]>`
      SELECT (SELECT count(DISTINCT "contactId") FROM "AutomationExecution" WHERE "flowId" = ${id})::int AS leads,
        (SELECT count(DISTINCT "contactId") FROM "AutomationMessageTouch" WHERE "flowId" = ${id} AND "repliedAt" IS NOT NULL)::int AS replied`,
    prisma.$queryRaw<{ sales: number; revenue: number; delivered: number }[]>`
      SELECT (SELECT count(DISTINCT "saleKey") FROM "AutomationSaleAttribution" WHERE "flowId" = ${id})::int AS sales,
        COALESCE((SELECT sum(amount) FROM (SELECT DISTINCT ON ("saleKey") amount FROM "AutomationSaleAttribution" WHERE "flowId" = ${id}) x), 0)::float8 AS revenue,
        (SELECT count(*) FROM "AutomationMessageTouch" t LEFT JOIN "ChatMessage" m ON m."externalId" = t."externalId" WHERE t."flowId" = ${id} AND (t."deliveredAt" IS NOT NULL OR m.delivery::text IN ('delivered', 'read')))::int AS delivered`,
  ]);
  const nodes: Record<string, NodeMetrics> = {};
  const at = (nodeId: string) => (nodes[nodeId] ??= empty());
  for (const row of stats) Object.assign(at(row.nodeId), { entered: row.entered, completed: row.completed, errors: row.errors });
  for (const row of touches) Object.assign(at(row.nodeId), { sent: row.sent, delivered: row.delivered, replied: row.replied });
  for (const row of sales) Object.assign(at(row.nodeId), { sales: row._count._all, revenue: Math.round((row._sum.amount ?? 0) * 100) / 100 });
  const byStatus = (...statuses: string[]) => executions.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const metrics: FlowMetrics = {
    nodes,
    summary: {
      leads: leads[0]?.leads ?? 0, executions: byStatus("running", "waiting", "completed", "failed", "cancelled"), active: byStatus("running", "waiting"), completed: byStatus("completed"), failed: byStatus("failed"),
      delivered: totals[0]?.delivered ?? 0, replied: leads[0]?.replied ?? 0, sales: totals[0]?.sales ?? 0, revenue: Math.round((totals[0]?.revenue ?? 0) * 100) / 100,
      attributionDays: readFlowSettings(flow.settings).attributionDays,
    },
  };
  return NextResponse.json(metrics);
}
