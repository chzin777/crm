import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { AiError, aiConfigured } from "@/lib/ai/openai";
import { reindexVectorMemory, vectorMemoryStats } from "@/lib/ai/vector-memory-db";

export const maxDuration = 300;

/** Status da memória vetorial da IA (/ia). */
export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  return NextResponse.json(await vectorMemoryStats(), { headers: { "Cache-Control": "no-store" } });
}

/** "Reindexar base agora": documentos ativos, regras da empresa e catálogo (só gera embedding do que mudou). */
export async function POST() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  if (!aiConfigured()) return NextResponse.json({ error: "IA não configurada: defina OPENAI_API_KEY no servidor." }, { status: 503 });
  try {
    const result = await reindexVectorMemory({ userId: guard.user.id });
    return NextResponse.json({ ...result, stats: await vectorMemoryStats() });
  } catch (error) {
    console.error("[ai/memory] reindexação:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof AiError ? error.message : "Não foi possível reindexar a memória da IA." }, { status: error instanceof AiError ? error.status : 500 });
  }
}
