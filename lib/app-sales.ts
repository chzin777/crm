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

export async function salesForViewer(viewer: Viewer, monthInput: string | null, storeInput: string | null) {
  const month = goalMonthKey(monthInput);
  const start = `${month}-01`;
  const end = `${shiftMonth(month, 1)}-01`;
  const base = { view: viewer.view, month, canEditGoals: viewer.view !== "vendedor" };

  // Quem é o vendedor deste usuário (vendedor) e quais lojas ele enxerga (gerente).
  let sellerNames: string[] | null = null;
  let sellerVariants: string[] = [];
  let mySellerId: string | null = null;
  if (viewer.view === "vendedor") {
    const seller = await prisma.seller.findFirst({ where: { userId: viewer.id }, orderBy: { active: "desc" } });
    if (!seller) return { ...base, linked: false, reason: "Seu usuário ainda não está ligado ao seu cadastro de vendedor no VMSet. Peça ao administrador para conferir seu e-mail/CPF ou fazer o vínculo." };
    sellerNames = [nameKey(seller.name)];
    sellerVariants = [...new Set([seller.name.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR"), nameKey(seller.name)])];
    mySellerId = seller.id;
  }
  if (viewer.view === "gerente" && viewer.stores.length === 0) {
    return { ...base, linked: false, reason: "Seu usuário ainda não tem loja vinculada. Peça ao administrador para marcar suas lojas em Usuários." };
  }
  const requested = toStore(storeInput);
  let stores: number[] | null = viewer.view === "gerente" ? viewer.stores : null;
  if (requested !== null && viewer.view !== "vendedor" && (stores === null || stores.includes(requested))) stores = [requested];

  const storeFilter = stores ? Prisma.sql`AND nullif(ltrim(trim(store), '0'), '') = ANY(${stores.map(String)}::text[])` : Prisma.empty;
  // O espelho de vendas e o cadastro vêm do mesmo nome do VMSet; compara em caixa alta com e sem acento.
  const sellerFilter = sellerNames ? Prisma.sql`AND upper(trim(seller)) = ANY(${sellerVariants}::text[])` : Prisma.empty;
  const where = Prisma.sql`"orderDate" >= ${start}::date AND "orderDate" < ${end}::date AND type = 'Venda' ${storeFilter} ${sellerFilter}`;

  const [bySeller, allDays, allRecent, goals] = await Promise.all([
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
      LIMIT 30`,
    goalsForMonth(month),
  ]);

  // Filtro do vendedor pelo nome normalizado (sem acento), igual ao cadastro espelhado do VMSet.
  const mine = (seller: string | null) => !sellerNames || sellerNames.includes(nameKey(seller));
  const sellerRows = bySeller.filter((row) => mine(row.seller));
  const days = new Map<string, number>();
  for (const row of allDays) if (mine(row.seller)) days.set(row.day, (days.get(row.day) ?? 0) + row.amount);
  const recent = allRecent.filter((row) => mine(row.seller)).slice(0, 30);

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
  };
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
