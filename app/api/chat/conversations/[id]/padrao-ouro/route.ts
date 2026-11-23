import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { AiError, aiConfigured } from "@/lib/ai/openai";
import { isGoldConversation, removeGoldConversation, saveGoldConversation } from "@/lib/ai/gold-conversation";

type Context = { params: Promise<{ id: string }> };

/** Se a conversa já está na memória da IA como atendimento padrão ouro. */
export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.queues");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  if (!(await findScopedConversation(guard.actor, id))) return conversationNotFound();
  return NextResponse.json({ gold: await isGoldConversation(id) });
}

/** Gerente marca a conversa como atendimento padrão ouro: vira exemplo anonimizado para a IA (few-shot dinâmico). */
export async function POST(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.queues");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  if (!(await findScopedConversation(guard.actor, id))) return conversationNotFound();
  if (!aiConfigured()) return chatError("IA não configurada no servidor.", 503);
  try {
    const saved = await saveGoldConversation(id, { reason: "padrao_ouro", userId: guard.actor.id });
    if (!saved) return chatError("A conversa precisa ter mensagens do cliente e da equipe para virar exemplo.", 422);
    return NextResponse.json({ ok: true, gold: true });
  } catch (error) {
    if (error instanceof AiError) return chatError(error.message, error.status);
    console.error("[chat/padrao-ouro]", id, error instanceof Error ? error.message : error);
    return chatError("Não foi possível salvar o atendimento na memória da IA.", 502);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const guard = await requireChatActor("chat.queues");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  if (!(await findScopedConversation(guard.actor, id))) return conversationNotFound();
  await removeGoldConversation(id);
  return NextResponse.json({ ok: true, gold: false });
}
