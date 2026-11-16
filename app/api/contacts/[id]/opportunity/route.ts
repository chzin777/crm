import { requireApiSession } from "@/lib/api-auth";
import { STAGE_DEFINITIONS, type StageId } from "@/lib/pipeline-stages";
import { SALES_PIPELINE } from "@/lib/sales-pipeline";
import { contactOpportunity, updateOpportunity } from "@/lib/sales-pipeline-db";

type Context = RouteContext<"/api/contacts/[id]/opportunity">;

const SALES_COLUMNS = new Set<string>(STAGE_DEFINITIONS.filter((stage) => stage.pipelineId === SALES_PIPELINE).map((stage) => stage.id));

/** Oportunidade do contato no funil de vendas (aberta ou a última ganha) e as etapas configuradas. */
export async function GET(_request: Request, context: Context) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  return Response.json(await contactOpportunity(id));
}

/** Seletor rápido de etapa no atendimento (movimento manual) e pausa da automação do card. */
export async function PATCH(request: Request, context: Context) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { cardId?: unknown; column?: unknown; autoMoveEnabled?: unknown } | null;
  if (!body || typeof body.cardId !== "string") return Response.json({ error: "Oportunidade inválida." }, { status: 400 });
  if (body.column !== undefined && (typeof body.column !== "string" || !SALES_COLUMNS.has(body.column))) return Response.json({ error: "Etapa inválida." }, { status: 400 });
  if (body.autoMoveEnabled !== undefined && typeof body.autoMoveEnabled !== "boolean") return Response.json({ error: "Valor inválido." }, { status: 400 });
  const card = await updateOpportunity({
    contactId: id,
    cardId: body.cardId,
    column: body.column as StageId | undefined,
    autoMoveEnabled: body.autoMoveEnabled as boolean | undefined,
    author: user.name || "Vendedor",
  });
  if (!card) return Response.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  return Response.json({ card });
}
