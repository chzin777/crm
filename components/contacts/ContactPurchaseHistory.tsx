"use client";

import { useEffect, useState } from "react";
import { ChevronDown, CircleDollarSign, CreditCard, Receipt, ShoppingBag, Store, TrendingUp, Undo2, UserRound } from "lucide-react";
import type { PurchaseOrder, PurchaseSummary } from "@/lib/purchase-history";

/** Data do ERP em dd/mm/aaaa (aceita ISO, dd/mm/aaaa ou data do JS). */
export function formatContactDate(value: string | null | undefined) {
  if (!value) return "—";
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  if (/^(\d{2})\/(\d{2})\/(\d{4})$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  return value;
}

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (value: number) => (Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
const PAGE = 15;

type HistoryState = { contactId: string; orders: PurchaseOrder[]; summary: PurchaseSummary | null };

/** Aba Histórico da ficha do cliente: compras do ERP VMSet (loja, pedido, vendedor, itens, valores e pagamento). Usada na ficha completa e no modal do /chat. */
export function ContactPurchaseHistory({ contactId }: { contactId: string }) {
  const [state, setState] = useState<HistoryState | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/contacts/${encodeURIComponent(contactId)}/purchases`, { signal: controller.signal })
      .then((res) => res.json())
      .then((result: { orders?: PurchaseOrder[]; summary?: PurchaseSummary }) => {
        const orders = Array.isArray(result.orders) ? result.orders : [];
        setState({ contactId, orders, summary: result.summary ?? null });
        setOpen(new Set(orders[0] ? [orders[0].id] : []));
        setLimit(PAGE);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ contactId, orders: [], summary: null });
      });
    return () => controller.abort();
  }, [contactId]);

  const current = state?.contactId === contactId ? state : null;
  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Histórico de compras</h3>
      {current === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Carregando compras">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
          </div>
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : current.orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
          <CircleDollarSign className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Nenhuma compra registrada</p>
        </div>
      ) : (
        <>
          {current.summary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryCard icon={CircleDollarSign} label="Total gasto" value={brl(current.summary.totalGasto)} />
              <SummaryCard icon={ShoppingBag} label="Pedidos" value={String(current.summary.pedidos)} />
              <SummaryCard icon={TrendingUp} label="Ticket médio" value={brl(current.summary.ticketMedio)} />
              <SummaryCard icon={Store} label="Loja mais frequente" value={current.summary.lojaFrequente ?? "—"} />
            </div>
          )}
          <div className="space-y-2">
            {current.orders.slice(0, limit).map((order) => {
              const expanded = open.has(order.id);
              const isReturn = order.tipo === "devolucao";
              return (
                <div key={order.id} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40">
                  <button type="button" onClick={() => toggle(order.id)} aria-expanded={expanded} className="flex w-full min-w-0 items-start gap-3 px-3 py-2.5 text-left cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[#051647] dark:text-[#C4D600]">
                        <Store className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{order.loja}</span>
                        {isReturn && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-700 dark:bg-red-500/10 dark:text-red-300"><Undo2 className="h-3 w-3" />Devolução</span>}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <span>{formatContactDate(order.data)}</span>
                        {order.pedido && <span className="inline-flex items-center gap-1"><Receipt className="h-3 w-3" />Pedido {order.pedido}{order.notas.length ? ` · NF ${order.notas.join(", ")}` : ""}</span>}
                        {order.vendedor && <span className="inline-flex min-w-0 items-center gap-1 break-words"><UserRound className="h-3 w-3 shrink-0" />{order.vendedor}</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-xs font-bold ${isReturn ? "text-red-600 dark:text-red-300" : "text-slate-900 dark:text-white"}`}>{isReturn ? "-" : ""}{brl(order.valorLiquido)}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-400">{order.itens.length} {order.itens.length === 1 ? "item" : "itens"}<ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} /></p>
                    </div>
                  </button>
                  {expanded && (
                    <div className="space-y-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
                      <ul className="space-y-1.5">
                        {order.itens.map((item, index) => (
                          <li key={index} className="flex min-w-0 items-start justify-between gap-3 text-[11px]">
                            <div className="min-w-0 flex-1">
                              <p className="break-words font-medium text-slate-800 dark:text-slate-100">{item.marca ? `${item.marca} · ` : ""}{item.referencia || item.descricao}</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                {[item.categoria, item.subcategoria].filter(Boolean).join(" · ")}
                                {item.valorUnitario > 0 && <> · {qty(item.quantidade)} x {brl(item.valorUnitario)}</>}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-semibold text-slate-800 dark:text-slate-100">{item.valorTotal > 0 ? brl(item.valorTotal) : ""}</p>
                              {item.desconto > 0 && <p className="text-[10px] text-emerald-600 dark:text-emerald-400">desc. {brl(item.desconto)}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-2 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <span className="inline-flex min-w-0 items-center gap-1 break-words"><CreditCard className="h-3 w-3 shrink-0" />{order.pagamento.length ? order.pagamento.join(" | ") : "Pagamento não informado"}</span>
                        <span>{order.desconto > 0 ? `Desconto ${brl(order.desconto)} · ` : ""}<strong className="text-slate-800 dark:text-slate-100">Líquido {brl(order.valorLiquido)}</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {current.orders.length > limit && (
            <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-slate-800 cursor-pointer">
              Ver mais compras ({current.orders.length - limit})
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400"><Icon className="h-3 w-3" />{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
