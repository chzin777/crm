import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChatActor } from "@/lib/chat/access";
import { readMenuState } from "@/lib/chat/menu";

type Context = { params: Promise<{ id: string }> };

const LIMIT = 100;

/** Quem espera na fila, na ordem de chegada; os tempos são calculados na tela para correrem ao vivo. */
export async function GET(_request: Request, context: Context) {
  const guard = await requireChatActor(undefined, ["chat", "filas"]);
  if (guard.response) return guard.response;
  const { id } = await context.params;

  const rows = await prisma.chatConversation.findMany({
    where: { queueId: id, status: "waiting", closedAt: null },
    orderBy: [{ waitingSince: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    take: LIMIT,
    select: {
      id: true,
      phone: true,
      waitingSince: true,
      createdAt: true,
      menuState: true,
      contact: { select: { name: true, avatarUrl: true } },
      messages: { where: { author: "customer" }, orderBy: { createdAt: "desc" }, take: 1, select: { text: true, attachment: true } },
    },
  });

  const items = rows.map((row, index) => {
    const position = index + 1;
    const state = readMenuState(row.menuState);
    const since = row.waitingSince ?? row.createdAt;
    // A posição gravada pelo relógio só vale se ainda é a mesma; senão mudou há menos de um minuto.
    const positionSince = state.notifiedPosition === position && state.positionSince ? state.positionSince : since.toISOString();
    const last = row.messages[0];
    return {
      position,
      conversationId: row.id,
      name: row.contact.name,
      avatarUrl: row.contact.avatarUrl,
      phone: row.phone,
      waitingSince: since.toISOString(),
      positionSince,
      lastMessage: last ? last.text || (last.attachment ? "[Anexo]" : "") : "",
    };
  });

  return NextResponse.json({ data: items });
}
