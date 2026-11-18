import { shiftDate, type TimeUnit, isTimeUnit } from "@/lib/automations/nodes";

/**
 * Regras puras dos gatilhos do ERP VMSet (/automacoes): datas no fuso de Brasília, filtros de venda/parcela,
 * aniversário com os formatos do cadastro, chaves de deduplicação e variáveis entregues ao fluxo.
 */

const TZ = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

/** Dia (YYYY-MM-DD) em Brasília. */
export function brDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Hora (0-23) em Brasília. */
export function brHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(date)) % 24;
}

/** Soma/subtrai dias, meses ou anos a um dia YYYY-MM-DD (calendário). */
export function shiftDay(day: string, amount: number, unit: TimeUnit, sign: 1 | -1): string {
  return shiftDate(new Date(`${day}T12:00:00Z`), amount, unit, sign).toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
export const brDate = (day: string | null | undefined) => (day && /^\d{4}-\d{2}-\d{2}/.test(day) ? day.slice(0, 10).split("-").reverse().join("/") : "");
export const brMoney = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Quantidade + unidade do nó (dias por padrão). */
export function nodeDuration(config: Record<string, unknown>, fallback: TimeUnit = "days"): { amount: number; unit: TimeUnit } {
  return { amount: Math.max(0, Number(config.amount) || 0), unit: isTimeUnit(config.unit) ? config.unit : fallback };
}

// ---------------------------------------------------------------- Vendas

export type ErpSale = {
  sourceKey: string;
  store: string;
  orderNumber: string;
  orderDate: string;
  /** Primeira vez que o espelho viu a venda (precisão de minutos para "Tempo após a venda"). */
  seenAt: Date;
  total: number;
  items: string;
  categories: string;
  seller: string;
  priorOrders: number;
};

/** Momento da venda: a detecção pelo espelho quando é do mesmo período; vendas antigas usam o meio-dia do pedido. */
export function saleMoment(sale: Pick<ErpSale, "orderDate" | "seenAt">): Date {
  const noon = new Date(`${sale.orderDate}T15:00:00Z`);
  return sale.seenAt.getTime() - noon.getTime() < 2 * DAY_MS ? sale.seenAt : noon;
}

/** Filtros do nó: tipo de cliente, valor mínimo, loja e categoria/produto. */
export function saleMatches(config: Record<string, unknown>, sale: ErpSale): boolean {
  const min = Number(config.minAmount) || 0;
  if (min > 0 && Math.abs(sale.total) < min) return false;
  const store = plain(String(config.store ?? ""));
  if (store && !plain(sale.store).includes(store)) return false;
  const category = plain(String(config.category ?? ""));
  if (category && !plain(`${sale.categories} ${sale.items}`).includes(category)) return false;
  if (config.customerType === "first" && sale.priorOrders > 0) return false;
  if (config.customerType === "repeat" && sale.priorOrders === 0) return false;
  return true;
}

export const saleKey = (sale: Pick<ErpSale, "store" | "orderNumber" | "sourceKey">) => `venda:${sale.store}-${sale.orderNumber}-${sale.sourceKey}`;

export function saleVars(sale: ErpSale): Record<string, string> {
  return {
    "venda.numero": sale.orderNumber,
    "venda.valor": brMoney(Math.abs(sale.total)),
    "venda.loja": sale.store,
    "venda.data": brDate(sale.orderDate),
    "venda.itens": sale.items.slice(0, 300),
    "venda.vendedor": sale.seller,
    "venda.tipo_cliente": sale.priorOrders > 0 ? "recorrente" : "primeira compra",
  };
}

// ---------------------------------------------------------------- Financeiro e laboratório (API do VMSet)

export type ErpTitle = { id: string; cpf: string; name: string; phone: string; number: string; installment: string; due: string | null; amount: number | null; paidAt: string | null; paid: number | null; store: string; invoice: string; remaining: number };
export type ErpLabOrder = { id: string; cpf: string; name: string; phone: string; protocol: string; date: string | null; store: string };

export const openValue = (title: Pick<ErpTitle, "amount" | "paid">) => Math.max(0, (title.amount ?? 0) - (title.paid ?? 0));

export function titleMatches(config: Record<string, unknown>, title: ErpTitle, value: number): boolean {
  const min = Number(config.minAmount) || 0;
  if (min > 0 && value < min) return false;
  const store = plain(String(config.store ?? ""));
  return !store || plain(title.store).includes(store);
}

export function titleVars(title: ErpTitle, today: string): Record<string, string> {
  const due = title.due ?? "";
  return {
    "financeiro.titulo": title.number,
    "financeiro.parcela": title.installment,
    "financeiro.vencimento": brDate(due),
    "financeiro.valor_aberto": brMoney(openValue(title)),
    "financeiro.valor_parcela": brMoney(title.amount ?? 0),
    "financeiro.dias_atraso": due ? String(Math.max(0, daysBetween(due, today))) : "",
    "financeiro.dias_para_vencer": due ? String(Math.max(0, daysBetween(today, due))) : "",
    "financeiro.valor_pago": brMoney(title.paid ?? 0),
    "financeiro.data_pagamento": brDate(title.paidAt),
    "financeiro.parcelas_restantes": String(title.remaining),
    "financeiro.loja": title.store,
  };
}

export function labVars(order: ErpLabOrder): Record<string, string> {
  return { "os.numero": order.id, "os.protocolo": order.protocol, "os.loja": order.store, "os.data_pronta": brDate(order.date) };
}

// ---------------------------------------------------------------- Ciclo de vida (cadastro)

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const MONTH_ABBR = Object.fromEntries(Object.entries(MONTHS).map(([name, number]) => [number, name]));

/** Data de nascimento nos formatos do cadastro: 25/06/1980, 1980-06-25, "Wed Jun 25 1980 00:00:00 GMT+0000". */
export function parseBirthDate(raw: string | null | undefined): { year: number; month: number; day: number } | null {
  const text = String(raw ?? "").trim();
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  let result = match ? { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) } : null;
  if (!result && (match = text.match(/^(\d{4})-(\d{2})-(\d{2})/))) result = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (!result && (match = text.match(/^\w{3} (\w{3}) (\d{1,2}) (\d{4})/)) && MONTHS[match[1]]) result = { month: MONTHS[match[1]], day: Number(match[2]), year: Number(match[3]) };
  if (!result || result.month < 1 || result.month > 12 || result.day < 1 || result.day > 31 || result.year < 1900) return null;
  return result;
}

/** Padrões LIKE do banco para encontrar quem nasceu em mês/dia (nos três formatos do cadastro). */
export function birthdayLikePatterns(month: number, day: number): string[] {
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return [`${dd}/${mm}/%`, `%-${mm}-${dd}%`, `___ ${MONTH_ABBR[month]} ${dd} %`];
}

/** Dia (mês/dia) que o gatilho procura: hoje + X dias. 29/02 vira 28/02 em ano não bissexto. */
export function birthdayTarget(today: string, daysBefore: number): { year: number; month: number; day: number } {
  const target = new Date(Date.parse(`${today}T12:00:00Z`) + Math.max(0, Math.floor(daysBefore)) * DAY_MS);
  return { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate() };
}

export function birthdayMatches(birth: { month: number; day: number }, target: { year: number; month: number; day: number }): boolean {
  if (birth.month === target.month && birth.day === target.day) return true;
  const leap = (target.year % 4 === 0 && target.year % 100 !== 0) || target.year % 400 === 0;
  return !leap && birth.month === 2 && birth.day === 29 && target.month === 2 && target.day === 28;
}
