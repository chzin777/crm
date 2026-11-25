/**
 * Campanhas comerciais com premiação (puro: servidor, tela e testes).
 * Ex.: "Foco Stepper": a cada 3 armações Stepper vendidas = R$ 100 em voucher iFood (individual, recorrente);
 * maior volume no Grupo de Lojas 1, 2 ou 3 = R$ 500 (grupo, ranking).
 */

export const METRICS = ["VALOR", "QUANTIDADE"] as const;
export const AUDIENCES = ["INDIVIDUAL", "LOJA", "GRUPO"] as const;
export const REWARD_MODES = ["UNICO", "RECORRENTE", "RANKING"] as const;
export type CampaignMetric = (typeof METRICS)[number];
export type CampaignAudience = (typeof AUDIENCES)[number];
export type RewardMode = (typeof REWARD_MODES)[number];
export type CampaignGroup = { name: string; stores: number[] };

export type CampaignRule = {
  name: string;
  metric: CampaignMetric;
  brand: string | null;
  category: string | null;
  /** Lojas da campanha; vazio = todas. */
  stores: number[];
  /** "2026-11-01" */
  startDate: string;
  endDate: string;
  audience: CampaignAudience;
  groups: CampaignGroup[];
  /** Meta (R$ ou unidades); em RECORRENTE é o tamanho do bloco. */
  target: number;
  rewardMode: RewardMode;
  rewardLabel: string;
  rewardAmount: number;
};

/** Venda agregada do espelho do VMSet (vendedor em caixa alta, loja numérica). */
export type SaleRow = { seller: string; store: number | null; brand: string | null; category: string | null; date?: string; quantity: number; amount: number };
export type SellerRef = { id: string; name: string; storeNumber: number | null };

export type Participant = {
  type: "seller" | "store";
  key: string;
  name: string;
  storeNumber: number | null;
  group: string | null;
  progress: number;
  /** Prêmios já conquistados (único/recorrente); no ranking, 1 para o líder após o fim. */
  prizes: number;
  /** % da meta (ou da marca do líder no ranking), 0–100. */
  percent: number;
};

export type GroupLeader = { name: string; stores: number[]; total: number; leader: Participant | null };

export type Standings = {
  total: number;
  sellers: Participant[];
  stores: Participant[];
  groups: GroupLeader[];
  prizes: number;
  rewardTotal: number;
};

export type AchievementCandidate = { participantType: "seller" | "store"; participantKey: string; participantName: string; tier: number; progress: number; headline: string };

/** Teto de prêmios por participante (evita milhares de linhas com meta mal configurada). */
const MAX_TIERS = 500;

export const norm = (value: string | null | undefined) => (value ?? "").trim().toLocaleUpperCase("pt-BR");
const round2 = (value: number) => Math.round(value * 100) / 100;

export function matchesRule(rule: Pick<CampaignRule, "brand" | "category" | "stores" | "startDate" | "endDate">, row: SaleRow) {
  if (rule.brand && norm(row.brand) !== norm(rule.brand)) return false;
  if (rule.category && norm(row.category) !== norm(rule.category)) return false;
  if (rule.stores.length && (row.store === null || !rule.stores.includes(row.store))) return false;
  if (row.date && (row.date < rule.startDate || row.date > rule.endDate)) return false;
  return true;
}

/** Quantos prêmios o progresso rende: único (bateu a meta) ou recorrente (a cada bloco). Ranking é apurado à parte. */
export function prizeCount(progress: number, target: number, mode: RewardMode) {
  if (mode === "RANKING" || !(target > 0)) return 0;
  // Tolerância para centavos de arredondamento (ex.: 2999,999 em R$ 3.000).
  const blocks = Math.floor((progress + 1e-6) / target);
  if (mode === "UNICO") return blocks >= 1 ? 1 : 0;
  return Math.min(Math.max(blocks, 0), MAX_TIERS);
}

const groupOf = (rule: CampaignRule, store: number | null) => (store === null ? null : rule.groups.find((group) => group.stores.includes(store))?.name ?? null);

/** Progresso por vendedor e por loja, prêmios e líder de cada grupo. `today` decide o fim do ranking. */
export function computeStandings(rule: CampaignRule, rows: SaleRow[], sellerRefs: Map<string, SellerRef>, today: string): Standings {
  const value = (row: SaleRow) => (rule.metric === "QUANTIDADE" ? row.quantity : row.amount);
  const bySeller = new Map<string, { progress: number; storeValues: Map<number | null, number> }>();
  const byStore = new Map<number | null, number>();
  let total = 0;
  for (const row of rows) {
    if (!matchesRule(rule, row)) continue;
    const amount = value(row) || 0;
    total += amount;
    const sellerKey = norm(row.seller);
    if (sellerKey) {
      const entry = bySeller.get(sellerKey) ?? { progress: 0, storeValues: new Map() };
      entry.progress += amount;
      entry.storeValues.set(row.store, (entry.storeValues.get(row.store) ?? 0) + amount);
      bySeller.set(sellerKey, entry);
    }
    byStore.set(row.store, (byStore.get(row.store) ?? 0) + amount);
  }
  const ended = today > rule.endDate;
  const individualMode = rule.audience === "INDIVIDUAL";

  const sellers: Participant[] = [...bySeller.entries()].map(([upper, entry]) => {
    const ref = sellerRefs.get(upper);
    // Loja do vendedor na campanha: onde mais vendeu dentro do filtro.
    const store = [...entry.storeValues.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ref?.storeNumber ?? null;
    const progress = round2(entry.progress);
    return { type: "seller", key: ref?.id ?? `nome:${upper}`, name: ref?.name ?? upper, storeNumber: store, group: groupOf(rule, store), progress, prizes: individualMode ? prizeCount(progress, rule.target, rule.rewardMode) : 0, percent: 0 };
  });
  const storeAudience = rule.audience !== "INDIVIDUAL";
  const stores: Participant[] = [...byStore.entries()].map(([store, sum]) => {
    const progress = round2(sum);
    const inScope = rule.audience !== "GRUPO" || groupOf(rule, store) !== null;
    return { type: "store", key: store === null ? "loja:sem" : `loja:${store}`, name: store === null ? "Sem loja" : `Loja ${store}`, storeNumber: store, group: groupOf(rule, store), progress, prizes: storeAudience && inScope && store !== null ? prizeCount(progress, rule.target, rule.rewardMode) : 0, percent: 0 };
  });
  const sort = (list: Participant[]) => list.sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name, "pt-BR"));
  sort(sellers);
  sort(stores);

  // Grupos: no GRUPO são os definidos; senão, um grupo único com todos (líder geral).
  const partitions: CampaignGroup[] = rule.audience === "GRUPO" ? rule.groups : [{ name: rule.audience === "LOJA" ? "Todas as lojas" : "Todos os vendedores", stores: [] }];
  const level = rule.audience === "INDIVIDUAL" ? sellers : stores.filter((store) => store.storeNumber !== null);
  const groups: GroupLeader[] = partitions.map((partition) => {
    const members = rule.audience === "GRUPO" ? level.filter((item) => item.storeNumber !== null && partition.stores.includes(item.storeNumber)) : level;
    const leader = members.find((item) => item.progress > 0) ?? null;
    return { name: partition.name, stores: partition.stores, total: round2(members.reduce((sum, item) => sum + item.progress, 0)), leader };
  });
  if (rule.rewardMode === "RANKING" && ended) for (const group of groups) if (group.leader) group.leader.prizes = 1;

  // Barras: % da meta; no ranking (ou sem meta), relativo ao líder.
  const fill = (list: Participant[]) => {
    const top = list[0]?.progress ?? 0;
    const base = rule.rewardMode !== "RANKING" && rule.target > 0 ? rule.target : top;
    for (const item of list) item.percent = base > 0 ? Math.min(100, Math.round((item.progress / base) * 100)) : 0;
  };
  fill(sellers);
  fill(stores);

  const prizes = (individualMode ? sellers : stores).reduce((sum, item) => sum + item.prizes, 0);
  return { total: round2(total), sellers, stores, groups, prizes, rewardTotal: round2(prizes * rule.rewardAmount) };
}

const CATEGORY_PLURAL: Record<string, string> = { ARMACAO: "armações", "OCULOS SOLAR": "óculos solares", LENTES: "lentes", "LENTES DE CONTATO": "lentes de contato", ACESSORIOS: "acessórios", SERVICOS: "serviços" };

const titleCase = (value: string) => value.toLocaleLowerCase("pt-BR").replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toLocaleUpperCase("pt-BR"));

/** "armações Stepper", "itens Ray Ban", "lentes", "vendas". */
export function scopeLabel(rule: Pick<CampaignRule, "brand" | "category">) {
  const what = rule.category ? CATEGORY_PLURAL[norm(rule.category)] ?? titleCase(rule.category).toLocaleLowerCase("pt-BR") : rule.brand ? "itens" : "";
  return [what, rule.brand ? titleCase(rule.brand) : ""].filter(Boolean).join(" ") || "itens";
}

export const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ");
const fmtUnits = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** "3 armações Stepper vendidas" / "R$ 5.000,00 vendidos em Stepper". */
export function resultLabel(rule: Pick<CampaignRule, "metric" | "brand" | "category">, amount: number) {
  if (rule.metric === "QUANTIDADE") {
    const scope = scopeLabel(rule);
    const feminine = /^(armações|lentes)/.test(scope);
    return `${fmtUnits(amount)} ${scope} ${feminine ? "vendidas" : "vendidos"}`;
  }
  const scope = rule.brand ? titleCase(rule.brand) : rule.category ? scopeLabel(rule) : "";
  return `${brl(amount)} vendidos${scope ? ` em ${scope}` : ""}`;
}

/** Regra em uma frase: "A cada 3 armações Stepper = R$ 100,00 em Voucher iFood". */
export function ruleSummary(rule: CampaignRule) {
  const reward = rule.rewardAmount > 0 ? `${brl(rule.rewardAmount)}${rule.rewardLabel ? ` em ${rule.rewardLabel}` : ""}` : rule.rewardLabel || "prêmio";
  const goal = rule.metric === "QUANTIDADE" ? `${fmtUnits(rule.target)} ${scopeLabel(rule)}` : `${brl(rule.target)}${rule.brand || rule.category ? ` em ${scopeLabel(rule)}` : ""}`;
  const who = rule.audience === "INDIVIDUAL" ? "vendedor" : "loja";
  if (rule.rewardMode === "RANKING") {
    const where = rule.audience === "GRUPO" ? "de cada grupo de lojas" : rule.audience === "LOJA" ? "entre as lojas" : "entre os vendedores";
    return `Maior ${rule.metric === "QUANTIDADE" ? "volume" : "faturamento"} ${where} (${scopeLabel(rule)}) = ${reward}`;
  }
  if (rule.rewardMode === "RECORRENTE") return `A cada ${goal} por ${who} = ${reward}`;
  return `Bater ${goal} por ${who} = ${reward}`;
}

/** Conquistas que o progresso atual garante (cada bloco é um tier; ranking só após o fim do período). */
export function achievementCandidates(rule: CampaignRule, standings: Standings): AchievementCandidate[] {
  const out: AchievementCandidate[] = [];
  if (rule.rewardMode === "RANKING") {
    for (const group of standings.groups) {
      const leader = group.leader;
      if (!leader || leader.prizes < 1) continue;
      const where = rule.audience === "GRUPO" ? ` no ${group.name}` : "";
      out.push({ participantType: leader.type, participantKey: leader.key, participantName: leader.name, tier: 1, progress: leader.progress, headline: `1º lugar${where} com ${resultLabel(rule, leader.progress)}` });
    }
    return out;
  }
  const list = rule.audience === "INDIVIDUAL" ? standings.sellers : standings.stores;
  for (const item of list) {
    for (let tier = 1; tier <= item.prizes; tier += 1) {
      const reached = rule.rewardMode === "RECORRENTE" ? rule.target * tier : rule.target;
      out.push({ participantType: item.type, participantKey: item.key, participantName: item.name, tier, progress: item.progress, headline: resultLabel(rule, reached) });
    }
  }
  return out;
}

export const achievementKey = (item: { participantKey: string; tier: number }) => `${item.participantKey}#${item.tier}`;

/** Só o que ainda não foi registrado (idempotente: rodar de novo não gera conquista nem comemoração repetida). */
export function newAchievements(candidates: AchievementCandidate[], existing: Iterable<string>) {
  const seen = new Set(existing);
  return candidates.filter((item) => {
    const key = achievementKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "1, 2, 18" → [1, 2, 18] */
export function parseStoreList(value: string) {
  return [...new Set(value.split(/[^\d]+/).filter(Boolean).map(Number).filter((number) => Number.isInteger(number) && number > 0 && number < 100_000))].sort((a, b) => a - b);
}

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const amount = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1_000_000_000 ? round2(value) : null);

/** Valida o corpo do formulário de campanha; devolve o erro em português. */
export function parseCampaignInput(body: unknown): { error: string } | { value: CampaignRule & { description: string | null; active: boolean } } {
  const input = (body ?? {}) as Record<string, unknown>;
  const name = text(input.name, 120);
  if (!name) return { error: "Dê um nome para a campanha." };
  const metric = METRICS.find((item) => item === input.metric);
  const audience = AUDIENCES.find((item) => item === input.audience);
  const rewardMode = REWARD_MODES.find((item) => item === input.rewardMode);
  if (!metric || !audience || !rewardMode) return { error: "Escolha a métrica, o público e a regra do prêmio." };
  if (!isDate(input.startDate) || !isDate(input.endDate) || input.startDate > input.endDate) return { error: "Período inválido: a data final precisa ser igual ou depois da inicial." };
  const target = amount(input.target);
  if (target === null || (rewardMode !== "RANKING" && target <= 0)) return { error: rewardMode === "RECORRENTE" ? "Informe a cada quanto o prêmio é liberado." : "Informe a meta." };
  const rewardAmount = amount(input.rewardAmount);
  if (rewardAmount === null) return { error: "Valor do prêmio inválido." };
  const groups = (Array.isArray(input.groups) ? input.groups : [])
    .map((group, index) => {
      const raw = (group ?? {}) as Record<string, unknown>;
      const stores = Array.isArray(raw.stores) ? parseStoreList(raw.stores.join(",")) : typeof raw.stores === "string" ? parseStoreList(raw.stores) : [];
      return { name: text(raw.name, 60) || `Grupo ${index + 1}`, stores };
    })
    .filter((group) => group.stores.length > 0)
    .slice(0, 50);
  if (audience === "GRUPO" && !groups.length) return { error: "Monte pelo menos um grupo com as lojas." };
  const stores = Array.isArray(input.stores) ? parseStoreList(input.stores.join(",")) : typeof input.stores === "string" ? parseStoreList(input.stores) : [];
  return {
    value: {
      name,
      description: text(input.description, 500) || null,
      metric,
      brand: norm(text(input.brand, 120)) || null,
      category: norm(text(input.category, 120)) || null,
      stores: audience === "GRUPO" ? [...new Set(groups.flatMap((group) => group.stores))].sort((a, b) => a - b) : stores,
      startDate: input.startDate,
      endDate: input.endDate,
      audience,
      groups: audience === "GRUPO" ? groups : [],
      target,
      rewardMode,
      rewardLabel: text(input.rewardLabel, 80),
      rewardAmount,
      active: input.active !== false,
    },
  };
}
