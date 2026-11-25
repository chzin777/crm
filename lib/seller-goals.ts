import "server-only";
import { prisma } from "@/lib/prisma";
import { goalMonthKey, sellerDisplayName, storeGoals, type GoalSeller } from "@/lib/seller-goals-shared";
import { brandLabel } from "@/lib/sales-live/feed";
import { linkSellersByContact } from "@/lib/seller-link";

/**
 * Metas de vendedores do CRM. Vendedores vêm do VMSet (ativos e com venda nos últimos 60 dias); a meta é mensal por
 * vendedor e a meta da loja é a soma das metas dos vendedores da loja no mês.
 */

const API_URL = () => (process.env.VMSET_STOCK_URL?.trim() || "http://host.docker.internal:9005").replace(/\/$/, "");
const API_TOKEN = () => process.env.VMSET_STOCK_TOKEN?.trim() ?? "";
export const SELLER_WINDOW_DAYS = 60;
/** Recarrega a lista do VMSet sozinho quando a última sincronização tem mais de 12 h. */
const STALE_MS = 12 * 60 * 60_000;

type VmsetSeller = { id: string; name: string | null; cpf?: string | null; emails?: string[]; store: string | null; stores: string[]; orders: number; amount: number; lastSale: string | null };

const storeNumber = (value: string | null | undefined) => {
  const number = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(number) ? number : null;
};

/**
 * Cria/atualiza os vendedores ativos com venda nos últimos 60 dias. Quem saiu da lista fica inativo
 * (as metas já lançadas continuam). Nunca apaga vendedor nem meta.
 */
export async function syncSellers() {
  const response = await fetch(`${API_URL()}/sellers/active?days=${SELLER_WINDOW_DAYS}`, { headers: { "x-api-key": API_TOKEN() }, signal: AbortSignal.timeout(60_000), cache: "no-store" });
  if (!response.ok) throw new Error(`API do VMSet respondeu ${response.status}`);
  const body = (await response.json()) as { items?: VmsetSeller[] };
  const items = (body.items ?? []).filter((item) => item.id && item.name);
  const now = new Date();
  const existing = new Map((await prisma.seller.findMany({ select: { id: true, vmsetId: true } })).map((row) => [row.vmsetId, row.id]));
  let created = 0;
  for (const item of items) {
    const data = {
      name: sellerDisplayName(item.name ?? ""),
      // CPF e e-mails do cadastro do VMSet: base do vínculo automático com o usuário do CRM.
      ...(item.cpf !== undefined ? { cpf: item.cpf || null } : {}),
      ...(Array.isArray(item.emails) ? { emails: item.emails.map((email) => email.trim().toLowerCase()).filter(Boolean) } : {}),
      storeNumber: storeNumber(item.store),
      stores: item.stores.map(storeNumber).filter((value): value is number => value !== null),
      active: true,
      lastSaleAt: item.lastSale ? new Date(`${item.lastSale}T12:00:00Z`) : null,
      sales60d: item.amount,
      syncedAt: now,
    };
    if (existing.has(item.id)) await prisma.seller.update({ where: { vmsetId: item.id }, data });
    else {
      await prisma.seller.create({ data: { vmsetId: item.id, ...data } });
      created += 1;
    }
  }
  const seen = items.map((item) => item.id);
  const deactivated = await prisma.seller.updateMany({ where: { active: true, vmsetId: { notIn: seen.length ? seen : [""] } }, data: { active: false, syncedAt: now } });
  const linked = await linkSellersByContact().catch((error) => {
    console.error("[metas] vínculo vendedor ↔ usuário:", error);
    return 0;
  });
  return { total: items.length, created, updated: items.length - created, deactivated: deactivated.count, linked, syncedAt: now.toISOString() };
}

/** Sincroniza se nunca rodou ou se a última vez tem mais de 12 h (falha não impede abrir a tela). */
export async function syncSellersIfStale() {
  const last = await prisma.seller.aggregate({ _max: { syncedAt: true } });
  const at = last._max.syncedAt?.getTime() ?? 0;
  if (Date.now() - at < STALE_MS) return null;
  return syncSellers().catch((error) => {
    console.error("[metas] sincronização de vendedores:", error);
    return null;
  });
}

/** Vendedores ativos + quem tem meta no mês (mesmo inativo), com a meta e as metas das lojas (soma). */
export async function goalsForMonth(month: string) {
  const key = goalMonthKey(month);
  const [sellers, goals, last, company] = await Promise.all([
    prisma.seller.findMany({ where: { OR: [{ active: true }, { goals: { some: { month: key } } }] }, orderBy: { name: "asc" } }),
    prisma.sellerGoal.findMany({ where: { month: key } }),
    prisma.seller.aggregate({ _max: { syncedAt: true } }),
    companyGoals(key),
  ]);
  const goalBySeller = new Map(goals.map((goal) => [goal.sellerId, goal]));
  const rows: GoalSeller[] = sellers.map((seller) => {
    const goal = goalBySeller.get(seller.id);
    return {
      id: seller.id,
      name: seller.name,
      // A loja da meta fica gravada; sem meta, vale a loja principal atual.
      storeNumber: goal ? goal.storeNumber : seller.storeNumber,
      stores: seller.stores,
      active: seller.active,
      lastSaleAt: seller.lastSaleAt?.toISOString().slice(0, 10) ?? null,
      sales60d: seller.sales60d ? Number(seller.sales60d) : 0,
      goal: goal ? Number(goal.amount) : 0,
    };
  });
  return { month: key, company, sellers: rows, stores: storeGoals(rows), total: rows.reduce((sum, row) => sum + row.goal, 0), syncedAt: last._max.syncedAt?.toISOString() ?? null };
}

export type BrandGoal = { key: string; label: string; goal: number; sales90d: number };

/** Meta global da empresa e metas por marca do mês; marcas = as vendidas nos últimos 90 dias (espelho do VMSet) + as com meta. */
export async function companyGoals(month: string) {
  const key = goalMonthKey(month);
  const [goals, brands] = await Promise.all([
    prisma.salesGoal.findMany({ where: { month: key } }),
    prisma.$queryRaw<{ key: string; brand: string; total: number }[]>`
      SELECT upper(trim(brand)) AS key, max(trim(brand)) AS brand, coalesce(sum(amount), 0)::float8 AS total
      FROM "VmsetSale"
      WHERE "orderDate" >= current_date - 90 AND type = 'Venda' AND coalesce(trim(brand), '') <> ''
      GROUP BY 1
      ORDER BY 3 DESC`,
  ]);
  const global = goals.find((goal) => goal.scope === "company" && goal.key === "global");
  const brandGoals = new Map(goals.filter((goal) => goal.scope === "brand").map((goal) => [goal.key, goal]));
  const rows: BrandGoal[] = brands.map((brand) => ({ key: brand.key, label: brandLabel({ brand: brand.brand, category: null }), goal: Number(brandGoals.get(brand.key)?.amount ?? 0), sales90d: Math.round(brand.total) }));
  // Marca com meta mas sem venda nos últimos 90 dias continua na lista.
  for (const [brandKey, goal] of brandGoals) if (!rows.some((row) => row.key === brandKey)) rows.push({ key: brandKey, label: goal.label, goal: Number(goal.amount), sales90d: 0 });
  return { global: global ? Number(global.amount) : 0, brands: rows };
}

/** Grava a meta global (opcional) e as metas por marca do mês (0 remove). */
export async function saveCompanyGoals(month: string, input: { global?: number; brands?: { key: string; label: string; amount: number }[] }, userId: string) {
  const key = goalMonthKey(month);
  const entries = [
    ...(input.global === undefined ? [] : [{ scope: "company", key: "global", label: "Empresa", amount: input.global }]),
    ...(input.brands ?? []).map((brand) => ({ scope: "brand", key: brand.key.trim().toUpperCase(), label: brand.label.trim() || brand.key, amount: brand.amount })),
  ].filter((entry) => entry.key);
  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const amount = Math.round(entry.amount * 100) / 100;
      const where = { month_scope_key: { month: key, scope: entry.scope, key: entry.key } };
      if (!Number.isFinite(amount) || amount <= 0) await tx.salesGoal.deleteMany({ where: { month: key, scope: entry.scope, key: entry.key } });
      else await tx.salesGoal.upsert({ where, create: { month: key, scope: entry.scope, key: entry.key, label: entry.label, amount, updatedById: userId }, update: { amount, label: entry.label, updatedById: userId } });
    }
  });
  return entries.length;
}

/** Grava as metas do mês (0 ou vazio remove a meta). A loja da meta é a loja principal do vendedor no momento. */
export async function saveGoals(month: string, goals: { sellerId: string; amount: number }[], userId: string) {
  const key = goalMonthKey(month);
  const sellers = new Map((await prisma.seller.findMany({ where: { id: { in: goals.map((goal) => goal.sellerId) } }, select: { id: true, storeNumber: true } })).map((seller) => [seller.id, seller]));
  let saved = 0;
  await prisma.$transaction(async (tx) => {
    for (const goal of goals) {
      const seller = sellers.get(goal.sellerId);
      if (!seller) continue;
      const amount = Math.round(goal.amount * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) {
        await tx.sellerGoal.deleteMany({ where: { sellerId: seller.id, month: key } });
      } else {
        await tx.sellerGoal.upsert({
          where: { sellerId_month: { sellerId: seller.id, month: key } },
          create: { sellerId: seller.id, month: key, storeNumber: seller.storeNumber, amount, updatedById: userId },
          update: { amount, updatedById: userId },
        });
      }
      saved += 1;
    }
  });
  return saved;
}
