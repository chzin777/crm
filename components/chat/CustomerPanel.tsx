"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarClock, Check, Glasses, Megaphone, Plus, ShoppingBag, X } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import type { CustomerHistory, FollowUpItem } from "@/lib/chat/types";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (value: string | null) => (value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const CAMPAIGN_STATUS: Record<string, string> = { queued: "Na fila", sent: "Enviada", delivered: "Entregue", read: "Lida", replied: "Respondeu", failed: "Falhou" };

function Section({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <h4 className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

const empty = (text: string) => <p className="text-xs text-slate-400 dark:text-slate-500">{text}</p>;

type Props = {
  conversationId: string;
  canWrite: boolean;
  /** Muda quando um lembrete é criado fora do painel, para recarregar a lista. */
  refreshKey: number;
  onNewFollowUp: () => void;
  onChanged: () => void;
  onClose: () => void;
};

/** Painel direito do /chat: lembretes de retorno e visão do cliente no ERP. */
export function CustomerPanel({ conversationId, canWrite, refreshKey, onNewFollowUp, onChanged, onClose }: Props) {
  const toast = useToast();
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUpItem[] | null>(null);

  const loadFollowUps = useCallback(async () => {
    const response = await fetch(`/api/chat/conversations/${conversationId}/follow-ups`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) setFollowUps(((await response.json()) as { items: FollowUpItem[] }).items);
    else setFollowUps([]);
  }, [conversationId]);

  useEffect(() => {
    void loadFollowUps();
  }, [loadFollowUps, refreshKey]);

  useEffect(() => {
    let active = true;
    setHistory(null);
    setHistoryError(false);
    fetch(`/api/chat/conversations/${conversationId}/history`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as CustomerHistory;
        if (active) setHistory(data);
      })
      .catch((error) => {
        console.error("[chat] histórico do cliente:", error);
        if (active) setHistoryError(true);
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  const finish = async (item: FollowUpItem, status: "COMPLETED" | "CANCELLED") => {
    const response = await fetch(`/api/chat/follow-ups/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      toast.error("Lembrete não atualizado", data?.error ?? "Tente de novo.");
      return;
    }
    toast.success(status === "COMPLETED" ? "Retorno concluído" : "Lembrete cancelado");
    void loadFollowUps();
    onChanged();
  };

  const pending = followUps?.filter((item) => item.status === "PENDING") ?? [];
  const done = followUps?.filter((item) => item.status !== "PENDING") ?? [];

  return (
    <aside aria-label="Dados do cliente" className="absolute inset-y-0 right-0 z-30 flex w-80 max-w-full flex-col border-l border-slate-200 bg-white shadow-xl lg:static lg:shrink-0 lg:shadow-none dark:border-slate-800 dark:bg-[#07194f]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cliente</h3>
        <button type="button" onClick={onClose} title="Fechar painel" aria-label="Fechar painel" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section
          icon={<CalendarClock className="h-4 w-4" />}
          title="Retornos"
          action={canWrite && (
            <button type="button" onClick={onNewFollowUp} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-[#002187] hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-white/10">
              <Plus className="h-3.5 w-3.5" />Agendar
            </button>
          )}
        >
          {!followUps ? <LoadingSpinner label="Carregando retornos..." size={20} /> : pending.length === 0 ? empty("Nenhum retorno pendente.") : (
            <ul className="space-y-2">
              {pending.map((item) => {
                const overdue = new Date(item.dueAt).getTime() <= Date.now();
                return (
                  <li key={item.id} className={`rounded-lg border px-2.5 py-2 ${overdue ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-950/30" : "border-slate-200 dark:border-slate-700"}`}>
                    <p className={`text-xs font-semibold ${overdue ? "text-rose-700 dark:text-rose-300" : "text-slate-800 dark:text-slate-100"}`}>
                      {overdue ? "Atrasado · " : ""}{dateTime(item.dueAt)}
                    </p>
                    {item.note && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{item.note}</p>}
                    <p className="mt-0.5 text-[11px] text-slate-400">{item.mine ? "Seu lembrete" : item.userName}</p>
                    {canWrite && (
                      <div className="mt-1.5 flex gap-1">
                        <button type="button" onClick={() => void finish(item, "COMPLETED")} className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#C4D600] px-2 py-0.5 text-[11px] font-semibold text-[#051647] hover:opacity-90">
                          <Check className="h-3 w-3" />Concluir
                        </button>
                        <button type="button" onClick={() => void finish(item, "CANCELLED")} className="cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
                          Cancelar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {done.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400">
              Último: {done[0].status === "COMPLETED" ? "concluído" : "cancelado"} em {dateTime(done[0].completedAt ?? done[0].dueAt)}
            </p>
          )}
        </Section>

        {historyError ? (
          <div className="px-4 py-6">{empty("Não foi possível carregar os dados do ERP.")}</div>
        ) : !history ? (
          <div className="flex justify-center py-8"><LoadingSpinner label="Buscando no ERP..." size={24} /></div>
        ) : (
          <>
            <Section icon={<Glasses className="h-4 w-4" />} title="Receita">
              {history.prescription.renewalDue && (
                <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Passou de 1 ano: bom momento para sugerir um novo exame de vista.
                </p>
              )}
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <dt className="text-slate-500 dark:text-slate-400">Últimas lentes de grau</dt>
                <dd className="text-right font-medium text-slate-800 dark:text-slate-100">{day(history.prescription.lastLensPurchase)}</dd>
                {history.prescription.lensType && (
                  <>
                    <dt className="text-slate-500 dark:text-slate-400">Tipo</dt>
                    <dd className="truncate text-right font-medium capitalize text-slate-800 dark:text-slate-100">{history.prescription.lensType.toLowerCase()}</dd>
                  </>
                )}
                {history.prescription.expiry && (
                  <>
                    <dt className="text-slate-500 dark:text-slate-400">Validade da receita</dt>
                    <dd className="text-right font-medium text-slate-800 dark:text-slate-100">{day(history.prescription.expiry)}</dd>
                  </>
                )}
              </dl>
            </Section>

            <Section icon={<ShoppingBag className="h-4 w-4" />} title="Compras">
              <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
                {[
                  { label: "Compras", value: String(history.purchases) },
                  { label: "Total", value: money(history.totalSpent) },
                  { label: "Última", value: day(history.lastPurchaseDate) },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-slate-50 px-1 py-1.5 dark:bg-white/5">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{stat.value}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
              {history.orders.length === 0 ? empty("Nenhum pedido no ERP para este cliente.") : (
                <ul className="space-y-1.5">
                  {history.orders.map((order) => (
                    <li key={`${order.orderNumber}-${order.date}`} title={order.summary} className="rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">Pedido {order.orderNumber || "s/n"}</span>
                        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{money(order.total)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="truncate">{day(order.date)} · {order.store || "Loja não informada"}</span>
                        <span className="shrink-0">{order.status}{order.status === "Venda" ? (order.invoice ? " · NF " + order.invoice : " · sem NF") : ""}</span>
                      </div>
                      {order.summary && <p className="mt-0.5 truncate text-[11px] text-slate-400">{order.summary}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={<Megaphone className="h-4 w-4" />} title="Campanhas recebidas">
              {history.campaigns.length === 0 ? empty("Nenhuma campanha enviada a este cliente.") : (
                <ul className="space-y-1.5">
                  {history.campaigns.map((campaign, index) => (
                    <li key={`${campaign.name}-${campaign.sentAt ?? index}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{campaign.name}</span>
                        <span className="text-[11px] text-slate-400">{campaign.sentAt ? dateTime(campaign.sentAt) : "Não enviada"}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${campaign.status === "failed" ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : campaign.status === "replied" ? "bg-[#C4D600]/30 text-[#051647] dark:text-[#C4D600]" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                        {CAMPAIGN_STATUS[campaign.status] ?? campaign.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
