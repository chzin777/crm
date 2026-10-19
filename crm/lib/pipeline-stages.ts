export type PipelineId = "novos" | "relacionamento";
export type StageId = "novo-lead" | "em-atendimento" | "fechamento" | "pos-venda" | "recompra" | "reativacao";

export const CONTACT_CATEGORIES = ["cliente", "lead", "nps", "inativo"] as const;

export interface StageCriteria {
  minCompras: number | null;
  maxCompras: number | null;
  minTotalGasto: number | null;
  maxTotalGasto: number | null;
  minDiasSemCompra: number | null;
  maxDiasSemCompra: number | null;
  categorias: string[];
}

export interface StageConfig {
  titulo: string;
  descricao: string;
  ordem: number;
  maxDiasNaEtapa: number | null;
  autoSync: boolean;
  criterios: StageCriteria;
}

export interface StageConfigStore {
  stages?: Partial<Record<StageId, Partial<Omit<StageConfig, "criterios">> & { criterios?: Partial<StageCriteria> }>>;
}

export interface StageDefinition {
  id: StageId;
  pipelineId: PipelineId;
  titulo: string;
  descricao: string;
  bgColuna: string;
}

export interface LegacyPipelineRules {
  posVenda?: { minCompras?: number; maxDiasDesdeUltimaCompra?: number };
  recompra?: { minCompras?: number; minTotalGasto?: number; maxDiasDesdeUltimaCompra?: number };
  reativacao?: { minDiasInativo?: number; minComprasHistoricas?: number };
}

export const STAGE_DEFINITIONS: StageDefinition[] = [
  { id: "novo-lead", pipelineId: "novos", titulo: "Novo lead", descricao: "Aguardando qualificação", bgColuna: "bg-[#f8f9fc] dark:bg-[#07194f]/60" },
  { id: "em-atendimento", pipelineId: "novos", titulo: "Em atendimento", descricao: "Necessidade e orçamento", bgColuna: "bg-[#f5f8ff] dark:bg-[#07194f]/60" },
  { id: "fechamento", pipelineId: "novos", titulo: "Fechamento", descricao: "Pronto para a primeira compra", bgColuna: "bg-[#fbfcf5] dark:bg-[#07194f]/60" },
  { id: "pos-venda", pipelineId: "relacionamento", titulo: "Pós-venda", descricao: "Acompanhamento e satisfação", bgColuna: "bg-[#f8f9fc] dark:bg-[#07194f]/60" },
  { id: "recompra", pipelineId: "relacionamento", titulo: "Recompra", descricao: "Reposição e novas necessidades", bgColuna: "bg-[#fbfcf5] dark:bg-[#07194f]/60" },
  { id: "reativacao", pipelineId: "relacionamento", titulo: "Reativação", descricao: "Retomar clientes inativos", bgColuna: "bg-[#f5f8ff] dark:bg-[#07194f]/60" },
];

export const STAGE_PROGRESS: Record<StageId, number> = {
  "novo-lead": 15,
  "em-atendimento": 55,
  fechamento: 90,
  "pos-venda": 20,
  recompra: 60,
  reativacao: 85,
};

const emptyCriteria = (): StageCriteria => ({
  minCompras: null,
  maxCompras: null,
  minTotalGasto: null,
  maxTotalGasto: null,
  minDiasSemCompra: null,
  maxDiasSemCompra: null,
  categorias: [],
});

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;

export function defaultCriteria(stageId: StageId, legacy: LegacyPipelineRules = {}): StageCriteria {
  const criteria = emptyCriteria();
  if (stageId === "pos-venda") {
    criteria.minCompras = finiteNumber(legacy.posVenda?.minCompras, 1);
    criteria.maxDiasSemCompra = finiteNumber(legacy.posVenda?.maxDiasDesdeUltimaCompra, 30);
  } else if (stageId === "recompra") {
    criteria.minCompras = finiteNumber(legacy.recompra?.minCompras, 2);
    criteria.minTotalGasto = finiteNumber(legacy.recompra?.minTotalGasto, 100);
    criteria.maxDiasSemCompra = finiteNumber(legacy.recompra?.maxDiasDesdeUltimaCompra, 90);
  } else if (stageId === "reativacao") {
    criteria.minCompras = finiteNumber(legacy.reativacao?.minComprasHistoricas, 1);
    criteria.minDiasSemCompra = finiteNumber(legacy.reativacao?.minDiasInativo, 180);
  }
  return criteria;
}

const readNullable = (value: unknown, fallback: number | null, integer = false): number | null => {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value))) return value;
  return fallback;
};

/** Merges the stored configuration over the defaults, discarding invalid values. */
export function resolveStageConfigs(store: unknown, legacy: LegacyPipelineRules = {}): Record<StageId, StageConfig> {
  const stored = (store && typeof store === "object" && !Array.isArray(store) ? (store as StageConfigStore).stages : undefined) ?? {};
  const result = {} as Record<StageId, StageConfig>;
  const orderInPipeline: Record<PipelineId, number> = { novos: 0, relacionamento: 0 };

  for (const definition of STAGE_DEFINITIONS) {
    const raw = stored[definition.id];
    const saved = raw && typeof raw === "object" ? raw : {};
    const savedCriteria = saved.criterios && typeof saved.criterios === "object" ? saved.criterios : {};
    const defaults = defaultCriteria(definition.id, legacy);
    const titulo = typeof saved.titulo === "string" && saved.titulo.trim() ? saved.titulo.trim().slice(0, 40) : definition.titulo;
    const descricao = typeof saved.descricao === "string" ? saved.descricao.trim().slice(0, 120) : definition.descricao;
    const categorias = Array.isArray(savedCriteria.categorias)
      ? savedCriteria.categorias.filter((item): item is string => typeof item === "string" && (CONTACT_CATEGORIES as readonly string[]).includes(item))
      : defaults.categorias;

    result[definition.id] = {
      titulo,
      descricao,
      ordem: typeof saved.ordem === "number" && Number.isFinite(saved.ordem) ? saved.ordem : orderInPipeline[definition.pipelineId],
      maxDiasNaEtapa: readNullable(saved.maxDiasNaEtapa, null, true),
      autoSync: typeof saved.autoSync === "boolean" ? saved.autoSync : definition.pipelineId === "relacionamento",
      criterios: {
        minCompras: readNullable(savedCriteria.minCompras, defaults.minCompras, true),
        maxCompras: readNullable(savedCriteria.maxCompras, defaults.maxCompras, true),
        minTotalGasto: readNullable(savedCriteria.minTotalGasto, defaults.minTotalGasto),
        maxTotalGasto: readNullable(savedCriteria.maxTotalGasto, defaults.maxTotalGasto),
        minDiasSemCompra: readNullable(savedCriteria.minDiasSemCompra, defaults.minDiasSemCompra, true),
        maxDiasSemCompra: readNullable(savedCriteria.maxDiasSemCompra, defaults.maxDiasSemCompra, true),
        categorias,
      },
    };
    orderInPipeline[definition.pipelineId] += 1;
  }
  return result;
}

/** Stage definitions of one pipeline, ordered by the configured position. */
export function orderedStages(pipelineId: PipelineId, configs: Record<StageId, StageConfig>): StageDefinition[] {
  return STAGE_DEFINITIONS
    .map((definition, index) => ({ definition, index }))
    .filter(({ definition }) => definition.pipelineId === pipelineId)
    .sort((a, b) => configs[a.definition.id].ordem - configs[b.definition.id].ordem || a.index - b.index)
    .map(({ definition }) => definition);
}
