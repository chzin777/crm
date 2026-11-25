/** Metas de vendedores (puro, usado no servidor, na tela e nos testes). */

export type GoalSeller = {
  id: string;
  name: string;
  storeNumber: number | null;
  stores: number[];
  active: boolean;
  lastSaleAt: string | null;
  sales60d: number;
  /** Meta em R$. */
  goal: number;
  /** Meta em quantidade de vendas (pedidos). */
  goalQty: number;
  /** Realizado no mês (VMSet): R$ vendidos e quantidade de vendas. */
  soldAmount: number;
  soldQty: number;
};

/** Tipo de meta: valor (R$) ou quantidade de vendas/itens. */
export type GoalMetric = "VALOR" | "QUANTIDADE";

export type StoreGoal = {
  storeNumber: number | null;
  label: string;
  goal: number;
  goalQty: number;
  soldAmount: number;
  soldQty: number;
  sellers: number;
  /** Vendedores com meta (em valor ou em quantidade). */
  withGoal: number;
};

type StoreGoalInput = Pick<GoalSeller, "storeNumber" | "goal"> & Partial<Pick<GoalSeller, "goalQty" | "soldAmount" | "soldQty">>;

/** "2026-11" válido; qualquer outra coisa vira o mês atual em Brasília. */
export function goalMonthKey(value: string | null | undefined, now: Date = new Date()) {
  const match = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) return `${match[1]}-${match[2]}`;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

/** "2026-11" → "2026-12" (delta +1) ou "2026-10" (delta -1). */
export function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const label = new Date(Date.UTC(year, monthNumber - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);

/** "BETANIA ALMEIDA DA COSTA" → "Betania Almeida da Costa". */
export function sellerDisplayName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index > 0 && PARTICLES.has(word) ? word : word.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("pt-BR"))))
    .join(" ");
}

export const storeLabel = (storeNumber: number | null) => (storeNumber === null ? "Sem loja" : `Loja ${storeNumber}`);

/** Meta da loja = soma das metas dos vendedores da loja no mês; lojas em ordem numérica ("Sem loja" no fim). */
export function storeGoals(sellers: StoreGoalInput[]): StoreGoal[] {
  const byStore = new Map<number | null, StoreGoal>();
  const add = (a: number, b: number | undefined) => Math.round((a + (b ?? 0)) * 100) / 100;
  for (const seller of sellers) {
    const entry = byStore.get(seller.storeNumber) ?? { storeNumber: seller.storeNumber, label: storeLabel(seller.storeNumber), goal: 0, goalQty: 0, soldAmount: 0, soldQty: 0, sellers: 0, withGoal: 0 };
    entry.goal = add(entry.goal, seller.goal);
    entry.goalQty = add(entry.goalQty, seller.goalQty);
    entry.soldAmount = add(entry.soldAmount, seller.soldAmount);
    entry.soldQty = add(entry.soldQty, seller.soldQty);
    entry.sellers += 1;
    if (seller.goal > 0 || (seller.goalQty ?? 0) > 0) entry.withGoal += 1;
    byStore.set(seller.storeNumber, entry);
  }
  return [...byStore.values()].sort((a, b) => (a.storeNumber ?? Number.MAX_SAFE_INTEGER) - (b.storeNumber ?? Number.MAX_SAFE_INTEGER));
}

/** "1.500,50" / "1500.5" / "R$ 2.000" → número (vazio → 0). */
export function parseGoalAmount(value: string) {
  const clean = value.replace(/[^\d,.-]/g, "");
  if (!clean) return 0;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, "") : clean;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
}

/** Progresso de uma meta no tipo escolhido: alvo, realizado e % (0 sem meta). */
export function goalProgress(metric: GoalMetric, item: { goal: number; goalQty: number; soldAmount: number; soldQty: number }) {
  const target = metric === "QUANTIDADE" ? item.goalQty : item.goal;
  const done = metric === "QUANTIDADE" ? item.soldQty : item.soldAmount;
  return { target, done, percent: target > 0 ? Math.round((done / target) * 100) : 0 };
}

/** "R$ 1.234" (valor) ou "12 vendas" / "1 venda" (quantidade); `unit` troca a palavra (ex.: "un."). */
export function formatGoal(metric: GoalMetric, value: number, unit?: string) {
  if (metric === "VALOR") return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/ /g, " ");
  const count = value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return `${count} ${unit ?? (Math.round(value) === 1 ? "venda" : "vendas")}`;
}

/** Página (1-based) de uma lista: itens da página e contador "Mostrando X–Y de Z" (página fora do limite é ajustada). */
export function paginate<T>(items: T[], page: number, perPage: number) {
  const size = Math.max(1, Math.floor(perPage) || 1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return { items: slice, page: current, pages, perPage: size, total: items.length, from: items.length ? start + 1 : 0, to: start + slice.length };
}
