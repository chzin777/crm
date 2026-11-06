import "server-only";
import { getUserAccess, requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveChatCapabilities, type ChatCapabilities, type ChatCapability, type ModuleKey } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

export type ChatActor = {
  id: string;
  name: string;
  isAdmin: boolean;
  capabilities: ChatCapabilities;
  queueIds: string[];
};

type ActorGuard = { actor: ChatActor; response?: undefined } | { actor?: undefined; response: Response };

export const chatError = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status });

export const conversationNotFound = () => chatError("Conversa não encontrada.", 404);

/** Exige sessão, acesso ao módulo e, quando informada, a capacidade. */
export async function requireChatActor(capability?: ChatCapability, modules: ModuleKey[] = ["chat"]): Promise<ActorGuard> {
  const user = await requireApiSession();
  if (!user) return { response: chatError("Não autenticado.", 401) };
  const access = await getUserAccess(user.id);
  if (!access || !modules.some((module) => access.modules[module])) {
    return { response: chatError("Sem permissão para esta ação.", 403) };
  }
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, role: true, roleRef: { select: { permissions: true } }, chatQueues: { select: { queueId: true } } },
  });
  if (!record) return { response: chatError("Sem permissão para esta ação.", 403) };
  const capabilities = resolveChatCapabilities(record.role, record.roleRef?.permissions);
  if (capability && !capabilities[capability]) return { response: chatError("Sem permissão para esta ação.", 403) };
  return {
    actor: {
      id: user.id,
      name: record.name,
      isAdmin: access.isAdmin,
      capabilities,
      queueIds: record.chatQueues.map((item) => item.queueId),
    },
  };
}

export function scopeWhere(actor: ChatActor): Prisma.ChatConversationWhereInput {
  if (actor.capabilities["chat.viewAll"]) return {};
  return { OR: [{ assigneeId: actor.id }, { queueId: { in: actor.queueIds } }] };
}

/** Conversa fora do escopo volta como inexistente, para não revelar que ela existe. */
export function findScopedConversation(actor: ChatActor, id: string) {
  return prisma.chatConversation.findFirst({ where: { AND: [{ id }, scopeWhere(actor)] } });
}
