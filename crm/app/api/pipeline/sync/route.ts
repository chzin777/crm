import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { invalidateCache } from "@/lib/cache";
import {
  STAGE_PROGRESS,
  orderedStages,
  resolveStageConfigs,
  type PipelineId,
  type StageCriteria,
  type StageId,
} from "@/lib/pipeline-stages";

export const maxDuration = 300; // 5 minutes

interface PipelineRules {
  posVenda: { minCompras: number; maxDiasDesdeUltimaCompra: number };
  recompra: { minCompras: number; minTotalGasto: number; maxDiasDesdeUltimaCompra: number };
  reativacao: { minDiasInativo: number; minComprasHistoricas: number };
}

interface CrmSettings {
  pipelineAutoSyncEnabled?: boolean;
  pipelineMaxCardsPerStage?: unknown;
  pipelineRules?: {
    posVenda?: Partial<PipelineRules["posVenda"]>;
    recompra?: Partial<PipelineRules["recompra"]>;
    reativacao?: Partial<PipelineRules["reativacao"]>;
  };
  [key: string]: unknown;
}

interface PurchaseRecord {
  produto: string;
  data: string;
  valor: string;
}

interface PipelineCard {
  id: string;
  pipelineId: PipelineId;
  titulo: string;
  cliente: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  ultimasCompras: PurchaseRecord[];
  tag: string;
  tagColor: string;
  valor: string;
  progresso: number;
  progressoCor: string;
  diasNaEtapa: string;
  iniciais: string;
  coluna: string;
  mensagem: string;
  contactId?: string;
  entrouEmEtapaEm?: string;
}

interface ClassifiedContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  segment: string | null;
  category: string;
  totalSpent: string;
}

const DEFAULT_RULES: PipelineRules = {
  posVenda: { minCompras: 1, maxDiasDesdeUltimaCompra: 30 },
  recompra: { minCompras: 2, minTotalGasto: 100, maxDiasDesdeUltimaCompra: 90 },
  reativacao: { minDiasInativo: 180, minComprasHistoricas: 1 },
};

// Bound the persisted pipeline payload, not just each individual sync run.
const DEFAULT_MAX_CARDS_PER_STAGE = 200;
const MAX_ALLOWED_CARDS_PER_STAGE = 5000;
// Each request fills one batch so the client can show progress between calls.
const BATCH_SIZE_PER_STAGE = 25;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function parsePipelineRules(value: unknown): { rules: PipelineRules } | { error: string } {
  if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) {
    return { error: "As regras de sincronização do pipeline contêm valores inválidos. Revise as configurações." };
  }
  const groups = (value ?? {}) as Record<string, unknown>;
  const read = (groupName: string, key: string, fallback: number, integer = true): number | null => {
    const group = groups[groupName];
    if (group === undefined) return fallback;
    if (!group || typeof group !== "object" || Array.isArray(group)) return null;
    if (!(key in group)) return fallback;
    const candidate = (group as Record<string, unknown>)[key];
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0 || (integer && !Number.isInteger(candidate))) {
      return null;
    }
    return candidate;
  };

  const posVenda = {
    minCompras: read("posVenda", "minCompras", DEFAULT_RULES.posVenda.minCompras),
    maxDiasDesdeUltimaCompra: read("posVenda", "maxDiasDesdeUltimaCompra", DEFAULT_RULES.posVenda.maxDiasDesdeUltimaCompra),
  };
  const recompra = {
    minCompras: read("recompra", "minCompras", DEFAULT_RULES.recompra.minCompras),
    minTotalGasto: read("recompra", "minTotalGasto", DEFAULT_RULES.recompra.minTotalGasto, false),
    maxDiasDesdeUltimaCompra: read("recompra", "maxDiasDesdeUltimaCompra", DEFAULT_RULES.recompra.maxDiasDesdeUltimaCompra),
  };
  const reativacao = {
    minDiasInativo: read("reativacao", "minDiasInativo", DEFAULT_RULES.reativacao.minDiasInativo),
    minComprasHistoricas: read("reativacao", "minComprasHistoricas", DEFAULT_RULES.reativacao.minComprasHistoricas),
  };
  if (
    posVenda.minCompras === null ||
    posVenda.maxDiasDesdeUltimaCompra === null ||
    recompra.minCompras === null ||
    recompra.minTotalGasto === null ||
    recompra.maxDiasDesdeUltimaCompra === null ||
    reativacao.minDiasInativo === null ||
    reativacao.minComprasHistoricas === null
  ) {
    return { error: "As regras de sincronização do pipeline contêm valores inválidos. Revise as configurações." };
  }

  return {
    rules: {
      posVenda: { minCompras: posVenda.minCompras, maxDiasDesdeUltimaCompra: posVenda.maxDiasDesdeUltimaCompra },
      recompra: { minCompras: recompra.minCompras, minTotalGasto: recompra.minTotalGasto, maxDiasDesdeUltimaCompra: recompra.maxDiasDesdeUltimaCompra },
      reativacao: { minDiasInativo: reativacao.minDiasInativo, minComprasHistoricas: reativacao.minComprasHistoricas },
    },
  };
}

// Dates are stored as text, either dd/mm/yyyy (spreadsheet import) or ISO; compare them as real dates.
const LAST_PURCHASE_DATE = Prisma.sql`(CASE
  WHEN c."lastPurchaseDate" ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN to_date(c."lastPurchaseDate", 'DD/MM/YYYY')
  WHEN c."lastPurchaseDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN to_date(left(c."lastPurchaseDate", 10), 'YYYY-MM-DD')
END)`;

function buildCriteriaConditions(criteria: StageCriteria, now: Date): Prisma.Sql[] {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const conditions: Prisma.Sql[] = [];
  if (criteria.minCompras !== null) conditions.push(Prisma.sql`c.purchases >= ${criteria.minCompras}`);
  if (criteria.maxCompras !== null) conditions.push(Prisma.sql`c.purchases <= ${criteria.maxCompras}`);
  if (criteria.minTotalGasto !== null) conditions.push(Prisma.sql`c."totalSpent" >= ${criteria.minTotalGasto}`);
  if (criteria.maxTotalGasto !== null) conditions.push(Prisma.sql`c."totalSpent" <= ${criteria.maxTotalGasto}`);
  if (criteria.minDiasSemCompra !== null) conditions.push(Prisma.sql`${LAST_PURCHASE_DATE} < ${daysAgo(criteria.minDiasSemCompra)}::date`);
  if (criteria.maxDiasSemCompra !== null) conditions.push(Prisma.sql`${LAST_PURCHASE_DATE} >= ${daysAgo(criteria.maxDiasSemCompra)}::date`);
  if (criteria.categorias.length > 0) conditions.push(Prisma.sql`c.category = ANY(${criteria.categorias}::text[])`);
  return conditions;
}

export async function POST() {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let phase = "autenticação";
  let maxCardsPerStage = DEFAULT_MAX_CARDS_PER_STAGE;
  try {
    const user = await requireApiSession();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const result = await prisma.$transaction(async (tx) => {
      phase = "aquisição do lock";
      // Serialize sync requests so simultaneous clicks cannot add duplicate cards.
      await tx.$queryRaw`WITH advisory_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(730021, 1)
      )
      SELECT 1::int AS locked FROM advisory_lock`;

      phase = "leitura das configurações";
      const settingsRow = await tx.crmWorkspaceData.findUnique({ where: { key: "settings" } });
      const settings: CrmSettings = settingsRow ? (settingsRow.value as CrmSettings) : {};
      const parsedRules = parsePipelineRules(settings.pipelineRules);
      if ("error" in parsedRules) return { invalidRules: parsedRules.error };

      const configuredLimit = settings.pipelineMaxCardsPerStage;
      if (configuredLimit !== undefined && (typeof configuredLimit !== "number" || !Number.isInteger(configuredLimit) || configuredLimit < 1 || configuredLimit > MAX_ALLOWED_CARDS_PER_STAGE)) {
        return { invalidRules: `O limite de cards por etapa deve ser um número inteiro entre 1 e ${MAX_ALLOWED_CARDS_PER_STAGE}.` };
      }
      maxCardsPerStage = (configuredLimit as number | undefined) ?? DEFAULT_MAX_CARDS_PER_STAGE;

      if (settings.pipelineAutoSyncEnabled === false) {
        return { disabled: true as const };
      }

      const stageRow = await tx.crmWorkspaceData.findUnique({ where: { key: "pipeline-stages" } });
      const stageConfigs = resolveStageConfigs(stageRow?.value, parsedRules.rules);

      phase = "leitura da pipeline";
      const pipelineRow = await tx.crmWorkspaceData.findUnique({ where: { key: "pipeline" } });
      const existingCards: PipelineCard[] = pipelineRow ? (pipelineRow.value as unknown as PipelineCard[]) : [];

      const now = new Date();
      const nowIso = now.toISOString();
      const categoryLabel: Record<string, string> = {
        cliente: "Cliente",
        lead: "Lead",
        nps: "NPS",
        inativo: "Inativo",
      };
      const stageCounts: Partial<Record<StageId, number>> = {};
      const newCards: PipelineCard[] = [];
      let done = true;

      phase = "classificação dos contatos";
      for (const pipelineId of ["novos", "relacionamento"] as const) {
        const pipelineCards = existingCards.filter((card) => card.pipelineId === pipelineId);
        // A contact appears only once per pipeline, in the most advanced stage it qualifies for.
        const excludedIds = pipelineCards.map((card) => card.contactId).filter((id): id is string => Boolean(id));
        const stages = orderedStages(pipelineId, stageConfigs).reverse();

        for (const stage of stages) {
          const config = stageConfigs[stage.id];
          if (!config.autoSync) continue;
          const used = pipelineCards.filter((card) => card.coluna === stage.id).length;
          const slots = Math.min(BATCH_SIZE_PER_STAGE, Math.max(0, maxCardsPerStage - used));
          if (slots === 0) continue;

          const conditions = [Prisma.sql`TRUE`, ...buildCriteriaConditions(config.criterios, now)];
          if (excludedIds.length > 0) conditions.push(Prisma.sql`c.id <> ALL(${excludedIds}::text[])`);
          const contacts = await tx.$queryRaw<ClassifiedContact[]>(Prisma.sql`
            SELECT c.id, c.name, c.phone, c.email, c."birthDate", c.segment, c.category,
              c."totalSpent"::text AS "totalSpent"
            FROM "Contact" c
            WHERE ${Prisma.join(conditions, " AND ")}
            ORDER BY c."totalSpent" DESC, c.id
            LIMIT ${slots}
          `);

          if (contacts.length >= slots) done = false;
          stageCounts[stage.id] = contacts.length;
          for (const contact of contacts) {
            excludedIds.push(contact.id);
            const totalSpentNum = parseFloat(contact.totalSpent) || 0;
            const tagColor =
              contact.category === "lead"
                ? "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]"
                : contact.category === "cliente"
                  ? "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
            newCards.push({
              id: crypto.randomUUID(),
              pipelineId,
              titulo: `${pipelineId === "novos" ? "Novo cliente" : "Relacionamento"} - ${contact.name}`,
              cliente: contact.name,
              telefone: contact.phone ?? "",
              email: contact.email ?? "",
              dataNascimento: contact.birthDate ?? "",
              ultimasCompras: [],
              tag: contact.segment || categoryLabel[contact.category] || "Cliente",
              tagColor,
              valor: `R$ ${totalSpentNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              progresso: STAGE_PROGRESS[stage.id],
              progressoCor: "bg-[#C4D600]",
              diasNaEtapa: "Novo",
              iniciais: getInitials(contact.name),
              coluna: stage.id,
              mensagem: "",
              contactId: contact.id,
              entrouEmEtapaEm: nowIso,
            });
          }
        }
      }

      const updatedCards = [...newCards, ...existingCards];

      if (newCards.length > 0) {
        phase = "gravação dos cards";
        await tx.crmWorkspaceData.upsert({
          where: { key: "pipeline" },
          update: { value: updatedCards as never, updatedAt: new Date() },
          create: { key: "pipeline", value: updatedCards as never, updatedAt: new Date() },
        });
      }

      phase = "commit da transação";
      return {
        disabled: false as const,
        done,
        created: newCards.length,
        total: updatedCards.length,
        stageCounts,
      };
    }, { maxWait: 10_000, timeout: 120_000 });

    phase = "montagem da resposta";
    if ("invalidRules" in result) {
      return NextResponse.json({ error: result.invalidRules }, { status: 400 });
    }

    if (result.disabled) {
      return NextResponse.json(
        { error: "Automação do pipeline está desabilitada nas configurações." },
        { status: 400 }
      );
    }

    await invalidateCache("dashboard", "audience:store:");

    return NextResponse.json({
      ...result,
      limitPerStage: maxCardsPerStage,
    });
  } catch (error) {
    console.error(`[Pipeline Sync Error][${requestId}]`, {
      phase,
      elapsedMs: Date.now() - startedAt,
      error,
    });
    return NextResponse.json(
      { error: "Erro ao sincronizar pipeline. Verifique os logs do servidor.", requestId, phase },
      { status: 500 }
    );
  }
}
