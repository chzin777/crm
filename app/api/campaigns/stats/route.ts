import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";

export type CampaignStats = { total: number; sent: number; delivered: number; read: number; replied: number; failed: number };

/** Métricas rápidas de todos os disparos (campanhas e lotes do pipeline `bulk:<id>`) para a listagem unificada. */
export async function GET() {
  const guard = await requireModule("campanhas", "disparos");
  if (guard.response) return guard.response;
  const grouped = await prisma.campaignMessage.groupBy({ by: ["campaignId", "status"], _count: { _all: true } });
  const stats: Record<string, CampaignStats> = {};
  for (const row of grouped) {
    const item = (stats[row.campaignId] ??= { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 });
    const count = row._count._all;
    item.total += count;
    // Status é cumulativo: quem leu também foi entregue e enviado.
    if (row.status === "failed") item.failed += count;
    if (row.status === "sent" || row.status === "delivered" || row.status === "read" || row.status === "replied") item.sent += count;
    if (row.status === "delivered" || row.status === "read" || row.status === "replied") item.delivered += count;
    if (row.status === "read" || row.status === "replied") item.read += count;
    if (row.status === "replied") item.replied += count;
  }
  return NextResponse.json({ data: stats }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
