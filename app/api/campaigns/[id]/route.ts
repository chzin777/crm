import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { patchCampaign, removeCampaign } from "@/lib/campaigns";

type Context = { params: Promise<{ id: string }> };

/**
 * Modo de atendimento ao responder a campanha ({ aiAutoReplyEnabled }): "IA responde e qualifica o lead" (true) ou
 * "Apenas fila humana" (false). Vale em qualquer status (rascunho, agendada, enviando, pausada ou concluída) e tem
 * efeito imediato: cada resposta recebida consulta a campanha de origem na hora. Grava só este campo, sem
 * sobrescrever o progresso que o disparo atualiza em paralelo.
 */
export async function PATCH(request: Request, context: Context) {
  const guard = await requireModule("campanhas");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { aiAutoReplyEnabled?: unknown } | null;
  if (typeof body?.aiAutoReplyEnabled !== "boolean") return NextResponse.json({ error: "Informe aiAutoReplyEnabled (true ou false)." }, { status: 400 });
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } });
  const list = Array.isArray(row?.value) ? (row.value as unknown as { id: string }[]) : [];
  if (!list.some((campaign) => campaign.id === id)) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  await patchCampaign(id, { aiAutoReplyEnabled: body.aiAutoReplyEnabled });
  return NextResponse.json({ ok: true, aiAutoReplyEnabled: body.aiAutoReplyEnabled });
}

/**
 * Exclui a campanha da lista. Disparo em andamento ou pausado bloqueia (pare ou cancele antes). O registro do
 * disparo e a lista de destinatários saem junto; os envios já feitos (CampaignMessage) ficam como histórico do
 * contato (intervalo entre campanhas, engajamento e atribuição de vendas).
 */
export async function DELETE(_request: Request, context: Context) {
  const guard = await requireModule("campanhas");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const job = await prisma.crmWorkspaceData.findUnique({ where: { key: `dispatch:${id}` }, select: { value: true } });
  const status = (job?.value as { status?: string } | null)?.status;
  if (status === "running" || status === "paused") return NextResponse.json({ error: "Esta campanha tem um disparo em andamento ou pausado. Cancele o disparo antes de excluir." }, { status: 409 });
  if (!(await removeCampaign(id))) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  await prisma.crmWorkspaceData.deleteMany({ where: { key: { in: [`dispatch:${id}`, `dispatch-recipients:${id}`] } } });
  return NextResponse.json({ ok: true });
}
