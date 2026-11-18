import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { firstDispatch } from "@/lib/chat/conversation";
import { phoneVariants } from "@/lib/chat/phone";
import { databasePorts, triggerAutomations } from "@/lib/automations/engine-db";
import { isErpTrigger, sanitizeGraph, shiftDate, triggerNodes, type ErpTriggerType, type FlowNode } from "@/lib/automations/nodes";
import {
  birthdayLikePatterns, birthdayMatches, birthdayTarget, brDate, brDay, brHour, daysBetween, labVars, nodeDuration, openValue, parseBirthDate,
  saleKey, saleMatches, saleMoment, saleVars, shiftDay, titleMatches, titleVars, type ErpLabOrder, type ErpSale, type ErpTitle,
} from "@/lib/automations/erp-triggers";

/**
 * Sincronizador dos gatilhos do ERP VMSet. Roda no relógio do chat (1x por minuto, nos dois containers):
 *  - vendas e devoluções: espelho local do VMSet (VmsetSale, atualizado a cada ~60 s), toda rodada;
 *  - financeiro e OS: API do VMSet no host (/events, só leitura no Oracle), a cada 15 min, das 8h às 20h;
 *  - aniversário e sem comprar: cadastro local, 1x por dia (a partir das 9h).
 * Cada evento é reservado em AutomationTriggerEvent (fluxo + nó + chave) antes de disparar: nunca duplica, nem entre
 * os containers Blue/Green. Se o fluxo não iniciou (contato já no fluxo, opt-out), a reserva é liberada.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MAX_PER_NODE = 300;
const API_URL = () => process.env.VMSET_STOCK_URL?.trim() || "http://host.docker.internal:9005";
const API_TOKEN = () => process.env.VMSET_STOCK_TOKEN?.trim() ?? "";

type ErpNode = { flowId: string; activeSince: Date; node: FlowNode; type: ErpTriggerType };

async function erpNodes(): Promise<ErpNode[]> {
  const flows = await prisma.automationFlow.findMany({ where: { status: "active", triggerType: { contains: "trigger_erp_" } }, select: { id: true, nodes: true, edges: true, updatedAt: true } });
  return flows.flatMap((flow) => triggerNodes(sanitizeGraph(flow)).filter((node) => isErpTrigger(node.type)).map((node) => ({ flowId: flow.id, activeSince: flow.updatedAt, node, type: node.type as ErpTriggerType })));
}

/** Reserva o evento e inicia o fluxo pelo nó; sem execução iniciada, libera a reserva para a próxima rodada. */
async function fire(item: ErpNode, eventKey: string, contactId: string, vars: Record<string, string>, startAt?: Date): Promise<number> {
  const key = eventKey.slice(0, 300);
  try {
    await prisma.automationTriggerEvent.create({ data: { flowId: item.flowId, nodeId: item.node.id, eventKey: key, contactId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return 0;
    throw error;
  }
  const started = await triggerAutomations({ type: item.type, nodeId: item.node.id }, { contactId, vars }, { onlyFlowId: item.flowId, startAt }).catch((error: unknown) => {
    console.error(`[automacoes][erp] ${item.type} ${key}:`, error);
    return [] as string[];
  });
  if (!started.length) await prisma.automationTriggerEvent.deleteMany({ where: { flowId: item.flowId, nodeId: item.node.id, eventKey: key } });
  return started.length;
}

const startAtFor = async (item: ErpNode, now: Date) => (item.node.data.config.businessHours === true ? databasePorts(item.flowId).nextBusinessTime(now) : undefined);

// ---------------------------------------------------------------- Vendas (espelho local)

type SaleRow = { sourceKey: string; store: string | null; orderNumber: string | null; orderDate: Date; seenAt: Date; total: number; items: string | null; categories: string | null; seller: string | null; priorOrders: number };

async function loadSales(type: string, from: string, to: string): Promise<ErpSale[]> {
  const rows = await prisma.$queryRaw<SaleRow[]>`
    SELECT g."sourceKey", g.store, g."orderNumber", g."orderDate", g."seenAt", g.total, g.items, g.categories, g.seller,
      (SELECT count(DISTINCT v2.store || '-' || v2."orderNumber") FROM "VmsetSale" v2
        WHERE v2."sourceKey" = g."sourceKey" AND v2.type = 'Venda' AND v2."orderDate" < g."orderDate")::int AS "priorOrders"
    FROM (
      SELECT v."sourceKey", v.store, v."orderNumber", min(v."orderDate") AS "orderDate", min(v."syncedAt") AS "seenAt",
        COALESCE(sum(v.amount), 0)::float8 AS total, left(string_agg(DISTINCT NULLIF(btrim(v.description), ''), ' · '), 300) AS items,
        string_agg(DISTINCT concat_ws(' ', v.category, v.subcategory, v.brand), ' ') AS categories, max(v.seller) AS seller
      FROM "VmsetSale" v
      WHERE v.type = ${type} AND v."orderDate" >= ${from}::date AND v."orderDate" <= ${to}::date AND v."sourceKey" IS NOT NULL AND v."orderNumber" IS NOT NULL
      GROUP BY v."sourceKey", v.store, v."orderNumber"
    ) g
    ORDER BY g."seenAt"
    LIMIT 3000`;
  return rows.map((row) => ({
    sourceKey: row.sourceKey, store: row.store ?? "", orderNumber: row.orderNumber ?? "", orderDate: row.orderDate.toISOString().slice(0, 10), seenAt: row.seenAt,
    total: Number(row.total) || 0, items: row.items ?? "", categories: row.categories ?? "", seller: row.seller ?? "", priorOrders: Number(row.priorOrders) || 0,
  }));
}

async function contactsBySourceKey(keys: string[]) {
  const unique = [...new Set(keys)];
  if (!unique.length) return new Map<string, string>();
  const rows = await prisma.contact.findMany({ where: { sourceKey: { in: unique } }, select: { id: true, sourceKey: true } });
  return new Map(rows.map((row) => [row.sourceKey, row.id]));
}

async function runSales(items: ErpNode[], now: Date): Promise<number> {
  let started = 0;
  const today = brDay(now);
  for (const item of items) {
    const config = item.node.data.config;
    // Eventos a partir de quando o fluxo foi ativado/salvo e no máximo 48 h para trás (CRM fora do ar).
    const since = new Date(Math.max(item.activeSince.getTime(), now.getTime() - 48 * HOUR));
    let candidates: { sale: ErpSale; at: Date }[] = [];
    if (item.type === "trigger_erp_sale" || item.type === "trigger_erp_return") {
      const sales = await loadSales(item.type === "trigger_erp_sale" ? "Venda" : "Devolucao Cliente", shiftDay(today, 2, "days", -1), today);
      candidates = sales.map((sale) => ({ sale, at: saleMoment(sale) })).filter(({ at }) => at >= since && at <= now);
    } else if (item.type === "trigger_erp_after_sale") {
      const { amount, unit } = nodeDuration(config, "days");
      if (!(amount > 0)) continue;
      // Vendas cujo "momento + tempo" caiu entre `since` e agora.
      const from = brDay(shiftDate(new Date(since.getTime() - 2 * 24 * HOUR), amount, unit, -1));
      const to = brDay(shiftDate(now, amount, unit, -1));
      const sales = await loadSales("Venda", from, to);
      candidates = sales.map((sale) => ({ sale, at: shiftDate(saleMoment(sale), amount, unit, 1) })).filter(({ at }) => at >= since && at <= now);
    }
    candidates = candidates.filter(({ sale }) => saleMatches(config, sale)).slice(0, MAX_PER_NODE);
    if (!candidates.length) continue;
    const contacts = await contactsBySourceKey(candidates.map(({ sale }) => sale.sourceKey));
    const startAt = await startAtFor(item, now);
    for (const { sale } of candidates) {
      const contactId = contacts.get(sale.sourceKey);
      if (!contactId) continue;
      started += await fire(item, saleKey(sale), contactId, saleVars(sale), startAt);
    }
  }
  return started;
}

// ---------------------------------------------------------------- Financeiro e laboratório (API do VMSet)

async function fetchEvents<T>(kind: string, date: string, cache: Map<string, Promise<T[] | null>>): Promise<T[] | null> {
  const key = `${kind}:${date}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const response = await fetch(`${API_URL()}/events?kind=${kind}&date=${date}`, { headers: { "x-api-key": API_TOKEN() }, signal: AbortSignal.timeout(40_000), cache: "no-store" });
        if (!response.ok) {
          console.warn(`[automacoes][erp] VMSet /events ${kind} ${date}: HTTP ${response.status}`);
          return null;
        }
        const data = (await response.json()) as { items?: T[] };
        return Array.isArray(data.items) ? data.items : [];
      } catch {
        console.warn(`[automacoes][erp] VMSet /events ${kind} ${date} indisponível`);
        return null;
      }
    })());
  }
  return cache.get(key)!;
}

/** Contato do CRM pelo CPF (cadastro do ERP), depois pelo celular; sem nenhum, cria o cadastro "cpf:..." do VMSet. */
async function resolveContact(person: { cpf: string; name: string; phone: string }): Promise<string | null> {
  const cpf = person.cpf.replace(/\D/g, "");
  const phone = person.phone.replace(/\D/g, "");
  if (cpf.length >= 11) {
    const formatted = cpf.length === 11 ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
    const found = await prisma.contact.findFirst({ where: { OR: [{ sourceKey: { in: [`cpf:${cpf}`, `cpf:${cpf.replace(/^0+/, "")}`] } }, { cpf: { in: [cpf, formatted] } }] }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (found) return found.id;
  }
  if (phone.length >= 10) {
    const found = await prisma.contact.findFirst({ where: { phone: { in: phoneVariants(phone) } }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (found) return found.id;
  }
  if (cpf.length < 11 && phone.length < 10) return null;
  const sourceKey = cpf.length >= 11 ? `cpf:${cpf}` : `vmset-fone:${phone}`;
  const created = await prisma.contact.upsert({ where: { sourceKey }, update: {}, create: { sourceKey, name: person.name || "Cliente", cpf: cpf || null, phone: phone || null }, select: { id: true } });
  return created.id;
}

async function runFinancial(items: ErpNode[], now: Date): Promise<number> {
  const today = brDay(now);
  const cache = new Map<string, Promise<unknown[] | null>>();
  const titles = (kind: string, date: string) => fetchEvents<ErpTitle>(kind, date, cache as Map<string, Promise<ErpTitle[] | null>>);
  let started = 0;
  for (const item of items) {
    const config = item.node.data.config;
    const sinceDay = brDay(item.activeSince);
    const startAt = await startAtFor(item, now);
    const events: { key: string; person: { cpf: string; name: string; phone: string }; vars: Record<string, string> }[] = [];
    if (item.type === "trigger_erp_overdue") {
      const { amount, unit } = nodeDuration(config, "days");
      if (!(amount > 0)) continue;
      for (const title of (await titles("overdue", shiftDay(today, amount, unit, -1))) ?? []) {
        if (titleMatches(config, title, openValue(title))) events.push({ key: `titulo:${title.id}:atraso:${amount}${unit}`, person: title, vars: titleVars(title, today) });
      }
    } else if (item.type === "trigger_erp_due_soon") {
      const days = Math.max(0, Math.floor(Number(config.amount) || 0));
      for (const title of (await titles("due", shiftDay(today, days, "days", 1))) ?? []) {
        if (titleMatches(config, title, openValue(title))) events.push({ key: `titulo:${title.id}:vence:${days}`, person: title, vars: titleVars(title, today) });
      }
    } else if (item.type === "trigger_erp_paid") {
      for (const date of [shiftDay(today, 1, "days", -1), today].filter((day) => day >= sinceDay)) {
        for (const title of (await titles("paid", date)) ?? []) {
          if (config.mode === "settled" && title.remaining > 0) continue;
          if (titleMatches(config, title, title.paid ?? 0)) events.push({ key: config.mode === "settled" ? `fatura:${title.invoice}:quitada` : `titulo:${title.id}:pago`, person: title, vars: titleVars(title, today) });
        }
      }
    } else if (item.type === "trigger_erp_good_payer") {
      const { amount, unit } = nodeDuration(config, "months");
      if (!(amount > 0)) continue;
      const date = shiftDay(today, amount, unit, -1);
      const byCustomer = new Map<string, ErpTitle>();
      for (const title of (await titles("good_payer", date)) ?? []) if (!byCustomer.has(title.cpf || title.phone)) byCustomer.set(title.cpf || title.phone, title);
      for (const [customer, title] of byCustomer) events.push({ key: `adimplente:${customer}:${date}:${amount}${unit}`, person: title, vars: titleVars(title, today) });
    } else if (item.type === "trigger_erp_lab_ready") {
      const store = String(config.store ?? "").trim().toLowerCase();
      const orders = (await fetchEvents<ErpLabOrder>("lab_ready", shiftDay(today, 2, "days", -1), cache as Map<string, Promise<ErpLabOrder[] | null>>)) ?? [];
      for (const order of orders) {
        if (store && !order.store.toLowerCase().includes(store)) continue;
        events.push({ key: `os:${order.id}`, person: order, vars: labVars(order) });
      }
    }
    for (const event of events.slice(0, MAX_PER_NODE)) {
      const contactId = await resolveContact(event.person);
      if (contactId) started += await fire(item, event.key, contactId, event.vars, startAt);
    }
  }
  return started;
}

// ---------------------------------------------------------------- Ciclo de vida (cadastro local)

async function runLifecycle(items: ErpNode[], now: Date): Promise<number> {
  const today = brDay(now);
  let started = 0;
  for (const item of items) {
    const config = item.node.data.config;
    const startAt = await startAtFor(item, now);
    if (item.type === "trigger_erp_birthday") {
      const target = birthdayTarget(today, Number(config.amount) || 0);
      const patterns = birthdayLikePatterns(target.month, target.day);
      if (target.month === 2 && target.day === 28) patterns.push(...birthdayLikePatterns(2, 29));
      const rows = await prisma.contact.findMany({ where: { marketingOptOut: false, OR: patterns.map((pattern) => ({ birthDate: { contains: pattern.replace(/%/g, "").replace(/_/g, "").trim() } })) }, select: { id: true, birthDate: true }, take: 5000 });
      for (const row of rows.slice(0, 5000)) {
        const birth = parseBirthDate(row.birthDate);
        if (!birth || !birthdayMatches(birth, target)) continue;
        const vars = { "cliente.aniversario": `${String(birth.day).padStart(2, "0")}/${String(birth.month).padStart(2, "0")}`, "cliente.idade": String(target.year - birth.year) };
        started += await fire(item, `aniversario:${row.id}:${target.year}`, row.id, vars, startAt);
      }
    } else if (item.type === "trigger_erp_no_purchase") {
      const { amount, unit } = nodeDuration(config, "months");
      if (!(amount > 0)) continue;
      const day = shiftDay(today, amount, unit, -1);
      const rows = await prisma.contact.findMany({ where: { marketingOptOut: false, OR: [{ lastPurchaseDate: { startsWith: day } }, { lastPurchaseDate: { startsWith: brDate(day) } }] }, select: { id: true }, take: 2000 });
      for (const row of rows.slice(0, MAX_PER_NODE * 3)) {
        const vars = { "cliente.ultima_compra": brDate(day), "cliente.dias_sem_comprar": String(daysBetween(day, today)) };
        started += await fire(item, `semcompra:${row.id}:${day}`, row.id, vars, startAt);
      }
    }
  }
  return started;
}

const SALE_TYPES = new Set<ErpTriggerType>(["trigger_erp_sale", "trigger_erp_after_sale", "trigger_erp_return"]);
const FINANCIAL_TYPES = new Set<ErpTriggerType>(["trigger_erp_overdue", "trigger_erp_due_soon", "trigger_erp_paid", "trigger_erp_good_payer", "trigger_erp_lab_ready"]);
const LIFECYCLE_TYPES = new Set<ErpTriggerType>(["trigger_erp_birthday", "trigger_erp_no_purchase"]);

/** Uma rodada do relógio: vendas sempre; financeiro/OS a cada 15 min (8h–20h); ciclo de vida 1x por dia (9h–20h). */
export async function checkErpTriggers(now = new Date()): Promise<number> {
  const nodes = await erpNodes();
  if (!nodes.length) return 0;
  let started = 0;
  const sales = nodes.filter((item) => SALE_TYPES.has(item.type));
  if (sales.length) started += await runSales(sales, now);
  const hour = brHour(now);
  const financial = nodes.filter((item) => FINANCIAL_TYPES.has(item.type));
  if (financial.length && hour >= 8 && hour < 20 && (await firstDispatch(`automation-erp:fin:${Math.floor(now.getTime() / (15 * MINUTE))}`))) {
    started += await runFinancial(financial, now);
  }
  const lifecycle = nodes.filter((item) => LIFECYCLE_TYPES.has(item.type));
  if (lifecycle.length && hour >= 9 && hour < 20 && (await firstDispatch(`automation-erp:life:${brDay(now)}:${Math.floor(now.getTime() / HOUR)}`))) {
    started += await runLifecycle(lifecycle, now);
  }
  return started;
}
