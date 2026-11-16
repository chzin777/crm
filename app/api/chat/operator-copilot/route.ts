import { NextResponse } from "next/server";
import { z } from "zod";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { loadOperationalContext, quickQuery } from "@/lib/chat/quick-query-db";
import { runOperatorCopilot } from "@/lib/chat/operator-copilot";
import { aiJson, AiError } from "@/lib/ai/openai";

const body = z.object({
  conversationId: z.string().min(1),
  question: z.string().trim().min(1).max(600),
});

/** Mini-chat interno do operador: IA só leitura com as consultas do VMSet. Nunca envia nada ao cliente. */
export async function POST(request: Request) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Escreva uma pergunta de até 600 caracteres.", 400);
  const conversation = await findScopedConversation(guard.actor, parsed.data.conversationId);
  if (!conversation) return conversationNotFound();
  try {
    const { context } = await loadOperationalContext(conversation);
    const result = await runOperatorCopilot(
      { question: parsed.data.question, context },
      {
        ai: (messages) => aiJson<{ consulta?: unknown }>(messages, { feature: "operator-copilot", conversationId: conversation.id, userId: guard.actor.id, maxTokens: 120 }),
        query: (kind, params) => quickQuery({ kind, params, contactId: conversation.contactId }),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiError) return chatError(error.message, error.status);
    console.error("[copiloto] falha");
    return chatError("O copiloto não conseguiu responder agora.", 503);
  }
}
