import { requireModule } from "@/lib/api-auth";
import { liveSnapshot } from "@/lib/sales-live/live-db";

/** Retrato das vendas do dia (carga inicial e modo de consulta leve quando o canal ao vivo cai na rede móvel). */
export async function GET() {
  const guard = await requireModule("vendas", "painel", "campanhas", "metricas");
  if (guard.response) return guard.response;
  const { snapshot, error } = await liveSnapshot();
  if (!snapshot) return Response.json({ error: error ? "Não foi possível consultar as vendas do VMSET agora." : "Carregando as vendas do dia..." }, { status: 503 });
  return Response.json({ data: snapshot }, { headers: { "Cache-Control": "no-store" } });
}
