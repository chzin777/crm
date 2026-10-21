import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireApiSession())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [total, sent, delivered, read, failed] = await Promise.all([
      prisma.campaignMessage.count({ where: { campaignId: id } }),
      prisma.campaignMessage.count({ where: { campaignId: id, status: { in: ["sent", "delivered", "read"] } } }),
      prisma.campaignMessage.count({ where: { campaignId: id, status: { in: ["delivered", "read"] } } }),
      prisma.campaignMessage.count({ where: { campaignId: id, status: "read" } }),
      prisma.campaignMessage.count({ where: { campaignId: id, status: "failed" } }),
    ]);

    return NextResponse.json({
      data: {
        total,
        sent,
        delivered,
        read,
        failed,
        deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
        readRate: total > 0 ? Math.round((read / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error(`[metrics] Failed to load metrics for campaign ${id}:`, error);
    return NextResponse.json(
      { error: "Não foi possível carregar as métricas." },
      { status: 500 },
    );
  }
}