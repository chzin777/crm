import { requireModule } from "@/lib/api-auth";
import { commercialAutomationsOverview, saveCommercialSettings } from "@/lib/commercial/jobs-db";
import { sanitizeCommercialSettings } from "@/lib/commercial/settings";

/** Automações comerciais do VMSet (revisão de grau, reposição de lentes, recuperação de orçamento): regras + histórico. */
export async function GET() {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  try {
    return Response.json({ data: await commercialAutomationsOverview() });
  } catch (error) {
    console.error("[automacoes/comercial] falha:", error);
    return Response.json({ error: "Não foi possível carregar as automações comerciais." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireModule("automacoes");
  if (guard.response) return guard.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Dados inválidos." }, { status: 400 });
  // Revisão anual e reposição de lentes saem sem o cliente ter escrito (fora da janela de 24 h): só com modelo da Meta.
  const settings = sanitizeCommercialSettings(body);
  if (settings.rxReview.enabled && !settings.rxReview.template) return Response.json({ error: "Revisão de grau: vincule um modelo aprovado da Meta antes de ativar (fora da janela de 24 h a Meta não aceita texto livre)." }, { status: 400 });
  if (settings.contactLens.enabled && !settings.contactLens.template) return Response.json({ error: "Reposição de lentes: vincule um modelo aprovado da Meta antes de ativar (fora da janela de 24 h a Meta não aceita texto livre)." }, { status: 400 });
  return Response.json({ data: await saveCommercialSettings(body) });
}
