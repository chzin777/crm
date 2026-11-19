import { requireModule } from "@/lib/api-auth";
import { catalogProductDetail } from "@/lib/catalog/vmset-catalog";

/** Ficha completa do produto: cadastro, preços e estoque por loja (ao vivo no VMSET quando disponível). */
export async function GET(_request: Request, context: { params: Promise<{ codigo: string }> }) {
  const guard = await requireModule("produtos", "chat", "pipelines", "contatos");
  if (guard.response) return guard.response;
  const { codigo } = await context.params;
  const code = decodeURIComponent(codigo).trim();
  if (!/^[0-9A-Za-z.-]{1,20}$/.test(code)) return Response.json({ error: "Código inválido." }, { status: 400 });
  try {
    const detail = await catalogProductDetail(code);
    if (!detail) return Response.json({ error: "Produto não encontrado no catálogo." }, { status: 404 });
    return Response.json(detail);
  } catch (error) {
    console.error("[produtos] ficha indisponível:", error instanceof Error ? error.message : error);
    return Response.json({ error: error instanceof Error ? error.message : "Catálogo indisponível." }, { status: 503 });
  }
}
