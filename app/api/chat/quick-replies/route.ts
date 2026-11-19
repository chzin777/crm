import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chatError, requireChatActor, type ChatActor } from "@/lib/chat/access";
import { normalizeShortcut } from "@/lib/chat/quick-replies";

/**
 * Respostas rápidas do atendimento. Da equipe (ownerId nulo): quem gerencia filas cria e edita, todos usam.
 * Pessoais: cada atendente cria, edita e vê só as suas. Fila, gatilhos e variações valem só para as da equipe.
 */
const body = z.object({
  title: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(4096),
  shortcut: z.string().trim().max(40).default(""),
  category: z.string().trim().max(40).nullable().default(null),
  isGlobal: z.boolean().default(true),
  automatic: z.boolean().default(false),
  triggers: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  variations: z.array(z.string().trim().min(1).max(4096)).max(10).default([]),
  queueId: z.string().nullable().default(null),
});
const patchBody = body.extend({ id: z.string().min(1) });

const MODULES = ["chat", "filas", "configuracoes", "respostas"] as const;
const canManageTeam = (actor: ChatActor) => actor.isAdmin || actor.capabilities["chat.queues"];
const visibleTo = (actor: ChatActor) => ({ OR: [{ ownerId: null }, { ownerId: actor.id }] });

async function persist(actor: ChatActor, input: z.infer<typeof body>, id?: string) {
  if (input.isGlobal && !canManageTeam(actor)) return chatError("Só quem gerencia filas cria respostas para toda a equipe. Salve como “Apenas para mim”.", 403);
  if (id) {
    const current = await prisma.chatQuickReply.findUnique({ where: { id }, select: { ownerId: true } });
    if (!current || (current.ownerId !== null && current.ownerId !== actor.id)) return chatError("Resposta não encontrada.", 404);
    if (current.ownerId === null && !canManageTeam(actor)) return chatError("Sem permissão para editar respostas da equipe.", 403);
  }
  const shortcut = normalizeShortcut(input.shortcut);
  const ownerId = input.isGlobal ? null : actor.id;
  if (shortcut) {
    // Atalho único entre as respostas que a mesma pessoa enxerga (equipe + as dela).
    const clash = await prisma.chatQuickReply.findFirst({
      where: { shortcut, ...(id ? { NOT: { id } } : {}), OR: ownerId ? [{ ownerId: null }, { ownerId }] : [{ ownerId: null }] },
      select: { title: true },
    });
    if (clash) return chatError(`O atalho /${shortcut} já é usado pela resposta “${clash.title}”.`, 409);
  }
  const data = {
    title: input.title,
    text: input.text,
    shortcut,
    category: input.category || null,
    ownerId,
    automatic: input.isGlobal ? input.automatic : false,
    triggers: input.isGlobal && input.automatic ? input.triggers : [],
    variations: input.isGlobal && input.automatic ? input.variations : [],
    queueId: input.isGlobal ? input.queueId : null,
  };
  const saved = id ? await prisma.chatQuickReply.update({ where: { id }, data }) : await prisma.chatQuickReply.create({ data });
  return NextResponse.json({ id: saved.id, data: { ...saved, isGlobal: saved.ownerId === null, mine: saved.ownerId === actor.id } }, { status: id ? 200 : 201 });
}

export async function GET() {
  const guard = await requireChatActor(undefined, [...MODULES]);
  if (guard.response) return guard.response;
  const rows = await prisma.chatQuickReply.findMany({ where: visibleTo(guard.actor), orderBy: { title: "asc" } });
  const data = rows.map((row) => ({ ...row, isGlobal: row.ownerId === null, mine: row.ownerId === guard.actor.id }));
  return NextResponse.json({ data, canManageTeam: canManageTeam(guard.actor) });
}

export async function POST(request: Request) {
  const guard = await requireChatActor(undefined, [...MODULES]);
  if (guard.response) return guard.response;
  const raw = (await request.json().catch(() => null)) as { id?: unknown } | null;
  // Compatibilidade: POST com id edita (formato antigo da tela de filas).
  if (raw && typeof raw.id === "string" && raw.id) {
    const parsed = patchBody.safeParse(raw);
    if (!parsed.success) return chatError("Confira os dados da resposta.", 400);
    const { id, ...input } = parsed.data;
    return persist(guard.actor, input, id);
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return chatError("Confira os dados da resposta.", 400);
  return persist(guard.actor, parsed.data);
}

export async function PATCH(request: Request) {
  const guard = await requireChatActor(undefined, [...MODULES]);
  if (guard.response) return guard.response;
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return chatError("Confira os dados da resposta.", 400);
  const { id, ...input } = parsed.data;
  return persist(guard.actor, input, id);
}

export async function DELETE(request: Request) {
  const guard = await requireChatActor(undefined, [...MODULES]);
  if (guard.response) return guard.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return chatError("Dados inválidos.", 400);
  const current = await prisma.chatQuickReply.findUnique({ where: { id }, select: { ownerId: true } });
  if (!current || (current.ownerId !== null && current.ownerId !== guard.actor.id)) return chatError("Resposta não encontrada.", 404);
  if (current.ownerId === null && !canManageTeam(guard.actor)) return chatError("Sem permissão para excluir respostas da equipe.", 403);
  await prisma.chatQuickReply.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
