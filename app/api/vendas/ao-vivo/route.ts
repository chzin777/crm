import { requireModule } from "@/lib/api-auth";
import { liveSnapshot, periodSnapshot } from "@/lib/sales-live/live-db";
import { MAX_PERIOD_DAYS, validPeriod } from "@/lib/sales-live/feed";

/**
 * Retrato das vendas do dia (carga inicial e modo de consulta leve quando o canal ao vivo cai na rede móvel) ou,
 * com ?from=AAAA-MM-DD&to=AAAA-MM-DD, as vendas faturadas do período (Esta semana, Este mês, Personalizado).
 */
export async function GET(request: Request) {
  const guard = await requireModule("vendas", "painel", "campanhas", "metricas");
  if (guard.response) return guard.response;
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    if (!validPeriod(from, to)) return Response.json({ error: `Período inválido: informe início e fim (até ${MAX_PERIOD_DAYS} dias).` }, { status: 400 });
    try {
      return Response.json({ data: await periodSnapshot(from!, to!) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("[vendas-periodo]", error instanceof Error ? error.message : error);
      return Response.json({ error: "Não foi possível consultar as vendas do VMSET agora." }, { status: 503 });
    }
  }
  const { snapshot, error } = await liveSnapshot();
  if (!snapshot) return Response.json({ error: error ? "Não foi possível consultar as vendas do VMSET agora." : "Carregando as vendas do dia..." }, { status: 503 });
  return Response.json({ data: snapshot }, { headers: { "Cache-Control": "no-store" } });
}
