import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { applyScore, readThresholds, tierFor, type Tier, type TierThresholds } from "@/lib/scoring";

/** Lead Score no banco: faixas dos níveis (ChatSettings "scoring"), movimentação de pontos e gatilhos. */

const SETTINGS_ID = "scoring";

export async function readScoringSettings(): Promise<{ thresholds: TierThresholds; seeded: boolean }> {
  const row = await prisma.chatSettings.findUnique({ where: { id: SETTINGS_ID } });
  const value = (row?.menu && typeof row.menu === "object" ? row.menu : {}) as Record<string, unknown>;
  return { thresholds: readThresholds(value.thresholds), seeded: value.seeded === true };
}

async function writeScoringSettings(patch: Record<string, unknown>) {
  const row = await prisma.chatSettings.findUnique({ where: { id: SETTINGS_ID } });
  const current = (row?.menu && typeof row.menu === "object" ? row.menu : {}) as Record<string, unknown>;
  const menu = { ...current, ...patch } as Prisma.InputJsonValue;
  await prisma.chatSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, menu }, update: { menu } });
}

export const markScoringSeeded = () => writeScoringSettings({ seeded: true });

/** Novas faixas: grava e reclassifica todos os contatos de uma vez (sem disparar gatilhos de nível). */
export async function saveThresholds(thresholds: TierThresholds) {
  await writeScoringSettings({ thresholds });
  return prisma.$executeRaw`
    UPDATE "Contact" SET tier = CASE
      WHEN score >= ${thresholds.DIAMANTE} THEN 'DIAMANTE'
      WHEN score >= ${thresholds.OURO} THEN 'OURO'
      WHEN score >= ${thresholds.PRATA} THEN 'PRATA'
      ELSE 'BRONZE' END
    WHERE tier IS DISTINCT FROM (CASE
      WHEN score >= ${thresholds.DIAMANTE} THEN 'DIAMANTE'
      WHEN score >= ${thresholds.OURO} THEN 'OURO'
      WHEN score >= ${thresholds.PRATA} THEN 'PRATA'
      ELSE 'BRONZE' END)`;
}

export type ScoreChange = { contactId: string; before: number; score: number; tierBefore: Tier; tier: Tier; delta: number };

/**
 * Soma (ou tira) pontos do contato com motivo: atualização atômica do saldo, registro no histórico e, depois,
 * os gatilhos "Pontuação atingiu X" e "Mudou de nível" em segundo plano (fora da execução que pediu a mudança).
 */
export async function changeScore(contactId: string, delta: number, reason: string, source: "automacao" | "equipe" | "sistema" = "automacao"): Promise<ScoreChange> {
  const { thresholds } = await readScoringSettings();
  const change = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ score: number; tier: string }[]>`SELECT score, tier FROM "Contact" WHERE id = ${contactId} FOR UPDATE`;
    if (!rows.length) throw new Error("Contato não encontrado.");
    const before = Number(rows[0].score) || 0;
    const tierBefore = tierFor(before, thresholds);
    const next = applyScore(before, delta, thresholds);
    await tx.contact.update({ where: { id: contactId }, data: { score: next.score, tier: next.tier, scoreUpdatedAt: new Date() } });
    await tx.contactScoreLog.create({ data: { contactId, delta: next.score - before, scoreAfter: next.score, tierBefore, tierAfter: next.tier, reason: reason.slice(0, 300), source } });
    return { contactId, before, score: next.score, tierBefore, tier: next.tier, delta: next.score - before };
  });
  if (change.delta !== 0) setTimeout(() => void emitScoreTriggers(change).catch((error: unknown) => console.error("[scoring] gatilhos:", error)), 0);
  return change;
}

async function emitScoreTriggers(change: ScoreChange) {
  const { triggerAutomations } = await import("@/lib/automations/engine-db");
  const vars = { pontuacao: String(change.score), nivel: change.tier, nivel_anterior: change.tierBefore };
  await triggerAutomations({ type: "trigger_score", score: change.score, previous: change.before }, { contactId: change.contactId, vars });
  if (change.tier !== change.tierBefore) await triggerAutomations({ type: "trigger_tier", tier: change.tier, previous: change.tierBefore }, { contactId: change.contactId, vars });
}
