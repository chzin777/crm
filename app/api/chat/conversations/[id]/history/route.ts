import { NextResponse } from "next/server";
import { conversationNotFound, findScopedConversation, requireChatActor } from "@/lib/chat/access";
import { loadCustomerHistory } from "@/lib/chat/customer-history";

type Context = { params: Promise<{ id: string }> };

/** Visão 360 do cliente no ERP para o painel lateral do chat. */
export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { id } = await context.params;
  const conversation = await findScopedConversation(guard.actor, id);
  if (!conversation) return conversationNotFound();
  const history = await loadCustomerHistory(conversation);
  if (!history) return conversationNotFound();
  return NextResponse.json(history);
}
