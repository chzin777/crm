import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { patchCampaign } from "@/lib/campaigns";

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
