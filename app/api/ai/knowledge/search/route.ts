import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { searchKnowledge } from "@/lib/ai/studio-db";

/** "Testar Busca RAG": trechos que a IA recuperaria para a pergunta (com notas de similaridade). */
export async function POST(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = String(body?.query ?? "").trim().slice(0, 500);
  if (!query) return NextResponse.json({ error: "Escreva uma pergunta." }, { status: 400 });
  const hits = await searchKnowledge(query, { topK: 6, userId: guard.user.id, minScore: 0.1 });
  return NextResponse.json({ hits });
}
