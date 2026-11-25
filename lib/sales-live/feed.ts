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
export function buildOrders(items: SaleItem[], day: string, input: { storeLabel: (store: string) => string; fromCrm?: (key: string) => boolean; conversationOf?: (key: string) => string | null } = { storeLabel: (store) => `Loja ${store}` }): LiveOrder[] {
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
      lines: sorted.map((item) => ({ label: brandLabel(item), description: item.description ? titleCase(item.description.trim()) : null, kind: categoryKind(item.category, item.description), quantity: Math.max(1, Math.round(item.quantity || 1)), amount: money2(Number.isFinite(item.amount) ? item.amount : 0) })),
      kinds: [...new Set(sorted.map((item) => categoryKind(item.category, item.description)))],
      customer: shortName(first.customer),
      conversationId: input.conversationOf?.(key) ?? null,
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
