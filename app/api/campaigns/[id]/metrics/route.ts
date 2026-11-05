import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireModule("campanhas");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const grouped = await prisma.campaignMessage.groupBy({ by: ["status"], where: { campaignId: id }, _count: { _all: true } });
  const counts = { queued: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
  for (const row of grouped) counts[row.status] = row._count._all;
  return NextResponse.json({ data: { total: Object.values(counts).reduce((sum, value) => sum + value, 0), ...counts } });
}
