import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { AiError } from "@/lib/ai/openai";
import { suggestReply } from "@/lib/ai/assist";

type Context = { params: Promise<{ id: string }> };

/**
 * Copiloto de resposta do /chat: a IA lê a conversa (com notas internas e campanha de origem) e os dados do cliente
 * e devolve só o texto sugerido. Nada é enviado ao WhatsApp: o atendente revisa e decide enviar.
 * Funciona com o atendimento autônomo da IA ligado ou desligado (é uma ação manual do operador).
 */
export async function POST(_request: Request, context: Context) {
  // Sugerir resposta é escrever ao cliente: exige poder responder e acesso à conversa (fila/escopo do operador).
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  try {
    const { reply } = await suggestReply(conversation, guard.actor.name, guard.actor.id);
    return NextResponse.json({ reply }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AiError) return chatError(error.message, error.status);
    console.error("[chat/sugerir-resposta]", id, error instanceof Error ? error.message : error);
    return chatError("Não foi possível gerar a sugestão de resposta.", 502);
  }
}
