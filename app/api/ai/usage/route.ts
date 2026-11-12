import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { aiUsageReport } from "@/lib/ai/store";

/** Gastos da IA em R$ e tokens, mais o crédito estimado. */
export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  return NextResponse.json(await aiUsageReport());
}
