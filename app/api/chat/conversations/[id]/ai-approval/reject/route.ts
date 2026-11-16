import { NextResponse } from "next/server";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { assumeFor, ChatRuleError } from "@/lib/chat/outbound";
import { rejectFinancial } from "@/lib/ai/installments-db";

type Context = { params: Promise<{ id: string }> };

/** Descarta o rascunho da IA e o operador assume o atendimento manualmente. */
export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.assume");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  const body = (await request.json().catch(() => null)) as { actionId?: unknown } | null;
  if (typeof body?.actionId !== "string") return chatError("Aprovação inválida.", 400);
  try {
    const result = await rejectFinancial({ actionId: body.actionId, conversationId: conversation.id, actor: guard.actor, assume: () => assumeFor(guard.actor, conversation) });
    if (!result.ok) return chatError(result.error, 409);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRuleError) return chatError(error.message, error.status, { code: error.code });
    throw error;
  }
}
