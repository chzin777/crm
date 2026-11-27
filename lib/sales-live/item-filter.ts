import { brandName, categoryName, type LiveOrder, type OrderLine, type StoreReturn } from "@/lib/sales-live/feed";

/**
 * Filtros de Produto, Marca e Categoria do /vendas/ao-vivo (puro). Com filtro ativo, cada pedido fica só com os
 * itens do recorte: o valor e as unidades são desses itens (nunca o pedido inteiro com itens de outra marca), e as
 * devoluções abatidas são só as dos itens do recorte.
 */
export type ItemFilter = { categories: string[]; brands: string[]; products: string[] };
export const EMPTY_ITEM_FILTER: ItemFilter = { categories: [], brands: [], products: [] };

const money2 = (value: number) => Math.round(value * 100) / 100;
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const hasItemFilter = (filter: ItemFilter) => filter.categories.length > 0 || filter.brands.length > 0 || filter.products.length > 0;

/** Atributos de filtro de uma linha (retratos antigos sem brand/category caem no rótulo/sem categoria). */
const lineBrand = (line: OrderLine) => line.brand ?? brandName(line.label);
const lineCategory = (line: OrderLine) => line.category ?? categoryName(null);
const lineProduct = (line: Pick<OrderLine, "description" | "label">) => line.description ?? line.label;

function matches(attrs: { brand: string; category: string; product: string }, filter: ItemFilter) {
  if (filter.categories.length && !filter.categories.includes(attrs.category)) return false;
  if (filter.brands.length && !filter.brands.includes(attrs.brand)) return false;
  if (filter.products.length && !filter.products.includes(attrs.product)) return false;
  return true;
}

export const lineMatches = (line: OrderLine, filter: ItemFilter) => matches({ brand: lineBrand(line), category: lineCategory(line), product: lineProduct(line) }, filter);

/** Pedidos do recorte: só os itens que batem; valor e unidades recalculados a partir deles. */
export function filterOrdersByItems(orders: LiveOrder[], filter: ItemFilter): LiveOrder[] {
  if (!hasItemFilter(filter)) return orders;
  return orders.flatMap((order) => {
    const lines = (order.lines ?? []).filter((line) => lineMatches(line, filter));
    if (!lines.length) return [];
    const labels = [...new Set(lines.map((line) => line.label))];
    return [{
      ...order,
      lines,
      amount: money2(lines.reduce((sum, line) => sum + line.amount, 0)),
      items: lines.reduce((sum, line) => sum + line.quantity, 0),
      kinds: [...new Set(lines.map((line) => line.kind))],
      summary: labels.length > 2 ? `${labels.slice(0, 2).join(", ")} + ${labels.length - 2}` : labels.join(", "),
    }];
  });
}

/** Devoluções do recorte (só as que vêm por item; devolução sem item não é atribuível a marca/produto). */
export function filterReturnsByItems(returns: StoreReturn[], filter: ItemFilter): StoreReturn[] {
  if (!hasItemFilter(filter)) return returns;
  return returns.filter((item) => (item.brand || item.category || item.description)
    && matches({ brand: item.brand ?? "Sem marca", category: item.category ?? "Sem categoria", product: item.description ?? item.brand ?? "" }, filter));
}

/** Unidades e R$ líquidos do recorte: vendidos − devolvidos. */
export function itemTotals(orders: LiveOrder[], returns: StoreReturn[]) {
  const soldUnits = orders.reduce((sum, order) => sum + (order.lines ?? []).reduce((acc, line) => acc + line.quantity, 0), 0);
  const soldAmount = orders.reduce((sum, order) => sum + order.amount, 0);
  const returnedUnits = returns.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  const returnedAmount = returns.reduce((sum, item) => sum + item.amount, 0);
  return { units: soldUnits - returnedUnits, amount: money2(soldAmount - returnedAmount), soldUnits, returnedUnits, returnedAmount: money2(returnedAmount) };
}

export type FilterOption = { value: string; units: number; amount: number };

/**
 * Opções dos seletores a partir das vendas do período (e das lojas escolhidas), já com unidades e R$ de cada uma.
 * Cada lista respeita os OUTROS filtros (ex.: marcas só da categoria escolhida), para a combinação nunca dar vazio.
 */
export function itemFilterOptions(orders: LiveOrder[], filter: ItemFilter) {
  const collect = (key: keyof ItemFilter, read: (line: OrderLine) => string) => {
    const others = { ...filter, [key]: [] };
    const byValue = new Map<string, FilterOption>();
    for (const order of orders) for (const line of order.lines ?? []) {
      if (!lineMatches(line, others)) continue;
      const value = read(line);
      const entry = byValue.get(value) ?? { value, units: 0, amount: 0 };
      entry.units += line.quantity;
      entry.amount = money2(entry.amount + line.amount);
      byValue.set(value, entry);
    }
    return [...byValue.values()].sort((a, b) => b.amount - a.amount || a.value.localeCompare(b.value));
  };
  return { categories: collect("categories", lineCategory), brands: collect("brands", lineBrand), products: collect("products", lineProduct) };
}

/** Busca instantânea nas opções (sem acento/caixa; vários termos = todos precisam aparecer). */
export function searchOptions(options: FilterOption[], term: string, limit = 80) {
  const words = fold(term).split(/\s+/).filter(Boolean);
  const found = words.length ? options.filter((option) => words.every((word) => fold(option.value).includes(word))) : options;
  return found.slice(0, limit);
}
