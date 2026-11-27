import { requireApiSession } from "@/lib/api-auth";
import { loadViewer, orderForViewer } from "@/lib/app-sales";

/** Detalhe de uma venda no app (?order=123&store=4), dentro do recorte do usuário (vendedor só as dele). */
export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const viewer = await loadViewer(user.id);
  if (!viewer) return Response.json({ error: "Usuário sem acesso." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  try {
    const result = await orderForViewer(viewer, params.get("order"), params.get("store"));
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ data: result.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[app/vendas/pedido]", error);
    return Response.json({ error: "Não foi possível abrir a venda agora." }, { status: 500 });
  }
}
