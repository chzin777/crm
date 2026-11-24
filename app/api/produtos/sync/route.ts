import { requireModule } from "@/lib/api-auth";
import { catalogSyncStatus, syncCatalog } from "@/lib/catalog/vmset-catalog";

/** Situação da sincronização do catálogo (indicador da tela /produtos). */
export async function GET() {
  const guard = await requireModule("produtos", "chat", "pipelines", "contatos");
  if (guard.response) return guard.response;
  return Response.json(await catalogSyncStatus());
}

/** "Sincronizar agora": dispara a sincronização incremental em segundo plano e responde na hora. */
export async function POST() {
  const guard = await requireModule("produtos");
  if (guard.response) return guard.response;
  void syncCatalog({ products: true, stock: true, refresh: true }).catch((error: unknown) => console.warn(`[catalogo] sincronização manual falhou: ${error instanceof Error ? error.message : error}`));
  return Response.json({ ...(await catalogSyncStatus()), running: true }, { status: 202 });
}
