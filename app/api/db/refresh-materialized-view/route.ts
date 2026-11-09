import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.SYNC_API_TOKEN || "vmset-sync-token-2026";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const view = body?.view;
    const concurrently = body?.concurrently === true;

    if (!view || typeof view !== "string") {
      return NextResponse.json({ error: "Missing view name" }, { status: 400 });
    }

    // Whitelist de views permitidas para evitar injeção SQL
    const allowedViews = ["DailySalesSummary", "CustomerOrderSummary"];
    if (!allowedViews.includes(view)) {
      return NextResponse.json({ error: "View not allowed" }, { status: 403 });
    }

    const sql = concurrently
      ? `REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`
      : `REFRESH MATERIALIZED VIEW "${view}"`;

    await prisma.$executeRawUnsafe(sql);

    // Os pedidos por cliente (/painel) saem da mesma importação: atualiza junto com o resumo diário.
    if (view === "DailySalesSummary") {
      const exists = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"CustomerOrderSummary"') IS NOT NULL AS ok`;
      if (exists[0]?.ok) {
        await prisma.$executeRawUnsafe(concurrently ? `REFRESH MATERIALIZED VIEW CONCURRENTLY "CustomerOrderSummary"` : `REFRESH MATERIALIZED VIEW "CustomerOrderSummary"`);
      }
    }

    return NextResponse.json({ ok: true, view, concurrently });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[db/refresh-materialized-view]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}