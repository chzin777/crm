import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveAppView, type AppView } from "@/lib/app-view";
import { goalMonthKey, shiftMonth, storeLabel } from "@/lib/seller-goals-shared";
import { goalsForMonth, saveGoals } from "@/lib/seller-goals";

/**
 * Vendas e metas do mês para o app de celular, recortadas pela visão do usuário:
 * vendedor = só o vendedor do VMSet ligado a ele; gerente = lojas do usuário; admin = todas as lojas.
 */

type Viewer = { id: string; view: AppView; stores: number[] };

const toStore = (value: string | number | null | undefined) => {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) ? number : null;
};

/** Nome do vendedor comparável entre o espelho de vendas (caixa alta) e o cadastro de vendedores. */
const nameKey = (value: string | null | undefined) =>
  (value ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toUpperCase();

export async function loadViewer(userId: string): Promise<Viewer | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, banned: true, roleRef: { select: { permissions: true } }, chatAgent: { select: { stores: true } } },
  });
  if (!user || user.banned) return null;
  const stores = (user.chatAgent?.stores ?? []).map(toStore).filter((value): value is number => value !== null);
  return { id: userId, view: resolveAppView(user.role, user.roleRef?.permissions), stores };
}

type SellerTotal = { store: string | null; seller: string | null; amount: number; orders: number };
type DayTotal = { day: string; amount: number };
type RecentOrder = { date: string; store: string | null; seller: string | null; order: string | null; customer: string | null; amount: number; items: string | null };

/** Variações do nome do vendedor no espelho de vendas (caixa alta com e sem acento). */
const sellerNameVariants = (name: string) => [...new Set([name.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR"), nameKey(name)])];

/** Vendedor do VMSet ligado ao usuário (o mais ativo, se houver mais de um cadastro). */
export const linkedSeller = (userId: string) => prisma.seller.findFirst({ where: { userId }, orderBy: { active: "desc" } });

type Scope =
  | { linked: false; reason: string }
  | { linked: true; requested: number | null; stores: number[] | null; sellerNames: string[] | null; sellerVariants: string[]; mySellerId: string | null; filter: Prisma.Sql };

/** Recorte das vendas do usuário: vendedor = só as dele; gerente = lojas dele; admin = todas (ou a loja pedida). */
async function viewerScope(viewer: Viewer, storeInput: string | null): Promise<Scope> {
  let sellerNames: string[] | null = null;
  let sellerVariants: string[] = [];
  let mySellerId: string | null = null;
  if (viewer.view === "vendedor") {
    const seller = await linkedSeller(viewer.id);
    if (!seller) return { linked: false, reason: "Seu usuário ainda não está ligado ao seu cadastro de vendedor no VMSet. Peça ao administrador para conferir seu e-mail/CPF ou fazer o vínculo." };
    sellerNames = [nameKey(seller.name)];
    sellerVariants = sellerNameVariants(seller.name);
    mySellerId = seller.id;
  }
  if (viewer.view === "gerente" && viewer.stores.length === 0) {
    return { linked: false, reason: "Seu usuário ainda não tem loja vinculada. Peça ao administrador para marcar suas lojas em Usuários." };
  }
  const requested = toStore(storeInput);
  let stores: number[] | null = viewer.view === "gerente" ? viewer.stores : null;
  if (requested !== null && viewer.view !== "vendedor" && (stores === null || stores.includes(requested))) stores = [requested];

  const storeFilter = stores ? Prisma.sql`AND nullif(ltrim(trim(store), '0'), '') = ANY(${stores.map(String)}::text[])` : Prisma.empty;
  // O espelho de vendas e o cadastro vêm do mesmo nome do VMSet; compara em caixa alta com e sem acento.
  const sellerFilter = sellerNames ? Prisma.sql`AND upper(trim(seller)) = ANY(${sellerVariants}::text[])` : Prisma.empty;
  return { linked: true, requested, stores, sellerNames, sellerVariants, mySellerId, filter: Prisma.sql`type = 'Venda' ${storeFilter} ${sellerFilter}` };
}

/** Filtro dos itens faturados do VMSet (feed ao vivo) pelo recorte do usuário: vendedor só as dele, gerente as lojas dele. */
export async function soldItemScope(viewer: Viewer): Promise<{ linked: false; reason: string } | { linked: true; keep: (item: { store: string | null; seller: string | null }) => boolean }> {
  const scope = await viewerScope(viewer, null);
  if (!scope.linked) return scope;
  const { stores, sellerNames } = scope;
  return {
    linked: true,
    keep: (item) => {
      if (stores) {
        const store = toStore(item.store);
        if (store === null || !stores.includes(store)) return false;
      }
      return !sellerNames || sellerNames.includes(nameKey(item.seller));
    },
  };
}

export const RECENT_PAGE_SIZE = 10;

export async function salesForViewer(viewer: Viewer, monthInput: string | null, storeInput: string | null, pageInput?: string | null) {
  const month = goalMonthKey(monthInput);
  const start = `${month}-01`;
  const end = `${shiftMonth(month, 1)}-01`;
  const base = { view: viewer.view, month, canEditGoals: viewer.view !== "vendedor" };

  const scope = await viewerScope(viewer, storeInput);
  if (!scope.linked) return { ...base, linked: false, reason: scope.reason };
  const { requested, stores, sellerNames, mySellerId } = scope;
  const page = Math.max(1, Math.min(1000, Number.parseInt(pageInput ?? "1", 10) || 1));
  const where = Prisma.sql`"orderDate" >= ${start}::date AND "orderDate" < ${end}::date AND ${scope.filter}`;

  const [bySeller, allDays, allRecent, recentCount, goals] = await Promise.all([
    prisma.$queryRaw<SellerTotal[]>`
      SELECT nullif(ltrim(trim(store), '0'), '') AS store, max(trim(seller)) AS seller, coalesce(sum(amount), 0)::float8 AS amount,
        count(DISTINCT "orderNumber")::int AS orders
      FROM "VmsetSale" WHERE ${where}
      GROUP BY 1, upper(trim(seller))`,
    prisma.$queryRaw<(DayTotal & { seller: string | null })[]>`
      SELECT to_char("orderDate", 'YYYY-MM-DD') AS day, upper(trim(seller)) AS seller, coalesce(sum(amount), 0)::float8 AS amount
      FROM "VmsetSale" WHERE ${where}
      GROUP BY 1, 2`,
    prisma.$queryRaw<RecentOrder[]>`
      SELECT to_char(max("orderDate"), 'YYYY-MM-DD') AS date, nullif(ltrim(trim(store), '0'), '') AS store, max(trim(seller)) AS seller,
        "orderNumber" AS order, max("customerName") AS customer, coalesce(sum(amount), 0)::float8 AS amount,
        left(string_agg(DISTINCT coalesce(nullif(trim(brand), ''), trim(description)), ', '), 120) AS items
      FROM "VmsetSale" WHERE ${where}
      GROUP BY 2, 4
      ORDER BY 1 DESC, 4 DESC
      LIMIT ${RECENT_PAGE_SIZE} OFFSET ${(page - 1) * RECENT_PAGE_SIZE}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM (
        SELECT 1 FROM "VmsetSale" WHERE ${where} GROUP BY nullif(ltrim(trim(store), '0'), ''), "orderNumber"
      ) t`,
    goalsForMonth(month),
  ]);
  const recentTotal = recentCount[0]?.total ?? 0;

  // Filtro do vendedor pelo nome normalizado (sem acento), igual ao cadastro espelhado do VMSet.
  const mine = (seller: string | null) => !sellerNames || sellerNames.includes(nameKey(seller));
  const sellerRows = bySeller.filter((row) => mine(row.seller));
  const days = new Map<string, number>();
  for (const row of allDays) if (mine(row.seller)) days.set(row.day, (days.get(row.day) ?? 0) + row.amount);
  const recent = allRecent.filter((row) => mine(row.seller));

  // Vendedores: soma por nome em todas as lojas do recorte + metas do mês.
  const sales = new Map<string, { name: string; amount: number; orders: number; store: number | null; best: number }>();
  for (const row of sellerRows) {
    const key = nameKey(row.seller);
    if (!key) continue;
    const entry = sales.get(key) ?? { name: row.seller ?? "", amount: 0, orders: 0, store: null, best: -1 };
    entry.amount += row.amount;
    entry.orders += row.orders;
    if (row.amount > entry.best) {
      entry.best = row.amount;
      entry.store = toStore(row.store);
    }
    sales.set(key, entry);
  }
  const inScope = (store: number | null) => !stores || (store !== null && stores.includes(store));
  const goalSellers = goals.sellers.filter((seller) => (mySellerId ? seller.id === mySellerId : inScope(seller.storeNumber)));
  const rows = goalSellers.map((seller) => {
    const key = nameKey(seller.name);
    const sold = sales.get(key);
    sales.delete(key);
    return { id: seller.id, name: seller.name, storeNumber: seller.storeNumber, amount: round(sold?.amount ?? 0), orders: sold?.orders ?? 0, goal: seller.goal };
  });
  // Quem vendeu no recorte mas não está no cadastro de vendedores (sem meta possível).
  if (!mySellerId) {
    for (const sold of sales.values()) rows.push({ id: "", name: sold.name, storeNumber: sold.store, amount: round(sold.amount), orders: sold.orders, goal: 0 });
  }
  const visible = rows.filter((row) => row.amount > 0 || row.goal > 0 || row.id === mySellerId).sort((a, b) => b.amount - a.amount || b.goal - a.goal);

  const amount = round(sellerRows.reduce((sum, row) => sum + row.amount, 0));
  const orders = sellerRows.reduce((sum, row) => sum + row.orders, 0);
  const sellerGoals = round(visible.reduce((sum, row) => sum + row.goal, 0));
  // Admin sem filtro de loja: vale a meta global da empresa quando lançada.
  const goal = viewer.view === "admin" && !stores && goals.company.global > 0 ? goals.company.global : sellerGoals;

  const storeOptions = viewer.view === "gerente"
    ? viewer.stores
    : viewer.view === "admin"
      ? [...new Set(goals.sellers.map((seller) => seller.storeNumber).filter((value): value is number => value !== null))]
      : [];

  return {
    ...base,
    linked: true,
    store: requested,
    stores: [...storeOptions].sort((a, b) => a - b).map((storeNumber) => ({ storeNumber, label: storeLabel(storeNumber) })),
    totals: { amount, orders, ticket: orders ? round(amount / orders) : 0, goal },
    daily: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day, amount: round(total) })),
    sellers: viewer.view === "vendedor" ? [] : visible,
    recent: recent.map((row) => ({ ...row, amount: round(row.amount), storeLabel: storeLabel(toStore(row.store)) })),
    recentPage: { page, pageSize: RECENT_PAGE_SIZE, total: recentTotal, pages: Math.max(1, Math.ceil(recentTotal / RECENT_PAGE_SIZE)) },
  };
}

type OrderItem = {
  date: string | null; invoiceNumber: string | null; invoiceDate: string | null; store: string | null; seller: string | null; customer: string | null;
  partnerId: string | null; productCode: string | null; description: string | null; brand: string | null; category: string | null;
  quantity: number; amount: number; discount: number; payment: string | null; paymentTerms: string | null;
};

/** Detalhe de um pedido (itens, desconto, pagamento), só dentro do recorte do usuário. */
export async function orderForViewer(viewer: Viewer, orderInput: string | null, storeInput: string | null) {
  const order = (orderInput ?? "").trim();
  if (!order) return { error: "Informe o pedido.", status: 400 } as const;
  const scope = await viewerScope(viewer, null);
  if (!scope.linked) return { error: scope.reason, status: 403 } as const;
  const store = toStore(storeInput);
  const storeFilter = store !== null ? Prisma.sql`AND nullif(ltrim(trim(store), '0'), '') = ${String(store)}` : Prisma.empty;
  const items = await prisma.$queryRaw<OrderItem[]>`
    SELECT to_char("orderDate", 'YYYY-MM-DD') AS date, "invoiceNumber", to_char("invoiceDate", 'YYYY-MM-DD') AS "invoiceDate",
      nullif(ltrim(trim(store), '0'), '') AS store, trim(seller) AS seller, "customerName" AS customer, "partnerId",
      "productCode", trim(description) AS description, nullif(trim(brand), '') AS brand, nullif(trim(category), '') AS category,
      coalesce(quantity, 0)::float8 AS quantity, coalesce(amount, 0)::float8 AS amount, coalesce(discount, 0)::float8 AS discount,
      nullif(trim(payment), '') AS payment, nullif(trim("paymentTerms"), '') AS "paymentTerms"
    FROM "VmsetSale"
    WHERE "orderNumber" = ${order} ${storeFilter} AND ${scope.filter}
    ORDER BY amount DESC NULLS LAST
    LIMIT 200`;
  if (items.length === 0) return { error: "Venda não encontrada.", status: 404 } as const;
  const first = items[0];
  const payments = [...new Set(items.map((item) => [item.payment, item.paymentTerms].filter(Boolean).join(" · ")).filter(Boolean))];
  return {
    data: {
      order,
      date: first.date,
      invoiceNumber: first.invoiceNumber,
      invoiceDate: first.invoiceDate,
      store: first.store,
      storeLabel: storeLabel(toStore(first.store)),
      seller: first.seller,
      customer: first.customer,
      payments,
      amount: round(items.reduce((sum, item) => sum + item.amount, 0)),
      discount: round(items.reduce((sum, item) => sum + item.discount, 0)),
      items: items.map((item) => ({
        code: item.productCode,
        description: item.description,
        brand: item.brand,
        category: item.category,
        quantity: item.quantity,
        amount: round(item.amount),
        discount: round(item.discount),
      })),
    },
  } as const;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Gerente lança meta só de vendedor das suas lojas; admin de qualquer um; vendedor não lança. */
export async function saveGoalForViewer(viewer: Viewer, input: { sellerId: string; month: string; amount: number }) {
  if (viewer.view === "vendedor") return { error: "Só gerente ou administrador define metas.", status: 403 } as const;
  const seller = await prisma.seller.findUnique({ where: { id: input.sellerId }, select: { id: true, storeNumber: true, stores: true } });
  if (!seller) return { error: "Vendedor não encontrado.", status: 404 } as const;
  if (viewer.view === "gerente") {
    const own = [seller.storeNumber, ...seller.stores].some((store) => store !== null && viewer.stores.includes(store));
    if (!own) return { error: "Esse vendedor não é de uma loja sua.", status: 403 } as const;
  }
  await saveGoals(goalMonthKey(input.month), [{ sellerId: seller.id, amount: input.amount }], viewer.id);
  return { ok: true } as const;
}
