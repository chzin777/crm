import { requireSessionOrSyncToken } from "@/lib/api-auth";
import { syncSellers } from "@/lib/seller-goals";

/** Busca no VMSet os vendedores ativos com venda nos últimos 60 dias e cria/atualiza no CRM (tela ou SYNC_API_TOKEN). */
export async function POST(request: Request) {
  const denied = await requireSessionOrSyncToken(request, ["metas", "lojas", "usuarios"]);
  if (denied) return denied;
  try {
    return Response.json({ data: await syncSellers() });
  } catch (error) {
    console.error("[metas] sincronização de vendedores:", error);
    return Response.json({ error: "Não foi possível consultar os vendedores no VMSET agora." }, { status: 503 });
  }
}
