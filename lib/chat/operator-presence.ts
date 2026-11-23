import "server-only";
import { prisma } from "@/lib/prisma";
import { parsePresence, shouldAutoAway, type PresenceStatus } from "@/lib/chat/presence-status";

/** Configurações de atendimento em /configuracoes (lista "settings" do workspace). */
export type OperatorSettings = { autoAwayMinutes: number; signMessagesWithName: boolean };
export const DEFAULT_AUTO_AWAY_MINUTES = 15;

export async function readOperatorSettings(): Promise<OperatorSettings> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "settings" }, select: { value: true } });
  const value = (row?.value ?? {}) as { operatorAutoAwayMinutes?: unknown; signMessagesWithName?: unknown };
  const raw = value.operatorAutoAwayMinutes;
  const minutes = raw === undefined || raw === null || raw === "" ? DEFAULT_AUTO_AWAY_MINUTES : Number(raw);
  return {
    autoAwayMinutes: Number.isFinite(minutes) && minutes >= 0 ? Math.min(Math.round(minutes), 24 * 60) : DEFAULT_AUTO_AWAY_MINUTES,
    signMessagesWithName: value.signMessagesWithName === true,
  };
}

/** Troca manual (ou pelo gestor). `paused` acompanha: só ONLINE recebe novos atendimentos. */
export async function setPresence(userId: string, status: PresenceStatus, options: { auto?: boolean } = {}) {
  const now = new Date();
  const data = { presenceStatus: status, paused: status !== "ONLINE", awayAuto: options.auto === true && status === "AWAY" };
  await prisma.chatAgent.upsert({
    where: { userId },
    create: { userId, ...data, ...(options.auto ? {} : { lastActivityAt: now, lastSeenAt: now }) },
    update: { ...data, ...(options.auto ? {} : { lastActivityAt: now, lastSeenAt: now }) },
  });
}

/**
 * Interação real no CRM (clique, digitação, envio). Quem foi para Ausente pela inatividade volta a Online;
 * Ausente/Offline escolhido pela própria pessoa continua como está.
 */
export async function touchActivity(userId: string) {
  const now = new Date();
  const agent = await prisma.chatAgent.upsert({
    where: { userId },
    create: { userId, lastActivityAt: now, lastSeenAt: now },
    update: { lastActivityAt: now, lastSeenAt: now },
    select: { presenceStatus: true, awayAuto: true },
  });
  if (agent.awayAuto && parsePresence(agent.presenceStatus) === "AWAY") {
    // Condicional: se a pessoa escolheu outro status nesse meio-tempo, nada muda.
    await prisma.chatAgent.updateMany({ where: { userId, awayAuto: true, presenceStatus: "AWAY" }, data: { presenceStatus: "ONLINE", paused: false, awayAuto: false } });
    return "ONLINE" as const;
  }
  return parsePresence(agent.presenceStatus);
}

/** Relógio: ONLINE sem interação além do limite de /configuracoes vai para Ausente e sai do rodízio na hora. */
export async function autoAwayInactive(now = new Date()) {
  const { autoAwayMinutes } = await readOperatorSettings();
  if (autoAwayMinutes <= 0) return 0;
  const candidates = await prisma.chatAgent.findMany({
    where: { presenceStatus: "ONLINE", lastActivityAt: { lt: new Date(now.getTime() - autoAwayMinutes * 60 * 1000) } },
    select: { userId: true, presenceStatus: true, lastActivityAt: true },
  });
  let changed = 0;
  for (const agent of candidates) {
    if (!shouldAutoAway(agent, autoAwayMinutes, now.getTime())) continue;
    const updated = await prisma.chatAgent.updateMany({
      where: { userId: agent.userId, presenceStatus: "ONLINE", lastActivityAt: agent.lastActivityAt },
      data: { presenceStatus: "AWAY", paused: true, awayAuto: true },
    });
    changed += updated.count;
  }
  if (changed > 0) console.log(`[presence] ${changed} operador(es) em Ausente por ${autoAwayMinutes} min sem atividade`);
  return changed;
}
