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
  /** Dia da emissão (AAAA-MM-DD, Brasília): obrigatório nos períodos de vários dias. */
  date?: string | null;
  /** Total líquido oficial do pedido no VMSet (PDSD_VLR_TOTAL), repetido em cada item: vale mais que a soma dos itens. */
  orderTotal?: number | null;
};

/** Sol, grau (armação + lentes oftálmicas), lentes de contato ou outros (serviço, acessório). */
export type CategoryKind = "sol" | "grau" | "lentes" | "outros";
export type OrderLine = { label: string; description: string | null; kind: CategoryKind; quantity: number; amount: number };

export type LiveOrder = {
  /** Loja + número do pedido: identidade estável (o mesmo pedido nunca entra duas vezes no feed). */
  key: string;
  store: string;
  storeLabel: string;
  order: string;
  /** Instante da venda (ISO, horário de Brasília convertido). */
  at: string;
  /** Dia da venda em Brasília (AAAA-MM-DD). Opcional: retratos antigos não trazem. */
  day?: string;
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
  /** Itens do pedido (gaveta de detalhes). Opcional: retratos antigos não trazem. */
  lines?: OrderLine[];
  /** Categorias presentes no pedido (tags do card). */
  kinds?: CategoryKind[];
  /** Cliente (primeiro e último nome). */
  customer?: string | null;
  /** Conversa do cliente no /chat quando houve match no CRM. */
  conversationId?: string | null;
};

export type StoreRank = { store: string; storeLabel: string; amount: number; orders: number };
/** revenue = vendas − devoluções (líquido do relatório do VMSET); returns = total devolvido abatido. */
export type LiveKpis = { revenue: number; orders: number; ticket: number; topStores: StoreRank[]; returns: number };
/** Devolução de cliente no dia em que aconteceu (abate o faturamento da loja). */
export type StoreReturn = { store: string; order: string | null; day: string; amount: number };
export type LiveSnapshot = { day: string; updatedAt: string; seq: number; orders: LiveOrder[]; returns: StoreReturn[]; kpis: LiveKpis; stores: { store: string; storeLabel: string; search?: string }[]; from?: string; to?: string };
/** Mensagens do canal ao vivo: retrato inteiro (conexão, virada do dia, cancelamento) ou só os pedidos novos/alterados. */
export type LiveEvent = { type: "snapshot"; snapshot: LiveSnapshot } | { type: "orders"; orders: LiveOrder[]; returns: StoreReturn[]; kpis: LiveKpis; seq: number; updatedAt: string; stores: LiveSnapshot["stores"] };

/**
 * Lojas encerradas: nunca entram no seletor, no ranking nem nos totais de /vendas/ao-vivo. A 502 fechou, mas ainda
 * registra recebimento de carnê no VMSet (baixa financeira, não é venda).
 */
export const CLOSED_STORES: readonly string[] = ["502"];
export const isClosedStore = (store: string) => CLOSED_STORES.includes(String(Number(store)) === "NaN" ? store.trim() : String(Number(store)));

/** Devoluções da API do VMSet (valor positivo, dia AAAA-MM-DD); linhas inválidas e lojas encerradas ficam de fora. */
export function parseReturns(raw: unknown, fallbackDay: string): StoreReturn[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const item = (entry ?? {}) as { store?: unknown; order?: unknown; date?: unknown; amount?: unknown };
    const amount = typeof item.amount === "number" && Number.isFinite(item.amount) ? money2(item.amount) : 0;
    if (!item.store || amount <= 0 || isClosedStore(String(item.store))) return [];
    const day = typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : fallbackDay;
    return [{ store: String(item.store), order: item.order ? String(item.order) : null, day, amount }];
  });
}

/** Total devolvido por loja. */
export function returnsByStore(returns: StoreReturn[]) {
  const byStore = new Map<string, number>();
  for (const item of returns) byStore.set(item.store, money2((byStore.get(item.store) ?? 0) + item.amount));
  return byStore;
}

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
export function buildOrders(items: SaleItem[], day: string, input: { storeLabel: (store: string) => string; fromCrm?: (key: string) => boolean; conversationOf?: (key: string) => string | null } = { storeLabel: (store) => `Loja ${store}` }): LiveOrder[] {
  const unique = new Map<string, SaleItem>();
  for (const item of items) if (item.id && !unique.has(item.id)) unique.set(item.id, item);
  const groups = new Map<string, SaleItem[]>();
  for (const item of unique.values()) {
    if (!item.store || !item.order || isClosedStore(item.store)) continue;
    const key = `${item.store}-${item.order}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const orders: LiveOrder[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id));
    const first = sorted[0];
    // Total oficial do pedido (líquido, com descontos) quando o VMSet manda; senão a soma dos itens (cada item uma vez).
    const official = sorted.find((item) => typeof item.orderTotal === "number" && Number.isFinite(item.orderTotal))?.orderTotal;
    const amount = official != null ? money2(official) : money2(sorted.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0));
    const time = (first.time ?? "").slice(0, 5) || "--:--";
    const saleDay = first.date && /^\d{4}-\d{2}-\d{2}$/.test(first.date) ? first.date : day;
    orders.push({
      key,
      store: first.store!,
      storeLabel: input.storeLabel(first.store!),
      order: first.order!,
      at: saleInstant(saleDay, first.time),
      day: saleDay,
      time,
      amount,
      items: sorted.reduce((sum, item) => sum + Math.max(1, Math.round(item.quantity || 1)), 0),
      summary: itemsSummary(sorted),
      seller: shortName(first.seller),
      payment: first.payment ? titleCase(first.payment.trim()) : null,
      fromCrm: input.fromCrm?.(key) ?? false,
      version: `${sorted.map((item) => item.id).join(",")}:${amount}`,
      lines: sorted.map((item) => ({ label: brandLabel(item), description: item.description ? titleCase(item.description.trim()) : null, kind: categoryKind(item.category, item.description), quantity: Math.max(1, Math.round(item.quantity || 1)), amount: money2(Number.isFinite(item.amount) ? item.amount : 0) })),
      kinds: [...new Set(sorted.map((item) => categoryKind(item.category, item.description)))],
      customer: shortName(first.customer),
      conversationId: input.conversationOf?.(key) ?? null,
    });
  }
  return orders.sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));
}

/**
 * Faturamento líquido (vendas − devoluções, como o relatório do VMSET), pedidos, ticket médio (das vendas) e as
 * 5 lojas que mais faturaram. Mesma conta para Hoje, Esta semana, Este mês e Personalizado.
 */
export function dayKpis(orders: LiveOrder[], returns: StoreReturn[] = []): LiveKpis {
  const sales = money2(orders.reduce((sum, order) => sum + order.amount, 0));
  const returned = money2(returns.reduce((sum, item) => sum + item.amount, 0));
  const byStore = new Map<string, StoreRank>();
  for (const order of orders) {
    const rank = byStore.get(order.store) ?? { store: order.store, storeLabel: order.storeLabel, amount: 0, orders: 0 };
    rank.amount = money2(rank.amount + order.amount);
    rank.orders += 1;
    byStore.set(order.store, rank);
  }
  for (const [store, amount] of returnsByStore(returns)) {
    const rank = byStore.get(store);
    if (rank) rank.amount = money2(rank.amount - amount);
  }
  return {
    revenue: money2(sales - returned),
    orders: orders.length,
    ticket: orders.length ? money2(sales / orders.length) : 0,
    topStores: [...byStore.values()].sort((a, b) => b.amount - a.amount || b.orders - a.orders).slice(0, 5),
    returns: returned,
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

const plain = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Categoria do VMSet → Sol / Grau / Lentes de contato / Outros ("LENTES" oftálmicas contam como grau). */
export function categoryKind(category: string | null | undefined, description?: string | null): CategoryKind {
  const text = `${plain(category)} ${plain(description)}`;
  if (/CONTATO/.test(text)) return "lentes";
  if (/SOLAR|\bSOL\b|OCULOS DE SOL/.test(plain(category)) || (!category && /\bSOLAR|\bSOL\b/.test(text))) return "sol";
  if (/ARMAC|GRAU|LENTE|MULTIFOCAL|VISAO SIMPLES|OFTALM|BIFOCAL|PROGRESSIV/.test(text)) return "grau";
  return "outros";
}

export const KIND_LABEL: Record<CategoryKind, string> = { sol: "Sol", grau: "Grau", lentes: "Lentes de contato", outros: "Outros" };

/** "VISA PARCELADO" → "Cartão de crédito"; PIX, débito, dinheiro, crediário. */
export function paymentGroup(payment: string | null | undefined) {
  const text = plain(payment);
  if (!text.trim()) return "Não informado";
  if (/PIX/.test(text)) return "Pix";
  if (/DEBITO/.test(text)) return "Débito";
  if (/DINHEIRO|ESPECIE/.test(text)) return "Dinheiro";
  if (/CREDIARIO|CARNE|BOLETO|PROMISSORIA/.test(text)) return "Crediário";
  if (/CREDITO|VISA|MASTER|ELO|HIPER|AMEX|DINERS|CARTAO|PARCELADO/.test(text)) return "Cartão de crédito";
  return "Outros";
}

const orderHour = (order: Pick<LiveOrder, "time">) => {
  const hour = Number.parseInt(order.time.slice(0, 2), 10);
  return Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : null;
};

export type HourPoint = { hour: number; label: string; revenue: number; orders: number; cumulative: number };

/** Faturamento e pedidos por hora (mínimo 08h–21h, estende se houver venda fora da faixa ou a hora atual passar). */
export function hourlySeries(orders: Pick<LiveOrder, "time" | "amount">[], currentHour?: number): HourPoint[] {
  const hours = orders.map(orderHour).filter((hour): hour is number => hour !== null);
  const start = Math.min(8, ...hours);
  const end = Math.max(21, currentHour ?? 0, ...hours);
  const points: HourPoint[] = [];
  for (let hour = start; hour <= end; hour += 1) points.push({ hour, label: `${String(hour).padStart(2, "0")}h`, revenue: 0, orders: 0, cumulative: 0 });
  for (const order of orders) {
    const hour = orderHour(order);
    const point = hour === null ? undefined : points[hour - start];
    if (!point) continue;
    point.revenue = money2(point.revenue + order.amount);
    point.orders += 1;
  }
  let total = 0;
  for (const point of points) point.cumulative = total = money2(total + point.revenue);
  return points;
}

/** Faturamento e pedidos por dia de `from` a `to` (gráfico de ritmo dos períodos); `hour` = posição do dia. */
export function dailySeries(orders: Pick<LiveOrder, "day" | "at" | "amount">[], from: string, to: string): (HourPoint & { day: string })[] {
  const points: (HourPoint & { day: string })[] = [];
  for (let current = from, index = 0; current <= to && index < 400; current = shiftDay(current, 1), index += 1) {
    points.push({ hour: index, day: current, label: `${current.slice(8, 10)}/${current.slice(5, 7)}`, revenue: 0, orders: 0, cumulative: 0 });
  }
  const byDay = new Map(points.map((point) => [point.day, point]));
  for (const order of orders) {
    const point = byDay.get(order.day ?? dayOfInstant(order.at));
    if (!point) continue;
    point.revenue = money2(point.revenue + order.amount);
    point.orders += 1;
  }
  let total = 0;
  for (const point of points) point.cumulative = total = money2(total + point.revenue);
  return points;
}

/** Soma dias a um AAAA-MM-DD (calendário puro, sem fuso). */
export function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Dia em Brasília de um instante ISO (UTC−3 fixo, sem horário de verão desde 2019). */
export const dayOfInstant = (at: string) => new Date(new Date(at).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

export type PeriodPreset = "today" | "week" | "month" | "custom";
export const MAX_PERIOD_DAYS = 93;

/** Intervalo (inclusivo, dias de Brasília) de cada filtro: semana de segunda até hoje, mês do dia 1 até hoje. */
export function periodRange(preset: PeriodPreset, today: string, custom?: { from?: string; to?: string }): { from: string; to: string } {
  if (preset === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    return { from: shiftDay(today, -((weekday + 6) % 7)), to: today };
  }
  if (preset === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (preset === "custom" && custom?.from && custom?.to) return custom.from <= custom.to ? { from: custom.from, to: custom.to } : { from: custom.to, to: custom.from };
  return { from: today, to: today };
}

/** Período válido para consulta: datas reais, início ≤ fim e no máximo 93 dias. */
export function validPeriod(from: string | null | undefined, to: string | null | undefined) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !to || !iso.test(from) || !iso.test(to) || from > to) return false;
  if (Number.isNaN(new Date(`${from}T12:00:00Z`).getTime()) || Number.isNaN(new Date(`${to}T12:00:00Z`).getTime())) return false;
  if (shiftDay(from, 0) !== from || shiftDay(to, 0) !== to) return false;
  return (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000 < MAX_PERIOD_DAYS;
}

/** Hoje: "há 3 min · 14:20"; outros dias: "25/11 · 14:20". */
export function saleWhen(order: Pick<LiveOrder, "at" | "time" | "day">, now: Date, today: string) {
  const day = order.day ?? dayOfInstant(order.at);
  return day === today ? relativeTime(order.at, now, order.time) : `${day.slice(8, 10)}/${day.slice(5, 7)} · ${order.time}`;
}

/** Fatia `page` (1..n) da lista, com o total de páginas (página fora do intervalo cai na última válida). */
export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages, total: items.length };
}

export type SellerRank = { key: string; seller: string; storeLabel: string; amount: number; orders: number };

/** Vendedores do dia por faturamento (mesmo nome em lojas diferentes conta separado). */
export function topSellers(orders: LiveOrder[], limit = 5): SellerRank[] {
  const bySeller = new Map<string, SellerRank>();
  for (const order of orders) {
    if (!order.seller) continue;
    const key = `${order.store}|${order.seller}`;
    const rank = bySeller.get(key) ?? { key, seller: order.seller, storeLabel: order.storeLabel, amount: 0, orders: 0 };
    rank.amount = money2(rank.amount + order.amount);
    rank.orders += 1;
    bySeller.set(key, rank);
  }
  return [...bySeller.values()].sort((a, b) => b.amount - a.amount || b.orders - a.orders).slice(0, limit);
}

export type MixSlice = { key: string; label: string; amount: number; orders: number };

/** Faturamento por categoria (Sol / Grau / Lentes de contato / Outros), pelos itens de cada pedido. */
export function mixByKind(orders: LiveOrder[]): MixSlice[] {
  const slices = new Map<CategoryKind, MixSlice>();
  for (const order of orders) {
    const lines = order.lines?.length ? order.lines : [{ kind: "outros" as CategoryKind, amount: order.amount }];
    const seen = new Set<CategoryKind>();
    for (const line of lines) {
      const slice = slices.get(line.kind) ?? { key: line.kind, label: KIND_LABEL[line.kind], amount: 0, orders: 0 };
      slice.amount = money2(slice.amount + line.amount);
      if (!seen.has(line.kind)) slice.orders += 1;
      seen.add(line.kind);
      slices.set(line.kind, slice);
    }
  }
  return [...slices.values()].sort((a, b) => b.amount - a.amount);
}

/** Faturamento por meio de pagamento agrupado. */
export function mixByPayment(orders: LiveOrder[]): MixSlice[] {
  const slices = new Map<string, MixSlice>();
  for (const order of orders) {
    const label = paymentGroup(order.payment);
    const slice = slices.get(label) ?? { key: label, label, amount: 0, orders: 0 };
    slice.amount = money2(slice.amount + order.amount);
    slice.orders += 1;
    slices.set(label, slice);
  }
  return [...slices.values()].sort((a, b) => b.amount - a.amount);
}

/** Pedidos e faturamento de clientes atendidos pelo CRM / WhatsApp. */
export function crmShare(orders: LiveOrder[]) {
  const crm = orders.filter((order) => order.fromCrm);
  const revenue = money2(crm.reduce((sum, order) => sum + order.amount, 0));
  const total = orders.reduce((sum, order) => sum + order.amount, 0);
  return { orders: crm.length, revenue, ordersPct: orders.length ? (crm.length / orders.length) * 100 : 0, revenuePct: total ? (revenue / total) * 100 : 0 };
}

export const NEW_SALE_MS = 3 * 60_000;

/**
 * Selo "NOVA VENDA": só para venda dos últimos 3 minutos, ou que acabou de chegar pelo canal ao vivo (até 3 min
 * depois da chegada) e ainda é recente (até 10 min). Venda antiga que chega atrasada nunca ganha o selo.
 */
export function isNewSale(order: Pick<LiveOrder, "at">, now: Date | number, arrivedAt?: number | null) {
  const clock = typeof now === "number" ? now : now.getTime();
  const age = clock - new Date(order.at).getTime();
  if (!Number.isFinite(age)) return false;
  if (age < NEW_SALE_MS) return true;
  return arrivedAt != null && clock - arrivedAt < NEW_SALE_MS && age < 10 * 60_000;
}

/** Chave de telefone para cruzar VMSet x CRM: DDD + 8 últimos dígitos (com ou sem 55 e nono dígito). */
export function phoneKey(value: string | null | undefined) {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.length >= 10 ? `${digits.slice(0, 2)}${digits.slice(-8)}` : null;
}
