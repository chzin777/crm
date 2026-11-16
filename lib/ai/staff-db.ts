import "server-only";
import { prisma } from "@/lib/prisma";
import { matchStaff, type StaffMember } from "@/lib/ai/staff-request";

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; staff: Promise<StaffMember[]> } | null = null;

/** Colaboradores ativos (não bloqueados) do CRM com a fila principal de cada um; cache leve de 5 min. */
export function activeStaff(): Promise<StaffMember[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.staff;
  const load = Promise.resolve()
    .then(() => prisma.user.findMany({
      where: { banned: false },
      select: { id: true, name: true, chatQueues: { where: { queue: { archivedAt: null } }, orderBy: [{ queue: { order: "asc" } }], take: 1, select: { queue: { select: { id: true, name: true } } } } },
    }))
    .then((users) => users.filter((user) => user.name?.trim()).map((user): StaffMember => ({ id: user.id, name: user.name.trim(), queueId: user.chatQueues[0]?.queue.id ?? null, queueName: user.chatQueues[0]?.queue.name ?? null })));
  cache = { at: Date.now(), staff: load };
  load.catch(() => { cache = null; });
  return load;
}

/** Atendente/colaborador do CRM pelo nome (primeiro nome ou completo, sem acento). */
export async function matchStaffMemberByName(name: string) {
  return matchStaff(await activeStaff(), name);
}
