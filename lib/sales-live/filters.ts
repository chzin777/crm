/**
 * Filtros do /vendas/ao-vivo: seletor de lojas (busca por número ou nome da unidade, seleção múltipla) e a busca
 * global do feed (vendedor, cliente, produto/marca, número do pedido). Puro: usado pela tela e pelos testes.
 */
import type { LiveOrder } from "@/lib/sales-live/feed";

export type StoreOption = { store: string; storeLabel: string; search?: string; amount: number; orders: number };

/** Minúsculas e sem acento ("Goiânia" -> "goiania"). */
export const normalizeSearch = (value: string | null | undefined) =>
  (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Loja pelo número ("18", "018": código exato ou começo) ou por qualquer palavra do nome/bairro/cidade ("marista"). */
export function matchStore(option: Pick<StoreOption, "store" | "storeLabel" | "search">, term: string): boolean {
  const text = normalizeSearch(term).replace(/^(loja|lj)\s*/, "");
  if (!text) return true;
  if (/^\d+$/.test(text)) {
    const code = option.store.replace(/^0+(?=\d)/, "");
    return code.startsWith(text.replace(/^0+(?=\d)/, ""));
  }
  const haystack = normalizeSearch(`${option.storeLabel} ${option.search ?? ""}`);
  return text.split(" ").every((word) => haystack.includes(word));
}

export type StoreSort = "revenue" | "number";

/** Lojas filtradas pela busca, por faturamento (maior primeiro) ou pelo número. */
export function filterStores(options: StoreOption[], term: string, sort: StoreSort = "revenue"): StoreOption[] {
  const list = options.filter((option) => matchStore(option, term));
  return sort === "number"
    ? list.sort((a, b) => Number(a.store) - Number(b.store) || a.store.localeCompare(b.store))
    : list.sort((a, b) => b.amount - a.amount || b.orders - a.orders || Number(a.store) - Number(b.store));
}

/** As N lojas com mais faturamento no período (atalho "Top 5"). */
export const topStores = (options: StoreOption[], count = 5) =>
  filterStores(options, "", "revenue").filter((option) => option.orders > 0).slice(0, count).map((option) => option.store);

/** Texto do botão do seletor: "Todas as lojas (24)", "Loja 18 · Setor Bueno" ou "3 lojas selecionadas". */
export function storeSelectionLabel(options: Pick<StoreOption, "store" | "storeLabel">[], selected: string[]): string {
  if (!selected.length) return `Todas as lojas (${options.length})`;
  if (selected.length === 1) return options.find((option) => option.store === selected[0])?.storeLabel ?? `Loja ${selected[0]}`;
  return `${selected.length} lojas selecionadas`;
}

/** Pedidos das lojas escolhidas (nenhuma escolhida = todas). */
export function ordersInStores(orders: LiveOrder[], selected: string[]): LiveOrder[] {
  if (!selected.length) return orders;
  const keys = new Set(selected);
  return orders.filter((order) => keys.has(order.store));
}

/**
 * Busca global do feed: todas as palavras precisam aparecer em vendedor, cliente, produtos/marcas (resumo e itens),
 * número do pedido, loja ou pagamento. Número sozinho também acha o pedido pelo começo ("5154" -> 51547).
 */
export function matchOrder(order: LiveOrder, query: string): boolean {
  const text = normalizeSearch(query);
  if (!text) return true;
  if (/^\d+$/.test(text) && order.order.replace(/^0+(?=\d)/, "").startsWith(text.replace(/^0+(?=\d)/, ""))) return true;
  const haystack = normalizeSearch([
    order.seller, order.customer, order.summary, order.order, order.storeLabel, order.payment,
    ...(order.lines ?? []).flatMap((line) => [line.label, line.description]),
  ].filter(Boolean).join(" "));
  return text.split(" ").every((word) => haystack.includes(word));
}

export const searchOrders = (orders: LiveOrder[], query: string) => (normalizeSearch(query) ? orders.filter((order) => matchOrder(order, query)) : orders);
