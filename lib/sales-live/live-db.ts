import "server-only";
import { prisma } from "@/lib/prisma";
import { brDay } from "@/lib/br-time";
import { buildOrders, changedOrders, dayKpis, phoneKey, type LiveEvent, type LiveSnapshot, type SaleItem } from "@/lib/sales-live/feed";

/**
 * Poller único das vendas do dia (uma consulta à API do VMSet a cada ciclo, não importa quantos celulares estejam
 * abertos): o retrato fica em memória e cada mudança vai para todos os navegadores pelo canal SSE. Sem ninguém olhando
 * (nenhum canal aberto e nenhuma consulta há 1 min), o poller para sozinho.
 */

const API_URL = () => (process.env.VMSET_STOCK_URL?.trim() || "http://host.docker.internal:9005").replace(/\/$/, "");
const API_TOKEN = () => process.env.VMSET_STOCK_TOKEN?.trim() ?? "";
export const POLL_MS = 12_000;
const IDLE_MS = 60_000;
const CRM_WINDOW_DAYS = 30;

export type { LiveEvent };

type State = {
  snapshot: LiveSnapshot | null;
  items: SaleItem[];
  crmKeys: Set<string>;
  resolved: Set<string>;
  listeners: Set<(event: LiveEvent) => void>;
  timer: ReturnType<typeof setInterval> | null;
  lastDemand: number;
  running: Promise<void> | null;
  error: string | null;
  labels: { at: number; map: Map<string, string> };
};

const globalState = globalThis as unknown as { __salesLive?: State };
const state: State = (globalState.__salesLive ??= { snapshot: null, items: [], crmKeys: new Set(), resolved: new Set(), listeners: new Set(), timer: null, lastDemand: 0, running: null, error: null, labels: { at: 0, map: new Map() } });

const titleCase = (value: string) => value.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`);

/** Nome curto da loja para o celular: "Loja Jardim Nova Era (Aparecida)", sem endereço. */
async function storeLabels() {
  if (Date.now() - state.labels.at < 10 * 60_000 && state.labels.map.size) return state.labels.map;
  const stores = await prisma.store.findMany({ select: { number: true, name: true, city: true, neighborhoods: true } });
  const map = new Map<string, string>();
  for (const store of stores) {
    const place = store.neighborhoods[0]?.trim();
    const city = store.city && !/^GOI[AÂ]NIA$/i.test(store.city.trim()) ? ` (${titleCase(store.city.trim()).replace("Aparecida De Goiânia", "Aparecida").replace("Aparecida De Goiania", "Aparecida")})` : "";
    map.set(String(store.number), place ? `Loja ${titleCase(place)}${city}` : store.name);
  }
  state.labels = { at: Date.now(), map };
  return map;
}

/** Pedidos de clientes atendidos pelo CRM / WhatsApp nos últimos 30 dias (telefone DDD+8 dígitos ou CPF). */
async function resolveCrmOrders(items: SaleItem[], keys: string[]) {
  const pending = new Set(keys.filter((key) => !state.resolved.has(key)));
  if (!pending.size) return;
  const byOrder = new Map<string, { phones: Set<string>; cpfs: Set<string> }>();
  for (const item of items) {
    const key = `${item.store}-${item.order}`;
    if (!pending.has(key)) continue;
    const entry = byOrder.get(key) ?? { phones: new Set(), cpfs: new Set() };
    const phone = phoneKey(item.phone);
    if (phone) entry.phones.add(phone);
    const cpf = (item.cpf ?? "").replace(/\D/g, "");
    if (cpf.length === 11) entry.cpfs.add(cpf);
    byOrder.set(key, entry);
  }
  const phones = [...new Set([...byOrder.values()].flatMap((entry) => [...entry.phones]))];
  const cpfs = [...new Set([...byOrder.values()].flatMap((entry) => [...entry.cpfs]))];
  if (phones.length || cpfs.length) {
    const rows = await prisma.$queryRaw<{ pkey: string | null; cpf: string | null }[]>`
      WITH c AS (
        SELECT regexp_replace(COALESCE(ct.phone, ''), '\D', '', 'g') AS d, regexp_replace(COALESCE(ct.cpf, ''), '\D', '', 'g') AS cpf
        FROM "Contact" ct
        WHERE EXISTS (SELECT 1 FROM "ChatConversation" cv WHERE cv."contactId" = ct.id AND cv."lastInboundAt" >= now() - make_interval(days => ${CRM_WINDOW_DAYS}))
      ), n AS (
        SELECT CASE WHEN length(d) >= 12 AND d LIKE '55%' THEN substr(d, 3) ELSE d END AS d, cpf FROM c
      )
      SELECT CASE WHEN length(d) >= 10 THEN substr(d, 1, 2) || right(d, 8) END AS pkey, cpf FROM n
      WHERE (length(d) >= 10 AND substr(d, 1, 2) || right(d, 8) = ANY(${phones.length ? phones : [""]}::text[]))
         OR (cpf <> '' AND cpf = ANY(${cpfs.length ? cpfs : [""]}::text[]))`;
    const matchedPhones = new Set(rows.map((row) => row.pkey).filter(Boolean));
    const matchedCpfs = new Set(rows.map((row) => row.cpf).filter(Boolean));
    for (const [key, entry] of byOrder) {
      if ([...entry.phones].some((phone) => matchedPhones.has(phone)) || [...entry.cpfs].some((cpf) => matchedCpfs.has(cpf))) state.crmKeys.add(key);
    }
  }
  for (const key of pending) state.resolved.add(key);
}

function emit(event: LiveEvent) {
  for (const listener of state.listeners) {
    try {
      listener(event);
    } catch {
      state.listeners.delete(listener);
    }
  }
}

async function tick() {
  const response = await fetch(`${API_URL()}/sales/today`, { headers: { "x-api-key": API_TOKEN() }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`API do VMSet respondeu ${response.status}`);
  const body = (await response.json()) as { day?: string; items?: SaleItem[] };
  const day = body.day && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : brDay();
  const items = Array.isArray(body.items) ? body.items : [];
  const previous = state.snapshot;
  const dayChanged = !previous || previous.day !== day;
  if (dayChanged) {
    state.crmKeys = new Set();
    state.resolved = new Set();
  }
  const labels = await storeLabels();
  const label = (store: string) => labels.get(store) ?? `Loja ${store}`;
  const draft = buildOrders(items, day, { storeLabel: label });
  await resolveCrmOrders(items, draft.map((order) => order.key)).catch((error) => console.error("[vendas-ao-vivo] cruzamento CRM:", error));
  const orders = buildOrders(items, day, { storeLabel: label, fromCrm: (key) => state.crmKeys.has(key) });
  const changed = dayChanged ? orders : changedOrders(previous.orders, orders);
  const removed = !dayChanged && previous.orders.length > 0 && orders.length < previous.orders.length;
  const stores = [...new Map(orders.map((order) => [order.store, { store: order.store, storeLabel: order.storeLabel }])).values()].sort((a, b) => a.storeLabel.localeCompare(b.storeLabel));
  const seq = (previous?.seq ?? 0) + (changed.length || removed ? 1 : 0);
  const snapshot: LiveSnapshot = { day, updatedAt: new Date().toISOString(), seq, orders, kpis: dayKpis(orders), stores };
  state.snapshot = snapshot;
  state.items = items;
  state.error = null;
  // Virada do dia ou pedido cancelado (saiu do VMSet): retrato inteiro; senão, só os pedidos novos/alterados.
  if (dayChanged || removed) emit({ type: "snapshot", snapshot });
  else if (changed.length) emit({ type: "orders", orders: changed, kpis: snapshot.kpis, seq, updatedAt: snapshot.updatedAt, stores });
  else emit({ type: "orders", orders: [], kpis: snapshot.kpis, seq, updatedAt: snapshot.updatedAt, stores });
}

function runOnce() {
  state.running ??= tick()
    .catch((error) => {
      state.error = error instanceof Error ? error.message : "falha ao consultar o VMSet";
      console.error("[vendas-ao-vivo]", state.error);
    })
    .finally(() => {
      state.running = null;
    });
  return state.running;
}

function ensurePolling() {
  state.lastDemand = Date.now();
  if (state.timer) return;
  state.timer = setInterval(() => {
    if (!state.listeners.size && Date.now() - state.lastDemand > IDLE_MS) {
      clearInterval(state.timer!);
      state.timer = null;
      return;
    }
    void runOnce();
  }, POLL_MS);
  void runOnce();
}

/** Retrato atual (consulta leve do navegador quando o canal ao vivo cai). */
export async function liveSnapshot(): Promise<{ snapshot: LiveSnapshot | null; error: string | null }> {
  ensurePolling();
  if (!state.snapshot && state.running) await Promise.race([state.running, new Promise((resolve) => setTimeout(resolve, 12_000))]);
  return { snapshot: state.snapshot, error: state.snapshot ? null : state.error };
}

/** Assina o canal ao vivo; devolve a função para sair. */
export function subscribeLive(listener: (event: LiveEvent) => void) {
  state.listeners.add(listener);
  ensurePolling();
  return () => {
    state.listeners.delete(listener);
  };
}

/** Só para diagnóstico/testes do relógio: quantos navegadores no canal. */
export const liveListeners = () => state.listeners.size;

