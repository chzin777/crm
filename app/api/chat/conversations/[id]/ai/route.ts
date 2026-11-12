import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { AiError } from "@/lib/ai/openai";
import { suggestProducts, suggestReply, summarizeConversation } from "@/lib/ai/assist";

type Context = { params: Promise<{ id: string }> };

const ACTIONS = ["reply", "summary", "products"] as const;
type Action = (typeof ACTIONS)[number];

/** Copiloto do atendimento: sugere resposta, resume a conversa ou sugere produtos. Nada é enviado ao cliente aqui. */
export async function POST(request: Request, context: Context) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = ACTIONS.find((item) => item === body.action) as Action | undefined;
  if (!action) return chatError("Ação de IA inválida.", 400);

  // Sugerir resposta é escrever ao cliente: exige poder responder.
  const guard = await requireChatActor(action === "reply" ? "chat.assume" : undefined);
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  try {
    if (action === "reply") return NextResponse.json(await suggestReply(conversation, guard.actor.name, guard.actor.id));
    if (action === "summary") return NextResponse.json(await summarizeConversation(conversation, guard.actor.id));
    return NextResponse.json(await suggestProducts(conversation, guard.actor.id));
  } catch (error) {
    if (error instanceof AiError) return chatError(error.message, error.status);
    console.error("[ai]", action, error);
    return chatError("Não foi possível gerar a resposta da IA.", 502);
  }
}
