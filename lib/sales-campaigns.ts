import "server-only";
import { Prisma, type SalesCampaign } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  achievementCandidates,
  achievementKey,
  computeStandings,
  newAchievements,
  norm,
  type CampaignGroup,
  type CampaignRule,
  type SaleRow,
  type SellerRef,
} from "@/lib/sales-campaigns-shared";

/**
 * Campanhas comerciais com premiação: apuração sobre o espelho de vendas do VMSet (VmsetSale), registro idempotente
 * das conquistas e comemoração (confete + parabéns) para os usuários do CRM ligados ao vendedor ou à loja.
 */

const day = (date: Date) => date.toISOString().slice(0, 10);

/** Hoje em Brasília ("2026-11-25"). */
export function todayBr(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function toRule(campaign: SalesCampaign): CampaignRule {
  return {
    name: campaign.name,
    metric: campaign.metric === "QUANTIDADE" ? "QUANTIDADE" : "VALOR",
    brand: campaign.brand,
    category: campaign.category,
    stores: campaign.stores,
    startDate: day(campaign.startDate),
    endDate: day(campaign.endDate),
    audience: campaign.audience === "LOJA" || campaign.audience === "GRUPO" ? campaign.audience : "INDIVIDUAL",
    groups: Array.isArray(campaign.groups) ? (campaign.groups as unknown as CampaignGroup[]) : [],
    target: Number(campaign.target),
    rewardMode: campaign.rewardMode === "RECORRENTE" || campaign.rewardMode === "RANKING" ? campaign.rewardMode : "UNICO",
    rewardLabel: campaign.rewardLabel,
    rewardAmount: Number(campaign.rewardAmount),
  };
}

/** Vendas do período agregadas por vendedor/loja/marca/categoria (só "Venda"; filtros de marca/categoria já no banco). */
async function saleRows(rule: CampaignRule): Promise<SaleRow[]> {
  const brand = rule.brand ? Prisma.sql`AND upper(trim(brand)) = ${norm(rule.brand)}` : Prisma.empty;
  const category = rule.category ? Prisma.sql`AND upper(trim(category)) = ${norm(rule.category)}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ seller: string | null; store: number | null; brand: string | null; category: string | null; quantity: number; amount: number }[]>`
    SELECT upper(trim(seller)) AS seller,
           NULLIF(regexp_replace(coalesce(store, ''), '\\D', '', 'g'), '')::int AS store,
           upper(trim(brand)) AS brand,
           upper(trim(category)) AS category,
           coalesce(sum(quantity), 0)::float8 AS quantity,
           coalesce(sum(amount), 0)::float8 AS amount
    FROM "VmsetSale"
    WHERE type = 'Venda' AND "orderDate" BETWEEN ${rule.startDate}::date AND ${rule.endDate}::date ${brand} ${category}
    GROUP BY 1, 2, 3, 4`;
  return rows.map((row) => ({ seller: row.seller ?? "", store: row.store, brand: row.brand, category: row.category, quantity: Number(row.quantity), amount: Number(row.amount) }));
}

async function sellerRefs() {
  const sellers = await prisma.seller.findMany({ select: { id: true, name: true, storeNumber: true, userId: true } });
  return { sellers, refs: new Map<string, SellerRef>(sellers.map((seller) => [norm(seller.name), { id: seller.id, name: seller.name, storeNumber: seller.storeNumber }])) };
}

/** Ranking/progresso de uma campanha agora. */
export async function campaignStandings(campaign: SalesCampaign) {
  const rule = toRule(campaign);
  const [rows, { refs }] = await Promise.all([saleRows(rule), sellerRefs()]);
  return { rule, standings: computeStandings(rule, rows, refs, todayBr()) };
}

const plain = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Liga vendedor sem usuário ao usuário do CRM com o mesmo nome (só quando o nome bate com um único usuário). */
export async function autoLinkSellers() {
  const [sellers, users, linked] = await Promise.all([
    prisma.seller.findMany({ where: { userId: null }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { banned: false }, select: { id: true, name: true } }),
    prisma.seller.findMany({ where: { userId: { not: null } }, select: { userId: true } }),
  ]);
  if (!sellers.length) return 0;
  const taken = new Set(linked.map((row) => row.userId));
  const byName = new Map<string, string[]>();
  for (const user of users) byName.set(plain(user.name), [...(byName.get(plain(user.name)) ?? []), user.id]);
  let count = 0;
  for (const seller of sellers) {
    const ids = byName.get(plain(seller.name));
    if (ids?.length !== 1 || taken.has(ids[0])) continue;
    await prisma.seller.update({ where: { id: seller.id }, data: { userId: ids[0] } });
    taken.add(ids[0]);
    count += 1;
  }
  return count;
}

/** Usuários que comemoram a conquista: o do vendedor; na loja, os vendedores daquela loja. */
function recipientsFor(achievement: { participantType: string; participantKey: string }, sellers: { id: string; storeNumber: number | null; userId: string | null }[]) {
  if (achievement.participantType === "seller") return sellers.filter((seller) => seller.id === achievement.participantKey && seller.userId).map((seller) => seller.userId as string);
  const store = Number(achievement.participantKey.replace("loja:", ""));
  return [...new Set(sellers.filter((seller) => seller.storeNumber === store && seller.userId).map((seller) => seller.userId as string))];
}

/** Apura uma campanha e registra só as conquistas novas (chave única campanha + participante + bloco). */
export async function evaluateCampaign(campaign: SalesCampaign) {
  const rule = toRule(campaign);
  const [rows, { refs, sellers }, existing] = await Promise.all([
    saleRows(rule),
    sellerRefs(),
    prisma.goalAchievement.findMany({ where: { campaignId: campaign.id }, select: { participantKey: true, tier: true } }),
  ]);
  const standings = computeStandings(rule, rows, refs, todayBr());
  const fresh = newAchievements(achievementCandidates(rule, standings), existing.map(achievementKey));
  if (fresh.length) {
    await prisma.goalAchievement.createMany({
      data: fresh.map((item) => ({ campaignId: campaign.id, ...item, rewardLabel: rule.rewardLabel, rewardAmount: rule.rewardAmount })),
      skipDuplicates: true,
    });
    const created = await prisma.goalAchievement.findMany({
      where: { campaignId: campaign.id, OR: fresh.map((item) => ({ participantKey: item.participantKey, tier: item.tier })) },
      select: { id: true, participantType: true, participantKey: true },
    });
    const celebrations = created.flatMap((achievement) => recipientsFor(achievement, sellers).map((userId) => ({ achievementId: achievement.id, userId })));
    if (celebrations.length) await prisma.goalCelebration.createMany({ data: celebrations, skipDuplicates: true });
  }
  await prisma.salesCampaign.update({ where: { id: campaign.id }, data: { evaluatedAt: new Date() } });
  return { standings, created: fresh.length };
}

let lastRun = 0;
let running: Promise<number> | null = null;
const EVALUATE_EVERY_MS = 60_000;

/**
 * Apura as campanhas ativas em andamento (e as que terminaram há até 7 dias, para fechar o ranking).
 * No máximo uma vez por minuto por instância; blue e green juntos não duplicam nada (chave única + skipDuplicates).
 */
export async function evaluateActiveCampaigns(force = false) {
  if (running) return running;
  if (!force && Date.now() - lastRun < EVALUATE_EVERY_MS) return 0;
  lastRun = Date.now();
  running = (async () => {
    const today = todayBr();
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000);
    const campaigns = await prisma.salesCampaign.findMany({ where: { active: true, startDate: { lte: new Date(`${today}T00:00:00Z`) }, endDate: { gte: since } } });
    if (!campaigns.length) return 0;
    await autoLinkSellers().catch((error) => console.error("[campanhas] vínculo de vendedores:", error));
    let created = 0;
    for (const campaign of campaigns) {
      try {
        created += (await evaluateCampaign(campaign)).created;
      } catch (error) {
        console.error(`[campanhas] apuração ${campaign.id}:`, error);
      }
    }
    return created;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Comemorações ainda não vistas pelo usuário (mais antigas primeiro). */
export async function pendingCelebrations(userId: string) {
  const rows = await prisma.goalCelebration.findMany({
    where: { userId, seenAt: null },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { achievement: { include: { campaign: { select: { id: true, name: true, metric: true, brand: true, category: true, audience: true, rewardMode: true } } } } },
  });
  return rows.map((row) => ({
    id: row.id,
    campaignId: row.achievement.campaign.id,
    campaignName: row.achievement.campaign.name,
    rewardMode: row.achievement.campaign.rewardMode,
    participantType: row.achievement.participantType,
    participantKey: row.achievement.participantKey,
    participantName: row.achievement.participantName,
    tier: row.achievement.tier,
    headline: row.achievement.headline,
    rewardLabel: row.achievement.rewardLabel,
    rewardAmount: Number(row.achievement.rewardAmount),
    achievedAt: row.achievement.achievedAt.toISOString(),
  }));
}

export async function markCelebrationsSeen(userId: string, ids: string[]) {
  const result = await prisma.goalCelebration.updateMany({ where: { userId, id: { in: ids }, seenAt: null }, data: { seenAt: new Date() } });
  return result.count;
}

/** Marcas e categorias vendidas nos últimos 180 dias (opções do formulário). */
export async function campaignOptions() {
  const [brands, categories, stores, users, sellers] = await Promise.all([
    prisma.$queryRaw<{ value: string; total: number }[]>`
      SELECT upper(trim(brand)) AS value, count(*)::int AS total FROM "VmsetSale"
      WHERE type = 'Venda' AND "orderDate" >= current_date - 180 AND coalesce(trim(brand), '') <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 400`,
    prisma.$queryRaw<{ value: string; total: number }[]>`
      SELECT upper(trim(category)) AS value, count(*)::int AS total FROM "VmsetSale"
      WHERE type = 'Venda' AND "orderDate" >= current_date - 180 AND coalesce(trim(category), '') <> '' GROUP BY 1 ORDER BY 2 DESC`,
    prisma.seller.findMany({ where: { active: true, storeNumber: { not: null } }, select: { storeNumber: true }, distinct: ["storeNumber"], orderBy: { storeNumber: "asc" } }),
    prisma.user.findMany({ where: { banned: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.seller.findMany({ where: { active: true }, select: { id: true, name: true, storeNumber: true, userId: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    brands: brands.map((row) => row.value),
    categories: categories.map((row) => row.value),
    stores: stores.map((row) => row.storeNumber as number),
    users,
    sellers,
  };
}

export function campaignDto(campaign: SalesCampaign) {
  const rule = toRule(campaign);
  return { id: campaign.id, description: campaign.description, active: campaign.active, evaluatedAt: campaign.evaluatedAt?.toISOString() ?? null, createdAt: campaign.createdAt.toISOString(), ...rule };
}
