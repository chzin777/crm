/**
 * Ranking único de Top Lojas e Top Vendedores (/vendas/ao-vivo): mesma ordenação, participação e barra de progresso
 * para os dois. Puro: usado pelo LeaderboardCard e pelos testes.
 */
import { normalizeSearch } from "@/lib/sales-live/filters";
import type { LiveOrder } from "@/lib/sales-live/feed";

export type LeaderSort = "amount" | "orders";
export type LeaderItem = { key: string; name: string; subtitle: string; amount: number; orders: number; search?: string };
export type LeaderRow = LeaderItem & { position: number; share: number; progress: number };

/** Ordena por faturamento ou por pedidos e calcula posição, % do total e barra proporcional ao líder (100%). */
export function rankLeaders(items: LeaderItem[], sort: LeaderSort = "amount"): LeaderRow[] {
  const metric = (item: LeaderItem) => (sort === "amount" ? item.amount : item.orders);
  const sorted = items
    .filter((item) => item.orders > 0)
    .sort((a, b) => metric(b) - metric(a) || (sort === "amount" ? b.orders - a.orders : b.amount - a.amount) || a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  const total = sorted.reduce((sum, item) => sum + metric(item), 0);
  const leader = sorted[0] ? metric(sorted[0]) : 0;
  return sorted.map((item, index) => ({
    ...item,
    position: index + 1,
    share: total ? (metric(item) / total) * 100 : 0,
    progress: leader ? Math.max(2, (metric(item) / leader) * 100) : 0,
  }));
}

/** Busca no ranking completo (nome, subtítulo e texto extra da loja), sem acento. */
export function searchLeaders(rows: LeaderRow[], term: string): LeaderRow[] {
  const text = normalizeSearch(term);
  if (!text) return rows;
  return rows.filter((row) => {
    const haystack = normalizeSearch(`${row.name} ${row.subtitle} ${row.search ?? ""}`);
    return text.split(" ").every((word) => haystack.includes(word));
  });
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Lojas do ranking: "14 pedidos · ticket R$ 920". */
export function storeLeaders(stores: { store: string; storeLabel: string; search?: string; amount: number; orders: number }[]): LeaderItem[] {
  return stores.map((store) => ({
    key: store.store,
    name: store.storeLabel,
    subtitle: `${plural(store.orders, "pedido", "pedidos")}${store.orders ? ` · ticket ${money(store.amount / store.orders)}` : ""}`,
    amount: store.amount,
    orders: store.orders,
    search: store.search,
  }));
}

/** Chave do vendedor no ranking e no filtro do feed (o mesmo nome em lojas diferentes conta separado). */
export const sellerKey = (order: Pick<LiveOrder, "store" | "seller">) => `${order.store}|${order.seller ?? ""}`;

/** Vendedores do ranking: "Loja 18 · Setor Bueno · 8 vendas". */
export function sellerLeaders(orders: LiveOrder[]): LeaderItem[] {
  const bySeller = new Map<string, LeaderItem & { storeLabel: string }>();
  for (const order of orders) {
    if (!order.seller) continue;
    const key = sellerKey(order);
    const entry = bySeller.get(key) ?? { key, name: order.seller, subtitle: "", amount: 0, orders: 0, storeLabel: order.storeLabel };
    entry.amount = Math.round((entry.amount + order.amount) * 100) / 100;
    entry.orders += 1;
    bySeller.set(key, entry);
  }
  return [...bySeller.values()].map(({ storeLabel, ...entry }) => ({ ...entry, subtitle: `${storeLabel} · ${plural(entry.orders, "venda", "vendas")}`, search: storeLabel }));
}
