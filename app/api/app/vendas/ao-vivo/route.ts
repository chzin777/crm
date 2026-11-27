import { requireApiSession } from "@/lib/api-auth";
import { loadViewer, soldItemScope } from "@/lib/app-sales";
import { brDay } from "@/lib/br-time";
import { soldItems } from "@/lib/sales-live/live-db";
import { buildOrders, MAX_PERIOD_DAYS, validPeriod, type LiveOrder } from "@/lib/sales-live/feed";
import { filterOrdersByItems, itemFilterOptions, type ItemFilter } from "@/lib/sales-live/item-filter";

/**
 * Vendas faturadas no app (mesma consulta do /vendas/ao-vivo: pedidos faturados do VMSet, total líquido oficial),
 * recortadas pela visão do usuário: vendedor só as próprias, gerente as lojas dele, admin todas.
 * ?from=&to= (AAAA-MM-DD; padrão hoje) · category, brand, product (filtros por item) · q (busca) · page.
 */
const PAGE_SIZE = 20;
const OPTIONS_LIMIT = 60;

const fold = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const orderText = (order: LiveOrder) =>
  fold([order.order, order.customer, order.seller, order.storeLabel, order.payment, order.summary, ...(order.lines ?? []).flatMap((line) => [line.description, line.brand, line.category])].filter(Boolean).join(" "));

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const viewer = await loadViewer(user.id);
  if (!viewer) return Response.json({ error: "Usuário sem acesso." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const today = brDay();
  const from = params.get("from") || today;
  const to = params.get("to") || from;
  if (!validPeriod(from, to)) return Response.json({ error: `Período inválido: informe início e fim (até ${MAX_PERIOD_DAYS} dias).` }, { status: 400 });

  const scope = await soldItemScope(viewer);
  if (!scope.linked) return Response.json({ data: { view: viewer.view, linked: false, reason: scope.reason, from, to } });

  const list = (key: string) => params.getAll(key).map((value) => value.trim()).filter(Boolean);
  const filter: ItemFilter = { categories: list("category"), brands: list("brand"), products: list("product") };
  const words = fold(params.get("q")).split(/\s+/).filter(Boolean);
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  try {
    const sold = await soldItems(from, to);
    const orders = buildOrders(sold.items.filter(scope.keep), sold.day, { storeLabel: sold.storeLabel });
    const options = itemFilterOptions(orders, filter);
    const matched = filterOrdersByItems(orders, filter).filter((order) => !words.length || words.every((word) => orderText(order).includes(word)));
    const revenue = Math.round(matched.reduce((sum, order) => sum + order.amount, 0) * 100) / 100;
    const units = matched.reduce((sum, order) => sum + order.items, 0);
    const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
    return Response.json(
      {
        data: {
          view: viewer.view,
          linked: true,
          from,
          to,
          today,
          updatedAt: sold.updatedAt,
          kpis: { revenue, orders: matched.length, ticket: matched.length ? Math.round((revenue / matched.length) * 100) / 100 : 0, units },
          options: {
            categories: options.categories.slice(0, OPTIONS_LIMIT),
            brands: options.brands.slice(0, OPTIONS_LIMIT),
            products: options.products.slice(0, OPTIONS_LIMIT),
          },
          page: { page: Math.min(page, pages), pages, total: matched.length, pageSize: PAGE_SIZE },
          orders: matched.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE).map((order) => ({
            key: order.key,
            store: order.store,
            storeLabel: order.storeLabel,
            order: order.order,
            day: order.day ?? sold.day,
            time: order.time,
            amount: order.amount,
            items: order.items,
            summary: order.summary,
            seller: order.seller,
            payment: order.payment,
            customer: order.customer ?? null,
            lines: order.lines ?? [],
          })),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[app/vendas/ao-vivo]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Não foi possível consultar as vendas do VMSET agora." }, { status: 503 });
  }
}
