"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Percent, Receipt, Send, ShoppingBag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { formatPhone } from "@/lib/chat/phone";
import type { CampaignMetrics, ConvertedSale } from "@/lib/campaign-metrics";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const dateBr = (day: string) => (day ? day.split("-").reverse().join("/") : "—");
const rate = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

const timeBr = (iso: string | null) => {
  if (!iso) return "—";
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}/${part("month")} ${part("hour")}:${part("minute")}`;
};
const elapsed = (from: string, to: string | null) => {
  if (!to) return null;
  const minutes = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return `+${days ? `${days}d ` : ""}${days || hours ? `${hours}h ` : ""}${rest}m`;
};
const SALES_PAGE = 20;

/** Uma venda atribuída: cliente, pedido no ERP, linha do tempo envio → registro e atalho para a conversa. */
function SaleItem({ sale }: { sale: ConvertedSale }) {
  const gap = elapsed(sale.enviadoEm, sale.registradoEm);
  const details = [
    sale.notaFiscal ? `Faturado · NF ${sale.notaFiscal}` : "Aguardando faturamento",
    sale.loja ? `Loja ${sale.loja}` : "",
    `${sale.itens} ${sale.itens === 1 ? "item" : "itens"}`,
    sale.resumo ?? "",
  ].filter(Boolean).join(" · ");
  return (
    <li className="grid gap-1.5 px-4 py-3 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30" title={details}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{sale.nome}</span>
          <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">{formatPhone(sale.telefone)}</span>
        </p>
        <p className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{brl(sale.valor)}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">#{sale.pedido || "—"}</span>
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
          <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" />Disparo: {timeBr(sale.enviadoEm)}</span>
          <span aria-hidden className="text-slate-300 dark:text-slate-600">→</span>
          <span className="inline-flex items-center gap-1"><ShoppingBag className="h-3 w-3" />Venda ERP: {sale.registradoEm ? timeBr(sale.registradoEm) : dateBr(sale.data)}</span>
          {gap && <span className="text-slate-400 dark:text-slate-500">({gap})</span>}
        </p>
        {sale.conversationId ? (
          <Link href={`/chat?c=${sale.conversationId}`} className="inline-flex shrink-0 cursor-pointer items-center gap-1 font-medium text-[#002187] hover:underline dark:text-[#C4D600]">
            Ver chat<ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : (
          <span className="shrink-0 text-slate-400">Sem conversa</span>
        )}
      </div>
    </li>
  );
}

function KpiCard({ icon: Icon, label, value, hint, accent = false, onClick, children }: { icon: React.ElementType; label: string; value: string; hint: string; accent?: boolean; onClick?: () => void; children?: React.ReactNode }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={onClick ? "Ver conversões" : undefined} className={`soft-pop-in rounded-xl border p-3 text-left ${onClick ? "cursor-pointer transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#002187]" : ""} ${accent ? "border-[#002187]/15 bg-[#002187]/[0.04] dark:border-[#C4D600]/25 dark:bg-[#C4D600]/[0.06]" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${accent ? "bg-[#002187] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <p className={`text-lg font-bold tabular-nums tracking-tight ${accent ? "text-[#002187] dark:text-[#C4D600]" : "text-slate-900 dark:text-white"}`}>{value}</p>
        {children}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>
    </Tag>
  );
}

/** Esqueleto com as mesmas dimensões do painel: nada pula quando os números chegam. */
function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Calculando resultados">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-[92px] rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="h-[92px] rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40" />
        ))}
      </div>
      <div className="h-[58px] rounded-xl bg-slate-50 dark:bg-slate-800/40" />
      <div className="h-[236px] rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40" />
      <div className="h-[160px] rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40" />
    </div>
  );
}

function passTone(value: number | null) {
  if (value === null) return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  if (value >= 70) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300";
  if (value >= 30) return "bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300";
  return "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]";
}

/** Custo, funil (disparados → compraram) e vendas do ERP atribuídas a um disparo. */
export function CampaignMetricsPanel({ type, id }: { type: "bulk" | "campaign"; id: string }) {
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [error, setError] = useState("");
  const [showSales, setShowSales] = useState(false);
  const [visibleSales, setVisibleSales] = useState(SALES_PAGE);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/metrics/campaign?type=${type}&id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: CampaignMetrics; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.data) setError(body?.error ?? "Não foi possível carregar os resultados.");
        else setMetrics(body.data);
      })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar os resultados."); });
    return () => { cancelled = true; };
  }, [type, id]);

  if (error) return <p role="alert" className="rounded-xl border border-[#F7915E]/40 bg-[#F7915E]/10 p-3 text-sm text-[#9a3d12] dark:text-[#F7915E]">{error}</p>;
  if (!metrics) return <PanelSkeleton />;

  const { funnel } = metrics;
  const steps = [
    { label: "Disparados", value: funnel.dispatched, from: null as number | null, base: "" },
    { label: "Entregues", value: funnel.delivered, from: funnel.dispatched, base: "dos disparados" },
    { label: "Lidos", value: funnel.read, from: funnel.delivered, base: "dos entregues" },
    { label: "Responderam", value: funnel.replied, from: funnel.read, base: "dos lidos" },
    { label: "Compraram", value: funnel.converted, from: funnel.delivered, base: "dos entregues" },
  ];
  const max = Math.max(1, funnel.dispatched);
  const categoryLabel = metrics.category === "MARKETING" ? "marketing" : metrics.category === "UTILITY" ? "utilidade" : metrics.category ? metrics.category.toLowerCase() : null;
  const roiPositive = metrics.roi !== null && metrics.roi >= 0;
  const openSales = () => { setVisibleSales(SALES_PAGE); setShowSales(true); };
  const emptySales = (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <span className="relative mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#002187]/[0.06] text-[#002187] dark:bg-[#C4D600]/10 dark:text-[#C4D600]">
        <ShoppingBag className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#C4D600] dark:border-[#051647]" />
      </span>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Nenhuma compra registrada ainda</p>
      <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
        Nenhuma venda do ERP feita por quem recebeu este envio, depois da mensagem e até {metrics.windowDays} dia(s) após, foi identificada.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <section aria-label="Resultado financeiro" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <KpiCard icon={Wallet} label="Gasto (R$)" value={brl(metrics.cost.real)} hint={`custo Meta das mensagens entregues · ${brl(metrics.cost.estimated)} estimado`} />
        <KpiCard icon={CircleDollarSign} label="Vendido (R$)" value={brl(metrics.revenue)} hint={`${metrics.orders} pedido(s) no ERP · ver detalhes`} accent onClick={openSales} />
        <KpiCard
          icon={roiPositive ? TrendingUp : TrendingDown}
          label="Retorno financeiro (%)"
          value={metrics.roi === null ? "—" : `${metrics.roi >= 0 ? "+" : ""}${pct(metrics.roi)}`}
          hint={metrics.roas === null ? "sem gasto na Meta: retorno não se aplica" : `(vendido − gasto) ÷ gasto · ROAS ${metrics.roas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`}
        >
          {metrics.roi !== null && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${roiPositive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300" : "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]"}`}>
              {roiPositive ? "Lucro" : "Prejuízo"}
            </span>
          )}
        </KpiCard>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard icon={Percent} label="Conversão de leads" value={pct(metrics.conversionRate)} hint={`${funnel.converted} de ${funnel.delivered} entregues compraram`} onClick={openSales} />
        <KpiCard icon={Receipt} label="Ticket médio" value={metrics.averageTicket === null ? "—" : brl(metrics.averageTicket)} hint="por cliente que comprou" />
      </div>

      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
        {categoryLabel ? `Modelo de ${categoryLabel}: ${brl(metrics.unitPrice)}/msg` : "Mensagem livre: sem cobrança"} · vendas até {metrics.windowDays} dia(s) após o envio · ERP até {dateBr(metrics.lastSaleDate ?? "")}
      </p>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label="Funil de conversão">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Funil de conversão</h3>
          <span className="text-[11px] text-slate-400">% = passagem da etapa anterior</span>
        </div>
        <ol className="space-y-2.5">
          {steps.map((step, index) => {
            const passRate = step.from === null ? null : rate(step.value, step.from);
            const lost = step.from === null ? 0 : Math.max(0, step.from - step.value);
            const width = (step.value / max) * 100;
            return (
              <li key={step.label} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-xs sm:grid-cols-[104px_1fr_auto]">
                <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{index + 1}</span>
                  {step.label}
                </span>
                <div className="relative h-6 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-lg transition-all duration-500 ease-out ${index === steps.length - 1 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-[#002187] to-[#2a4fd6] dark:from-[#C4D600] dark:to-[#9fb000]"}`}
                    style={{ width: `${step.value > 0 ? Math.max(width, 2) : 0}%`, opacity: 1 - index * 0.1 }}
                  />
                  <span className={`absolute inset-y-0 left-2 flex items-center text-[11px] font-bold tabular-nums ${width > 18 ? "text-white dark:text-[#051647]" : "text-slate-700 dark:text-slate-200"}`} style={width > 18 ? undefined : { left: `calc(${Math.max(width, 0)}% + 8px)` }}>
                    {step.value.toLocaleString("pt-BR")}
                  </span>
                </div>
                <span className="flex w-[104px] flex-col items-end gap-0.5">
                  {passRate === null ? <span className="text-[10px] text-slate-400">base</span> : (
                    <>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${passTone(passRate)}`} title={`${pct(passRate)} ${step.base}`}>{pct(passRate)}</span>
                      {lost > 0 && <span className="text-[10px] tabular-nums text-slate-400">−{lost.toLocaleString("pt-BR")} {step.base}</span>}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700" aria-label="Pedidos convertidos">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pedidos convertidos (ERP)</h3>
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{metrics.sales.length} pedido{metrics.sales.length === 1 ? "" : "s"}</span>
            {metrics.sales.length > 0 && (
              <button type="button" onClick={openSales} className="cursor-pointer text-[11px] font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">Ver conversões</button>
            )}
          </span>
        </div>
        {metrics.sales.length === 0 ? emptySales : (
          <ul className="custom-scrollbar max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {metrics.sales.slice(0, 5).map((sale) => <SaleItem key={`${sale.contactId}-${sale.pedido}-${sale.data}`} sale={sale} />)}
          </ul>
        )}
        {metrics.sales.length > 5 && (
          <button type="button" onClick={openSales} className="w-full cursor-pointer border-t border-slate-100 px-4 py-2 text-xs font-semibold text-[#002187] hover:bg-slate-50 dark:border-slate-800 dark:text-[#C4D600] dark:hover:bg-slate-800/40">
            Ver todas as {metrics.sales.length} conversões
          </button>
        )}
      </section>

      {showSales && (
        <EntityDialog
          titleId="campaign-conversions-title"
          title="Conversões da campanha"
          description={`${metrics.sales.length} pedido(s) · ${brl(metrics.revenue)} · venda depois do disparo e até ${metrics.windowDays} dia(s) após o envio`}
          onClose={() => setShowSales(false)}
          size="lg"
        >
          {metrics.sales.length === 0 ? emptySales : (
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {metrics.sales.slice(0, visibleSales).map((sale) => <SaleItem key={`${sale.contactId}-${sale.pedido}-${sale.data}`} sale={sale} />)}
              </ul>
              {visibleSales < metrics.sales.length && (
                <button type="button" onClick={() => setVisibleSales((count) => count + SALES_PAGE)} className="mt-3 w-full cursor-pointer rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/40">
                  Carregar mais ({metrics.sales.length - visibleSales} restantes)
                </button>
              )}
            </div>
          )}
        </EntityDialog>
      )}
    </div>
  );
}
