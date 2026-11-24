import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { brClock, brDay } from "@/lib/br-time";
import { addSystemMessage, firstDispatch, isWindowOpen } from "@/lib/chat/conversation";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { listTemplates, sendTemplate } from "@/lib/meta-whatsapp";
import { sanitizeCatalogContext, type CatalogContext } from "@/lib/ai/catalog-context";
import { contactOpportunity } from "@/lib/sales-pipeline-db";
import {
  contactLensProductName,
  contactLensReminderDue,
  isContactLensItem,
  isRxLensItem,
  planContactLensReminder,
  reminderTemplateParams,
  rxReviewDue,
  RX_REVIEW_CATCHUP_DAYS,
  RX_REVIEW_DAYS,
} from "@/lib/commercial/recurrence";
import {
  attributeSalesToConversations,
  budgetRecoveryMessage,
  buildHandoffBrief,
  classifyObjection,
  formatHandoffBrief,
  HANDOFF_BRIEF_MARK,
  isoWeek,
  parseHandoffBrief,
  rankObjections,
  shouldRecoverBudget,
  summarizeConversion,
  ATTRIBUTION_WINDOW_DAYS,
  type AttendedConversation,
  type FactSale,
} from "@/lib/commercial/insights";
import { DEFAULT_COMMERCIAL_SETTINGS, sanitizeCommercialSettings, type CommercialSettings, type TemplateRef } from "@/lib/commercial/settings";

const DAY_MS = 24 * 60 * 60 * 1000;
const SETTINGS_KEY = "commercial-suite";
const SEND_GAP_MS = 1_200;
const MAX_REMINDERS_PER_RUN = 300;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function readCommercialSettings(): Promise<CommercialSettings> {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: SETTINGS_KEY } });
  return row ? sanitizeCommercialSettings(row.value) : { ...DEFAULT_COMMERCIAL_SETTINGS };
}

export async function saveCommercialSettings(value: unknown): Promise<CommercialSettings> {
  const settings = sanitizeCommercialSettings(value);
  await prisma.crmWorkspaceData.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: settings as unknown as Prisma.InputJsonValue },
    update: { value: settings as unknown as Prisma.InputJsonValue },
  });
  return settings;
}

// ---------------------------------------------------------------------------------------------------------------
// Contexto comercial da conversa (resumo do transbordo, recuperação de orçamento e variáveis dos modelos)

export type CommercialContext = {
  customer: string;
  customerTexts: string[];
  catalog: CatalogContext | null;
  products: string[];
  brands: string[];
  store: string | null;
  city: string | null;
  prescription: Awaited<ReturnType<typeof latestPrescription>>;
  /** Item principal consultado (último mostrado ou modelo do funil). */
  mainItem: string | null;
};

async function latestPrescription(contactId: string, conversationId: string) {
  return prisma.customerPrescription.findFirst({
    where: { contactId, OR: [{ conversationId }, { createdAt: { gte: new Date(Date.now() - 60 * DAY_MS) } }] },
    orderBy: { createdAt: "desc" },
  });
}

export async function conversationCommercialContext(conversationId: string): Promise<CommercialContext | null> {
  const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId }, include: { contact: { select: { name: true, store: true } } } });
  if (!conversation) return null;
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId, internal: false, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { author: true, text: true, metaMedia: true },
  });
  const customerTexts = messages.filter((item) => item.author === "customer" && item.text.trim()).map((item) => item.text).reverse();
  const rawContext = messages.map((item) => (item.metaMedia as { aiContext?: unknown } | null)?.aiContext).find(Boolean);
  const catalog = rawContext ? sanitizeCatalogContext(rawContext) : null;
  const opportunity = await contactOpportunity(conversation.contactId).catch(() => null);
  const card = opportunity?.card;
  const shown = (catalog?.lastShownProducts ?? []).map((item) => item.name);
  const products = [...new Set([card?.produtoInteresse ?? "", ...shown].map((item) => item.trim()).filter(Boolean))];
  const brands = [catalog?.activeBrand, catalog?.brand].map((item) => item?.trim() ?? "").filter(Boolean);
  const prescription = await latestPrescription(conversation.contactId, conversationId);
  return {
    customer: conversation.contact.name,
    customerTexts,
    catalog,
    products,
    brands: [...new Set(brands)],
    store: card?.lojaInteresse?.trim() || null,
    city: catalog?.preferredCity?.trim() || null,
    prescription,
    mainItem: card?.produtoInteresse?.trim() || shown[0] || brands[0] || null,
  };
}

/**
 * Transbordo da IA para a fila humana: nota interna com o resumo executivo (nome, interesse, marcas/modelos,
 * receita e loja/região), que o /chat fixa no topo do atendimento. Falha aqui nunca trava o transbordo.
 */
export async function pinHandoffBrief(conversationId: string) {
  const context = await conversationCommercialContext(conversationId);
  if (!context) return null;
  const brief = buildHandoffBrief({
    customer: context.customer,
    customerTexts: context.customerTexts,
    category: context.catalog?.category,
    products: context.products,
    brands: context.brands,
    prescription: context.prescription,
    store: context.store,
    city: context.city,
  });
  return addSystemMessage(conversationId, formatHandoffBrief(brief));
}

/** Resumo fixado mais recente da conversa (card no topo do /chat). */
export async function pinnedHandoffBrief(conversationId: string) {
  const row = await prisma.chatMessage.findFirst({
    where: { conversationId, author: "system", internal: true, text: { startsWith: HANDOFF_BRIEF_MARK } },
    orderBy: { createdAt: "desc" },
    select: { text: true, createdAt: true },
  });
  const fields = row ? parseHandoffBrief(row.text) : null;
  return fields && row ? { ...fields, createdAt: row.createdAt.toISOString() } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Pós-venda: revisão de grau (11 meses) e reposição de lentes de contato

type SaleItemRow = { sourceKey: string; store: string | null; orderNumber: string; saleDate: Date; category: string | null; subcategory: string | null; description: string | null; quantity: number };

async function templateParamCount(ref: TemplateRef, cache: Map<string, number>) {
  if (!ref) return 0;
  const key = `${ref.name}|${ref.language}`;
  if (!cache.has(key)) {
    const templates = await listTemplates().catch(() => []);
    for (const item of templates) cache.set(`${item.name}|${item.language}`, Math.max(0, ...[...item.body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]))));
    if (!cache.has(key)) cache.set(key, -1);
  }
  return cache.get(key)!;
}

type ReminderTarget = { kind: "rx_review" | "contact_lens"; saleKey: string; sourceKey: string; dueDate: Date; item: string | null; store: string | null };

/** Envia (ou registra o motivo de não enviar) um lembrete; a linha única por tipo + pedido garante zero duplicidade. */
async function deliverReminder(target: ReminderTarget, template: NonNullable<TemplateRef>, paramCount: number) {
  const contact = await prisma.contact.findUnique({ where: { sourceKey: target.sourceKey }, select: { id: true, name: true, phone: true, marketingOptOut: true, invalidWhatsApp: true, store: true } });
  const reserve = async (status: string, detail: string | null) => {
    const created = await prisma.commercialReminder.createMany({
      data: [{ kind: target.kind, saleKey: target.saleKey, contactId: contact?.id ?? null, phone: contact?.phone ?? null, dueDate: target.dueDate, status, detail }],
      skipDuplicates: true,
    });
    return created.count > 0;
  };
  if (!contact) return (await reserve("skipped", "cliente sem cadastro no CRM")) && "skipped";
  if (contact.marketingOptOut) return (await reserve("skipped", "opt-out de mensagens")) && "skipped";
  if (contact.invalidWhatsApp || (contact.phone ?? "").replace(/\D/g, "").length < 10) return (await reserve("skipped", "sem WhatsApp válido")) && "skipped";
  // Cliente já lembrado do mesmo tipo recentemente (pedidos diferentes, mesma necessidade): não insiste.
  const recent = await prisma.commercialReminder.findFirst({ where: { contactId: contact.id, kind: target.kind, status: "sent", createdAt: { gte: new Date(Date.now() - (target.kind === "rx_review" ? 300 : 20) * DAY_MS) } }, select: { id: true } });
  if (recent) return (await reserve("skipped", "lembrete recente para o mesmo cliente")) && "skipped";
  // Reserva antes do envio: duas réplicas (blue/green) nunca mandam o mesmo lembrete.
  if (!(await reserve("sending", null))) return null;
  try {
    const params = reminderTemplateParams(paramCount, { name: contact.name, item: target.item, store: target.store ?? contact.store });
    await sendTemplate(contact.phone!, template.name, template.language, params);
    await prisma.commercialReminder.update({ where: { kind_saleKey: { kind: target.kind, saleKey: target.saleKey } }, data: { status: "sent" } });
    return "sent";
  } catch (error) {
    await prisma.commercialReminder.update({ where: { kind_saleKey: { kind: target.kind, saleKey: target.saleKey } }, data: { status: "failed", detail: (error instanceof Error ? error.message : "falha no envio").slice(0, 300) } });
    return "failed";
  }
}

async function recentSaleItems(where: Prisma.Sql, sinceDays: number, untilDays: number, now: Date) {
  return prisma.$queryRaw<SaleItemRow[]>`
    SELECT v."sourceKey", v.store, v."orderNumber", COALESCE(v."invoiceDate", v."orderDate")::timestamp AS "saleDate",
      v.category, v.subcategory, v.description, COALESCE(v.quantity, 1)::float8 AS quantity
    FROM "VmsetSale" v
    WHERE v.type = 'Venda' AND v."sourceKey" IS NOT NULL AND v."orderNumber" IS NOT NULL
      AND COALESCE(v."invoiceDate", v."orderDate") BETWEEN (${now}::date - ${sinceDays}::int) AND (${now}::date - ${untilDays}::int)
      AND ${where}`;
}

const groupOrders = (rows: SaleItemRow[]) => {
  const orders = new Map<string, { saleKey: string; sourceKey: string; store: string | null; saleDate: Date; items: SaleItemRow[] }>();
  for (const row of rows) {
    const saleKey = `${row.store ?? ""}-${row.orderNumber}`;
    const order = orders.get(saleKey) ?? { saleKey, sourceKey: row.sourceKey, store: row.store, saleDate: row.saleDate, items: [] };
    order.items.push(row);
    orders.set(saleKey, order);
  }
  return [...orders.values()];
};

/** Cliente comprou de novo o mesmo tipo depois deste pedido: o lembrete antigo perdeu o sentido. */
function boughtAgain(orders: { sourceKey: string; saleDate: Date }[], order: { sourceKey: string; saleDate: Date }) {
  return orders.some((other) => other.sourceKey === order.sourceKey && other.saleDate.getTime() > order.saleDate.getTime());
}

/**
 * Job diário (a partir das 9h de Brasília, uma réplica): lembrete de revisão de grau para vendas de lentes de grau
 * de 335 dias atrás e de reposição para lentes de contato 5 dias antes do término estimado.
 */
export async function runRecurrenceReminders(now = new Date()) {
  const summary = { rxReview: 0, contactLens: 0, skipped: 0, failed: 0 };
  const clock = brClock(now);
  if (clock.hour < 9 || clock.hour >= 19) return summary;
  if (!(await firstDispatch(`commercial-reminders:${brDay(now)}`))) return summary;
  const settings = await readCommercialSettings();
  const counts = new Map<string, number>();
  const today = new Date(`${brDay(now)}T00:00:00Z`);
  let budget = MAX_REMINDERS_PER_RUN;
  const tally = (result: string | null | false, kind: "rxReview" | "contactLens") => {
    if (result === "sent") summary[kind] += 1;
    else if (result === "failed") summary.failed += 1;
    else if (result === "skipped") summary.skipped += 1;
    if (result === "sent") budget -= 1;
  };

  if (settings.rxReviewTemplate) {
    const paramCount = await templateParamCount(settings.rxReviewTemplate, counts);
    if (paramCount >= 0) {
      const rows = await recentSaleItems(Prisma.sql`upper(v.category) = 'LENTES'`, RX_REVIEW_DAYS + RX_REVIEW_CATCHUP_DAYS, 0, now);
      const orders = groupOrders(rows.filter(isRxLensItem));
      const done = new Set((await prisma.commercialReminder.findMany({ where: { kind: "rx_review", saleKey: { in: orders.map((order) => order.saleKey) } }, select: { saleKey: true } })).map((row) => row.saleKey));
      for (const order of orders) {
        if (budget <= 0) break;
        if (done.has(order.saleKey) || !rxReviewDue(order.saleDate, today) || boughtAgain(orders, order)) continue;
        tally(await deliverReminder({ kind: "rx_review", saleKey: order.saleKey, sourceKey: order.sourceKey, dueDate: today, item: "seus óculos de grau", store: order.store }, settings.rxReviewTemplate, paramCount), "rxReview");
        await sleep(SEND_GAP_MS);
      }
    }
  }

  if (settings.contactLensTemplate) {
    const paramCount = await templateParamCount(settings.contactLensTemplate, counts);
    if (paramCount >= 0) {
      const rows = await recentSaleItems(Prisma.sql`(upper(v.category) LIKE '%CONTATO%' OR upper(v.description) LIKE 'LENTE%DE CONTATO%')`, 400, 0, now);
      const orders = groupOrders(rows.filter(isContactLensItem));
      const done = new Set((await prisma.commercialReminder.findMany({ where: { kind: "contact_lens", saleKey: { in: orders.map((order) => order.saleKey) } }, select: { saleKey: true } })).map((row) => row.saleKey));
      for (const order of orders) {
        if (budget <= 0) break;
        if (done.has(order.saleKey) || boughtAgain(orders, order)) continue;
        const plan = planContactLensReminder(order.saleDate, order.items.map((item) => ({ description: item.description, quantity: item.quantity })));
        if (!contactLensReminderDue(plan, today)) continue;
        tally(await deliverReminder({ kind: "contact_lens", saleKey: order.saleKey, sourceKey: order.sourceKey, dueDate: plan.reminderDate, item: contactLensProductName(order.items[0]?.description), store: order.store }, settings.contactLensTemplate, paramCount), "contactLens");
        await sleep(SEND_GAP_MS);
      }
    }
  }
  if (summary.rxReview || summary.contactLens || summary.failed) console.log(`[pos-venda] revisão ${summary.rxReview}, lentes ${summary.contactLens}, ignorados ${summary.skipped}, falhas ${summary.failed}`);
  return summary;
}

// ---------------------------------------------------------------------------------------------------------------
// Recuperação de orçamento aberto (texto livre na janela de 24 h)

export async function runBudgetRecovery(now = new Date()) {
  const settings = await readCommercialSettings();
  if (!settings.budgetRecoveryEnabled) return 0;
  const clock = brClock(now);
  // Fora do horário comercial nada sai; o candidato ainda pode entrar mais tarde se a janela de 4 a 6 h permitir.
  if (clock.hour < 8 || clock.hour >= 20) return 0;
  const rows = await prisma.chatConversation.findMany({
    where: {
      closedAt: null,
      lastMessageAt: { gte: new Date(now.getTime() - 6 * 60 * 60 * 1000), lte: new Date(now.getTime() - 4 * 60 * 60 * 1000) },
      lastInboundAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    include: { contact: { select: { name: true, marketingOptOut: true } } },
    take: 200,
  });
  let sent = 0;
  for (const row of rows) {
    if (row.contact.marketingOptOut || !isWindowOpen(row.lastInboundAt)) continue;
    const last = await prisma.chatMessage.findFirst({
      where: { conversationId: row.id, internal: false, author: { not: "system" }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { author: true, createdAt: true },
    });
    const base = { lastAuthor: (last?.author as "customer" | "agent" | "bot" | undefined) ?? null, lastAt: last?.createdAt ?? null, lastInboundAt: row.lastInboundAt, brHour: clock.hour, now };
    // Filtros baratos primeiro (quem falou por último, tempo, janela) e só então o contexto comercial.
    if (!shouldRecoverBudget({ ...base, hasIntent: true })) continue;
    if (await prisma.chatDispatch.findUnique({ where: { key: `budget-recovery:${row.id}` }, select: { key: true } })) continue;
    const context = await conversationCommercialContext(row.id);
    if (!context) continue;
    const sentPrescription = !!context.prescription && context.prescription.conversationId === row.id;
    if (!shouldRecoverBudget({ ...base, hasIntent: !!context.mainItem || context.products.length > 0 || sentPrescription })) continue;
    // Uma vez por conversa (e trava entre as duas cores do blue/green).
    if (!(await firstDispatch(`budget-recovery:${row.id}`))) continue;
    const text = budgetRecoveryMessage({ name: row.contact.name, item: context.mainItem, prescription: sentPrescription, variant: row.id.length });
    await sendAutomaticMessage(row, text, undefined, undefined, "Acompanhamento automático");
    sent += 1;
    await sleep(SEND_GAP_MS);
  }
  return sent;
}

// ---------------------------------------------------------------------------------------------------------------
// Atribuição CRM x VMSet e mapa de objeções

type AttendedRow = { id: string; createdAt: Date; assignee: string | null; origin: string | null; sourceKeys: string[] | null };

/** Atendimentos do período com os cadastros do VMSet do mesmo cliente (mesmo contato, telefone ou CPF). */
async function attendedConversations(from: Date, to: Date) {
  return prisma.$queryRaw<AttendedRow[]>`
    WITH conv AS (
      SELECT cv.id, cv."createdAt", cv."campaignName", u.name AS assignee, c."sourceKey", c.phone, c.cpf
      FROM "ChatConversation" cv
      JOIN "Contact" c ON c.id = cv."contactId"
      LEFT JOIN "user" u ON u.id = cv."assigneeId"
      WHERE cv."createdAt" >= ${from} AND cv."createdAt" < ${to} AND cv."lastInboundAt" IS NOT NULL
    ),
    keyed AS (
      SELECT conv.*,
        CASE WHEN length(d.digits) >= 10 THEN substr(d.digits, 1, 2) || right(d.digits, 8) END AS pkey,
        NULLIF(regexp_replace(COALESCE(conv.cpf, ''), '[^0-9]', '', 'g'), '') AS ckey
      FROM conv, LATERAL (SELECT ltrim(CASE WHEN length(regexp_replace(COALESCE(conv.phone, ''), '[^0-9]', '', 'g')) >= 12 AND regexp_replace(COALESCE(conv.phone, ''), '[^0-9]', '', 'g') LIKE '55%'
        THEN substr(regexp_replace(conv.phone, '[^0-9]', '', 'g'), 3) ELSE regexp_replace(COALESCE(conv.phone, ''), '[^0-9]', '', 'g') END, '0') AS digits) d
    ),
    erp AS (
      SELECT c."sourceKey",
        CASE WHEN length(d.digits) >= 10 THEN substr(d.digits, 1, 2) || right(d.digits, 8) END AS pkey,
        NULLIF(regexp_replace(COALESCE(c.cpf, ''), '[^0-9]', '', 'g'), '') AS ckey
      FROM "Contact" c, LATERAL (SELECT ltrim(CASE WHEN length(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g')) >= 12 AND regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE '55%'
        THEN substr(regexp_replace(c.phone, '[^0-9]', '', 'g'), 3) ELSE regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') END, '0') AS digits) d
      WHERE c.phone IS NOT NULL OR c.cpf IS NOT NULL
    )
    matches AS (
      SELECT k.id, e."sourceKey" FROM keyed k JOIN erp e ON e.pkey = k.pkey WHERE k.pkey IS NOT NULL
      UNION
      SELECT k.id, e."sourceKey" FROM keyed k JOIN erp e ON e.ckey = k.ckey WHERE length(k.ckey) = 11
      UNION
      SELECT k.id, k."sourceKey" FROM keyed k
    )
    SELECT k.id, k."createdAt", k.assignee, k."campaignName" AS origin, array_agg(DISTINCT m."sourceKey") AS "sourceKeys"
    FROM keyed k JOIN matches m ON m.id = k.id
    GROUP BY k.id, k."createdAt", k.assignee, k."campaignName"`;
}

export type ConversionReport = {
  period: { from: string; to: string; windowDays: number };
  totals: { attended: number; converted: number; rate: number; revenue: number; ticket: number; sales: number };
  byAttendant: ReturnType<typeof summarizeConversion>;
  byOrigin: ReturnType<typeof summarizeConversion>;
  byDay: { day: string; attended: number; converted: number; revenue: number }[];
  objections: ReturnType<typeof rankObjections>;
  objectionTotal: number;
  reminders: { kind: string; status: string; count: number }[];
};

export async function conversionReport(fromDay: string, toDay: string): Promise<ConversionReport> {
  const from = new Date(`${fromDay}T03:00:00Z`);
  const to = new Date(new Date(`${toDay}T03:00:00Z`).getTime() + DAY_MS);
  const rows = await attendedConversations(from, to);
  // Cada atendimento vira um "cliente" por cadastro do VMSet; a venda é casada pelo sourceKey.
  const conversations: AttendedConversation[] = rows.map((row) => ({ id: row.id, contactKey: row.id, createdAt: row.createdAt, assignee: row.assignee ?? "IA / sem atendente", origin: row.origin ? `Campanha: ${row.origin}` : "WhatsApp orgânico" }));
  const keysByConversation = new Map(rows.map((row) => [row.id, [...new Set(row.sourceKeys ?? [])]]));
  const allKeys = [...new Set(rows.flatMap((row) => row.sourceKeys ?? []))];
  const salesRows = allKeys.length
    ? await prisma.$queryRaw<{ sourceKey: string; saleKey: string; saleDate: Date; total: number }[]>`
      SELECT v."sourceKey", COALESCE(v.store, '') || '-' || v."orderNumber" AS "saleKey",
        min(COALESCE(v."invoiceDate", v."orderDate"))::timestamp AS "saleDate", COALESCE(sum(v.amount), 0)::float8 AS total
      FROM "VmsetSale" v
      WHERE v.type = 'Venda' AND v."orderNumber" IS NOT NULL AND v."sourceKey" = ANY(${allKeys})
        AND COALESCE(v."invoiceDate", v."orderDate") BETWEEN ${from}::date AND (${to}::date + ${ATTRIBUTION_WINDOW_DAYS}::int)
      GROUP BY v."sourceKey", v.store, v."orderNumber"
      HAVING COALESCE(sum(v.amount), 0) > 0`
    : [];
  // Venda expandida por atendimento candidato (mesmo cadastro), deduplicada por pedido na atribuição.
  const conversationsByKey = new Map<string, string[]>();
  for (const [conversationId, keys] of keysByConversation) for (const key of keys) conversationsByKey.set(key, [...(conversationsByKey.get(key) ?? []), conversationId]);
  const sales: FactSale[] = salesRows
    .sort((a, b) => a.saleDate.getTime() - b.saleDate.getTime())
    .flatMap((sale) => (conversationsByKey.get(sale.sourceKey) ?? []).map((conversationId) => ({ saleKey: sale.saleKey, contactKey: conversationId, saleDate: sale.saleDate, total: sale.total })));
  // Mesmo pedido candidato a vários atendimentos: fica com o mais recente antes da venda.
  const startedAt = new Map(rows.map((row) => [row.id, row.createdAt.getTime()]));
  const candidates = attributeSalesToConversations(conversations, [...sales].sort((a, b) => (startedAt.get(b.contactKey) ?? 0) - (startedAt.get(a.contactKey) ?? 0)));
  const total = summarizeConversion(conversations, candidates, () => "total")[0];
  const days = new Map<string, { attended: number; converted: Set<string>; revenue: number }>();
  for (const item of conversations) {
    const day = brDay(item.createdAt);
    const entry = days.get(day) ?? { attended: 0, converted: new Set<string>(), revenue: 0 };
    entry.attended += 1;
    days.set(day, entry);
  }
  for (const sale of candidates) {
    const started = startedAt.get(sale.conversationId);
    const entry = started !== undefined ? days.get(brDay(new Date(started))) : undefined;
    if (!entry) continue;
    entry.converted.add(sale.conversationId);
    entry.revenue += sale.total;
  }
  const objections = await prisma.conversationObjection.findMany({ where: { closedAt: { gte: from, lt: to } }, select: { reason: true } });
  const reminders = await prisma.commercialReminder.groupBy({ by: ["kind", "status"], where: { createdAt: { gte: from, lt: to } }, _count: { _all: true } });
  return {
    period: { from: fromDay, to: toDay, windowDays: ATTRIBUTION_WINDOW_DAYS },
    totals: total
      ? { attended: total.attended, converted: total.converted, rate: total.rate, revenue: total.revenue, ticket: total.ticket, sales: total.sales }
      : { attended: 0, converted: 0, rate: 0, revenue: 0, ticket: 0, sales: 0 },
    byAttendant: summarizeConversion(conversations, candidates, (item) => item.assignee),
    byOrigin: summarizeConversion(conversations, candidates, (item) => item.origin),
    byDay: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, entry]) => ({ day, attended: entry.attended, converted: entry.converted.size, revenue: Math.round(entry.revenue * 100) / 100 })),
    objections: rankObjections(objections),
    objectionTotal: objections.length,
    reminders: reminders.map((row) => ({ kind: row.kind, status: row.status, count: row._count._all })),
  };
}

const INACTIVITY_CLOSE = "Conversa encerrada por inatividade do cliente";

/**
 * Classifica as conversas encerradas no período sem venda no VMSet (mesmo cadastro) depois do início do
 * atendimento. Idempotente: reprocessar atualiza o motivo.
 */
export async function analyzeObjections(from: Date, to: Date) {
  const closed = await prisma.chatConversation.findMany({
    where: { closedAt: { gte: from, lt: to }, lastInboundAt: { not: null } },
    select: { id: true, contactId: true, assigneeId: true, closedAt: true, createdAt: true, contact: { select: { sourceKey: true } } },
    take: 5000,
  });
  if (!closed.length) return 0;
  const sold = new Set(
    (await prisma.$queryRaw<{ sourceKey: string; first: Date }[]>`
      SELECT v."sourceKey", min(COALESCE(v."invoiceDate", v."orderDate"))::timestamp AS first FROM "VmsetSale" v
      WHERE v.type = 'Venda' AND v."sourceKey" = ANY(${[...new Set(closed.map((row) => row.contact.sourceKey))]})
        AND COALESCE(v."invoiceDate", v."orderDate") >= ${new Date(from.getTime() - 30 * DAY_MS)}::date
      GROUP BY v."sourceKey"`).flatMap((row) => closed.filter((item) => item.contact.sourceKey === row.sourceKey && row.first.getTime() >= item.createdAt.getTime() - DAY_MS).map((item) => item.id)),
  );
  let count = 0;
  for (const row of closed) {
    if (sold.has(row.id)) {
      await prisma.conversationObjection.deleteMany({ where: { conversationId: row.id } });
      continue;
    }
    const messages = await prisma.chatMessage.findMany({ where: { conversationId: row.id, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 200, select: { author: true, text: true, internal: true } });
    const visible = messages.filter((item) => !item.internal && item.author !== "system");
    const result = classifyObjection({
      customerTexts: visible.filter((item) => item.author === "customer").map((item) => item.text).filter(Boolean),
      teamTexts: visible.filter((item) => item.author !== "customer").map((item) => item.text).filter(Boolean),
      lastAuthor: (visible.at(-1)?.author as "customer" | "agent" | "bot" | undefined) ?? null,
      closedByInactivity: messages.some((item) => item.author === "system" && item.text.startsWith(INACTIVITY_CLOSE)),
    });
    const data = { contactId: row.contactId, assigneeId: row.assigneeId, closedAt: row.closedAt!, reason: result.reason, evidence: result.evidence, weekKey: isoWeek(row.closedAt!) };
    await prisma.conversationObjection.upsert({ where: { conversationId: row.id }, create: { conversationId: row.id, ...data }, update: data });
    count += 1;
  }
  return count;
}

/** Job semanal (segunda-feira a partir das 7h de Brasília): classifica a semana anterior. */
export async function runWeeklyObjections(now = new Date()) {
  const clock = brClock(now);
  if (clock.weekday !== 1 || clock.hour < 7) return 0;
  if (!(await firstDispatch(`objections:${isoWeek(now)}`))) return 0;
  const end = new Date(`${clock.day}T03:00:00Z`);
  return analyzeObjections(new Date(end.getTime() - 7 * DAY_MS), end);
}
