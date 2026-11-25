/** Metas de vendedores (puro, usado no servidor, na tela e nos testes). */

export type GoalSeller = {
  id: string;
  name: string;
  storeNumber: number | null;
  stores: number[];
  active: boolean;
  lastSaleAt: string | null;
  sales60d: number;
  goal: number;
};

export type StoreGoal = { storeNumber: number | null; label: string; goal: number; sellers: number; withGoal: number };

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
export function storeGoals(sellers: Pick<GoalSeller, "storeNumber" | "goal">[]): StoreGoal[] {
  const byStore = new Map<number | null, StoreGoal>();
  for (const seller of sellers) {
    const entry = byStore.get(seller.storeNumber) ?? { storeNumber: seller.storeNumber, label: storeLabel(seller.storeNumber), goal: 0, sellers: 0, withGoal: 0 };
    entry.goal = Math.round((entry.goal + seller.goal) * 100) / 100;
    entry.sellers += 1;
    if (seller.goal > 0) entry.withGoal += 1;
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
