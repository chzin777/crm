import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  // Só com SYNC_API_TOKEN configurado no servidor (sem senha padrão no código) e comparação em tempo constante.
  const expected = process.env.SYNC_API_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearers+/i, "") ?? "";
  if (!expected || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
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
    const allowedViews = ["DailySalesSummary", "CustomerOrderSummary", "VmsetCustomerOrder", "VmsetInvoiceOrder", "VmsetCustomerStats"];
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
    console.error("[db/refresh-materialized-view]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao atualizar a view." }, { status: 500 });
  }
}