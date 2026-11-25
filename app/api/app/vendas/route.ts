import { requireApiSession } from "@/lib/api-auth";
import { loadViewer, saveGoalForViewer, salesForViewer } from "@/lib/app-sales";

/** Vendas e metas do mês no app: o recorte (vendedor, gerente ou geral) vem das Permissões do cargo. */
export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const viewer = await loadViewer(user.id);
  if (!viewer) return Response.json({ error: "Usuário sem acesso." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  try {
    return Response.json({ data: await salesForViewer(viewer, params.get("month"), params.get("store")) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[app/vendas]", error);
    return Response.json({ error: "Não foi possível carregar as vendas agora." }, { status: 500 });
  }
}

/** Meta mensal de um vendedor: { sellerId, month: "2026-11", amount } (0 remove). */
export async function PUT(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const viewer = await loadViewer(user.id);
  if (!viewer) return Response.json({ error: "Usuário sem acesso." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { sellerId?: unknown; month?: unknown; amount?: unknown } | null;
  const amount = Number(body?.amount);
  if (typeof body?.sellerId !== "string" || !body.sellerId) return Response.json({ error: "Escolha o vendedor." }, { status: 400 });
  if (typeof body.month !== "string" || !/^\d{4}-\d{2}$/.test(body.month)) return Response.json({ error: "Informe o mês (AAAA-MM)." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0 || amount >= 1_000_000_000) return Response.json({ error: "Informe a meta em reais." }, { status: 400 });
  const result = await saveGoalForViewer(viewer, { sellerId: body.sellerId, month: body.month, amount });
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
