/**
 * Vendas ao vivo (puro, sem banco): itens de venda do dia vindos do VMSet viram pedidos, com deduplicação por
 * loja + pedido, agregados do dia (faturamento, pedidos, ticket médio, ranking de lojas) e formatação para o feed.
 */

export type SaleItem = {
  id: string;
  store: string | null;
  order: string | null;
  invoice?: string | null;
  time: string | null;
  seller: string | null;
  customer?: string | null;
  cpf?: string | null;
  phone?: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
  quantity: number;
  amount: number;
  payment?: string | null;
  terms?: string | null;
};

export type LiveOrder = {
  /** Loja + número do pedido: identidade estável (o mesmo pedido nunca entra duas vezes no feed). */
  key: string;
  store: string;
  storeLabel: string;
  order: string;
  /** Instante da venda (ISO, horário de Brasília convertido). */
  at: string;
  time: string;
  amount: number;
  items: number;
  /** "Ray-Ban, Zeiss + 1" */
  summary: string;
  seller: string | null;
  payment: string | null;
  /** Cliente atendido pelo CRM / WhatsApp nos últimos 30 dias (match por telefone ou CPF). */
  fromCrm: boolean;
  /** Assinatura do conteúdo: muda quando entra item novo no mesmo pedido (atualiza o card, não duplica). */
  version: string;
};

export type StoreRank = { store: string; storeLabel: string; amount: number; orders: number };
export type LiveKpis = { revenue: number; orders: number; ticket: number; topStores: StoreRank[] };
export type LiveSnapshot = { day: string; updatedAt: string; seq: number; orders: LiveOrder[]; kpis: LiveKpis; stores: { store: string; storeLabel: string }[] };
/** Mensagens do canal ao vivo: retrato inteiro (conexão, virada do dia, cancelamento) ou só os pedidos novos/alterados. */
export type LiveEvent = { type: "snapshot"; snapshot: LiveSnapshot } | { type: "orders"; orders: LiveOrder[]; kpis: LiveKpis; seq: number; updatedAt: string; stores: LiveSnapshot["stores"] };

const BRAND_WORDS: Record<string, string> = { "RAY BAN": "Ray-Ban", RAYBAN: "Ray-Ban", "MIU MIU": "Miu Miu", MIUMIU: "Miu Miu", ZEISS: "Zeiss", "D&G": "D&G", "DOLCE & GABBANA": "Dolce & Gabbana" };

const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`);

/** Marca legível para o resumo ("RAY BAN" → "Ray-Ban"); sem marca, a categoria ("LENTES" → "Lentes"). */
export function brandLabel(item: Pick<SaleItem, "brand" | "category">) {
  const brand = (item.brand ?? "").trim().toUpperCase();
  if (brand && BRAND_WORDS[brand]) return BRAND_WORDS[brand];
  if (brand && !/^(SEM MARCA|DIVERSOS|GENERICO|GENERICA|NULL)$/.test(brand)) return titleCase(brand);
  return item.category ? titleCase(item.category.trim()) : "Item";
}

/** "Ray-Ban, Zeiss + 2": até duas marcas distintas e o restante contado. */
export function itemsSummary(items: Pick<SaleItem, "brand" | "category">[]) {
  const labels = [...new Set(items.map(brandLabel))];
  const shown = labels.slice(0, 2).join(", ");
  return labels.length > 2 ? `${shown} + ${labels.length - 2}` : shown;
}

/** "JESSICA DOS SANTOS MELO" → "Jessica Melo" (primeiro e último nome, cabe no card do celular). */
export function shortName(value: string | null | undefined) {
  const words = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return titleCase(words.length > 1 ? `${words[0]} ${words[words.length - 1]}` : words[0]);
}

const money2 = (value: number) => Math.round(value * 100) / 100;

/** "14:32:10" de hoje em Brasília → ISO UTC. */
export function saleInstant(day: string, time: string | null) {
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((time ?? "").trim());
  const hh = clock ? clock[1].padStart(2, "0") : "00";
  return new Date(`${day}T${hh}:${clock?.[2] ?? "00"}:${clock?.[3] ?? "00"}-03:00`).toISOString();
}

/**
 * Itens do dia → pedidos (loja + número), ordenados do mais recente para o mais antigo. Itens repetidos (mesmo id,
 * ao reconectar ou reprocessar) contam uma vez só.
 */
export function buildOrders(items: SaleItem[], day: string, input: { storeLabel: (store: string) => string; fromCrm?: (key: string) => boolean } = { storeLabel: (store) => `Loja ${store}` }): LiveOrder[] {
  const unique = new Map<string, SaleItem>();
  for (const item of items) if (item.id && !unique.has(item.id)) unique.set(item.id, item);
  const groups = new Map<string, SaleItem[]>();
  for (const item of unique.values()) {
    if (!item.store || !item.order) continue;
    const key = `${item.store}-${item.order}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const orders: LiveOrder[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id));
    const first = sorted[0];
    const amount = money2(sorted.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0));
    const time = (first.time ?? "").slice(0, 5) || "--:--";
    orders.push({
      key,
      store: first.store!,
      storeLabel: input.storeLabel(first.store!),
      order: first.order!,
      at: saleInstant(day, first.time),
      time,
      amount,
      items: sorted.reduce((sum, item) => sum + Math.max(1, Math.round(item.quantity || 1)), 0),
      summary: itemsSummary(sorted),
      seller: shortName(first.seller),
      payment: first.payment ? titleCase(first.payment.trim()) : null,
      fromCrm: input.fromCrm?.(key) ?? false,
      version: `${sorted.map((item) => item.id).join(",")}:${amount}`,
    });
  }
  return orders.sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));
}

/** Faturamento, pedidos, ticket médio e as 5 lojas que mais faturaram no dia. */
export function dayKpis(orders: LiveOrder[]): LiveKpis {
  const revenue = money2(orders.reduce((sum, order) => sum + order.amount, 0));
  const byStore = new Map<string, StoreRank>();
  for (const order of orders) {
    const rank = byStore.get(order.store) ?? { store: order.store, storeLabel: order.storeLabel, amount: 0, orders: 0 };
    rank.amount = money2(rank.amount + order.amount);
    rank.orders += 1;
    byStore.set(order.store, rank);
  }
  return {
    revenue,
    orders: orders.length,
    ticket: orders.length ? money2(revenue / orders.length) : 0,
    topStores: [...byStore.values()].sort((a, b) => b.amount - a.amount || b.orders - a.orders).slice(0, 5),
  };
}

/**
 * Mescla uma atualização no feed do navegador: entra quem é novo, atualiza quem mudou (mesma chave), nunca duplica.
 * Devolve também as chaves realmente novas (para o destaque "NOVA VENDA" e o alerta).
 */
export function mergeOrders(current: LiveOrder[], incoming: LiveOrder[]) {
  const byKey = new Map(current.map((order) => [order.key, order]));
  const fresh: string[] = [];
  for (const order of incoming) {
    if (!byKey.has(order.key)) fresh.push(order.key);
    byKey.set(order.key, order);
  }
  const orders = [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));
  return { orders, fresh };
}

/** Pedidos novos ou alterados entre dois retratos (o que vai pelo canal ao vivo). */
export function changedOrders(previous: LiveOrder[], next: LiveOrder[]) {
  const before = new Map(previous.map((order) => [order.key, order.version]));
  return next.filter((order) => before.get(order.key) !== order.version);
}

/** "há 12 seg · 14:32", "há 3 min · 14:20", "há 2 h · 12:05". */
export function relativeTime(at: string, now: Date, time: string) {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 1000));
  const ago = seconds < 60 ? `há ${seconds} seg` : seconds < 3600 ? `há ${Math.floor(seconds / 60)} min` : `há ${Math.floor(seconds / 3600)} h`;
  return `${ago} · ${time}`;
}

export const formatMoney = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Chave de telefone para cruzar VMSet x CRM: DDD + 8 últimos dígitos (com ou sem 55 e nono dígito). */
export function phoneKey(value: string | null | undefined) {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.length >= 10 ? `${digits.slice(0, 2)}${digits.slice(-8)}` : null;
}
