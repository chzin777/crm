import { NextResponse } from "next/server";
import { z } from "zod";
import { chatError, conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { transferConversation } from "@/lib/chat/actions";
import { ChatRuleError } from "@/lib/chat/outbound";

type Context = { params: Promise<{ id: string }> };

const body = z.object({ queueId: z.string().min(1), assigneeId: z.string().min(1).optional(), reason: z.string().trim().max(500).default("") });

export async function POST(request: Request, context: Context) {
  const guard = await requireChatActor("chat.transfer");
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Dados inválidos.", 400);

  try {
    await transferConversation(guard.actor, conversation, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRuleError) return chatError(error.message, error.status);
    throw error;
  }
}
