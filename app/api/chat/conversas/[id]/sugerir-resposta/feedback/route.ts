import { NextResponse } from "next/server";
import { conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { aiConfigured } from "@/lib/ai/openai";
import { saveCopilotCorrection } from "@/lib/ai/gold-conversation";
import { meaningfulEdit } from "@/lib/ai/vector-memory";

type Context = { params: Promise<{ id: string }> };

/**
 * Retorno silencioso do copiloto: o atendente usou a sugestão, ajustou o texto e enviou. A versão enviada vira
 * referência de estilo/informação para as próximas sugestões. Nunca falha para o operador.
 */
export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  if (!(await findScopedConversation(guard.actor, id))) return conversationNotFound();
  const body = (await request.json().catch(() => null)) as { suggestion?: unknown; sent?: unknown } | null;
  const suggestion = typeof body?.suggestion === "string" ? body.suggestion.slice(0, 4000) : "";
  const sent = typeof body?.sent === "string" ? body.sent.slice(0, 4000) : "";
  if (!aiConfigured() || !meaningfulEdit(suggestion, sent)) return NextResponse.json({ ok: true, saved: false });
  try {
    await saveCopilotCorrection({ conversationId: id, suggestion, sent, userId: guard.actor.id });
    return NextResponse.json({ ok: true, saved: true });
  } catch (error) {
    console.warn("[chat/sugerir-resposta/feedback]", id, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: true, saved: false });
  }
}
