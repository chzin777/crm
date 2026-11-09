"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, Percent, Receipt, ShoppingBag, Store, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { CampaignMetrics } from "@/lib/campaign-metrics";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const dateBr = (day: string) => (day ? day.split("-").reverse().join("/") : "—");
const rate = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "?";

function KpiCard({ icon: Icon, label, value, hint, accent = false, children }: { icon: React.ElementType; label: string; value: string; hint: string; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`soft-pop-in rounded-xl border p-3 ${accent ? "border-[#002187]/15 bg-[#002187]/[0.04] dark:border-[#C4D600]/25 dark:bg-[#C4D600]/[0.06]" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${accent ? "bg-[#002187] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <p className={`text-lg font-bold tabular-nums tracking-tight ${accent ? "text-[#002187] dark:text-[#C4D600]" : "text-slate-900 dark:text-white"}`}>{value}</p>
        {children}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>
    </div>
  );
}

/** Esqueleto com as mesmas dimensões do painel: nada pula quando os números chegam. */
function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Calculando resultados">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard icon={CircleDollarSign} label="Receita gerada" value={brl(metrics.revenue)} hint={`${metrics.orders} pedido(s) no ERP`} accent />
        <KpiCard icon={Percent} label="Taxa de conversão" value={pct(metrics.conversionRate)} hint={`${funnel.converted} de ${funnel.delivered} entregues compraram`} />
        <KpiCard icon={Receipt} label="Ticket médio" value={metrics.averageTicket === null ? "—" : brl(metrics.averageTicket)} hint="por cliente que comprou" />
        <KpiCard icon={roiPositive ? TrendingUp : TrendingDown} label="ROI da campanha" value={metrics.roi === null ? "—" : `${metrics.roi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`} hint={metrics.roi === null ? "sem custo da Meta" : "retorno sobre o custo da Meta"}>
          {metrics.roi !== null && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${roiPositive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300" : "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]"}`}>
              {roiPositive ? "Positivo" : "Negativo"}
            </span>
          )}
        </KpiCard>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:bg-slate-800/40 dark:text-slate-300">
        <span className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>Custo Meta: <strong className="tabular-nums text-slate-900 dark:text-white">{brl(metrics.cost.real)}</strong> real · {brl(metrics.cost.estimated)} estimado</span>
        </span>
        <span className="text-[11px] text-slate-400">
          {categoryLabel ? `Modelo de ${categoryLabel}: ${brl(metrics.unitPrice)}/msg` : "Mensagem livre: sem cobrança"} · vendas até {metrics.windowDays} dia(s) após o envio · ERP até {dateBr(metrics.lastSaleDate ?? "")}
        </span>
      </div>

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
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{metrics.sales.length} pedido{metrics.sales.length === 1 ? "" : "s"}</span>
        </div>
        {metrics.sales.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <span className="relative mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#002187]/[0.06] text-[#002187] dark:bg-[#C4D600]/10 dark:text-[#C4D600]">
              <ShoppingBag className="h-6 w-6" />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#C4D600] dark:border-[#051647]" />
            </span>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Nenhuma compra registrada ainda</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              Vendas do ERP feitas por quem recebeu este envio, até {metrics.windowDays} dia(s) depois, aparecem aqui automaticamente.
            </p>
          </div>
        ) : (
          <ul className="custom-scrollbar max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {metrics.sales.map((sale) => (
              <li key={`${sale.contactId}-${sale.pedido}-${sale.data}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">{initials(sale.nome)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{sale.nome}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-white">{brl(sale.valor)}</p>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{dateBr(sale.data)}</span>
                    <span aria-hidden>·</span>
                    <span>Pedido <strong className="font-semibold text-slate-700 dark:text-slate-200">{sale.pedido || "—"}</strong></span>
                    {sale.loja && <><span aria-hidden>·</span><span className="inline-flex items-center gap-0.5"><Store className="h-3 w-3" />Loja {sale.loja}</span></>}
                    <span aria-hidden>·</span>
                    <span>{sale.itens} {sale.itens === 1 ? "item" : "itens"}</span>
                  </div>
                  {sale.resumo && <p className="mt-1 line-clamp-1 text-[11px] text-slate-400" title={sale.resumo}>{sale.resumo}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
