import { NextResponse } from "next/server";
import { conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { conversationCommercialContext, pinnedHandoffBrief } from "@/lib/commercial/jobs-db";

type Context = { params: Promise<{ id: string }> };

/** Resumo do transbordo fixado no topo do atendimento e dados comerciais para as variáveis dos modelos. */
export async function GET(request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  // Variáveis (contexto comercial completo) só quando o seletor de modelos pede: o card fixado consulta a cada pulso.
  const withVariables = new URL(request.url).searchParams.get("variables") === "1";
  const [brief, commercial] = await Promise.all([pinnedHandoffBrief(conversation.id), withVariables ? conversationCommercialContext(conversation.id).catch(() => null) : null]);
  return NextResponse.json({
    brief,
    variables: {
      model: commercial?.mainItem ?? "",
      store: commercial?.store ?? "",
      city: commercial?.city ?? "",
    },
  });
}
