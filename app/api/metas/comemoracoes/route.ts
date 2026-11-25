import { requireApiSession } from "@/lib/api-auth";
import { evaluateActiveCampaigns, markCelebrationsSeen, pendingCelebrations } from "@/lib/sales-campaigns";

/**
 * Conquistas do usuário logado ainda não comemoradas. Cada consulta também dispara a apuração das campanhas ativas
 * (no máximo 1x por minuto por instância), então uma venda nova do VMSet vira confete na tela do vendedor em ~1 minuto.
 */
export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });
  await evaluateActiveCampaigns().catch((error) => console.error("[campanhas] apuração:", error));
  return Response.json({ data: await pendingCelebrations(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

/** Marca como vistas: { ids: string[] } (não repete o confete). */
export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 200) : [];
  if (!ids.length) return Response.json({ error: "Informe as comemorações." }, { status: 400 });
  return Response.json({ data: { seen: await markCelebrationsSeen(user.id, ids) } });
}
