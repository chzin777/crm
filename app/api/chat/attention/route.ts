import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChatActor, scopeWhere } from "@/lib/chat/access";

/**
 * Contador do item "Atendimento" da barra lateral: conversas na fila aguardando atendimento (no escopo do usuário)
 * + atendimentos dele com mensagem não lida. Leve e sem marcar presença (roda em qualquer página).
 */
export async function GET() {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;
  const { actor } = guard;
  const scope = scopeWhere(actor);
  const [waiting, mine] = await Promise.all([
    prisma.chatConversation.count({ where: { AND: [scope, { status: "waiting", closedAt: null, assigneeId: null }] } }),
    prisma.chatConversation.count({ where: { AND: [scope, { assigneeId: actor.id, closedAt: null, unreadCount: { gt: 0 } }] } }),
  ]);
  return NextResponse.json({ count: waiting + mine, waiting, mine }, { headers: { "Cache-Control": "no-store" } });
}
