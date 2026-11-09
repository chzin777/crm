"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { CampaignMetrics } from "@/lib/campaign-metrics";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const dateBr = (day: string) => (day ? day.split("-").reverse().join("/") : "—");
const rate = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
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

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!metrics) return <LoadingSpinner label="Calculando resultados..." className="w-full justify-center py-8" />;

  const { funnel } = metrics;
  const steps = [
    { label: "Disparados", value: funnel.dispatched, from: null as number | null },
    { label: "Entregues", value: funnel.delivered, from: funnel.dispatched },
    { label: "Lidos", value: funnel.read, from: funnel.delivered },
    { label: "Responderam", value: funnel.replied, from: funnel.read },
    { label: "Compraram", value: funnel.converted, from: funnel.delivered },
  ];
  const max = Math.max(1, funnel.dispatched);
  const categoryLabel = metrics.category === "MARKETING" ? "marketing" : metrics.category === "UTILITY" ? "utilidade" : metrics.category ? metrics.category.toLowerCase() : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="Custo (Meta)">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Estimado" value={brl(metrics.cost.estimated)} hint={`${funnel.attempted} destinatário(s)`} />
            <Stat label="Real (entregues)" value={brl(metrics.cost.real)} hint={`${funnel.delivered} entregue(s)`} />
          </div>
          <p className="mt-2 text-[10px] text-slate-400">{categoryLabel ? `Modelo de ${categoryLabel}: ${brl(metrics.unitPrice)} por mensagem.` : "Mensagem livre (janela de 24h): sem cobrança da Meta."}</p>
        </Card>
        <Card title="Financeiro (ERP)">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Receita gerada" value={brl(metrics.revenue)} hint={`${metrics.orders} pedido(s)`} />
            <Stat label="Ticket médio" value={metrics.averageTicket === null ? "—" : brl(metrics.averageTicket)} hint="por cliente convertido" />
            <Stat label="Conversão" value={pct(metrics.conversionRate)} hint={`${funnel.converted} de ${funnel.delivered} entregues`} />
            <Stat label="ROI" value={metrics.roi === null ? "—" : `${metrics.roi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`} hint={metrics.roi === null ? "sem custo de envio" : "(receita − custo) ÷ custo"} />
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Vendas até {metrics.windowDays} dia(s) após o envio. ERP sincronizado até {dateBr(metrics.lastSaleDate ?? "")}.</p>
        </Card>
      </div>

      <Card title="Funil">
        <div className="space-y-1.5">
          {steps.map((step) => {
            const passRate = step.from === null ? null : rate(step.value, step.from);
            return (
              <div key={step.label} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 font-semibold text-slate-700 dark:text-slate-200">{step.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded bg-[#002187] dark:bg-[#C4D600]" style={{ width: `${(step.value / max) * 100}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right font-bold text-slate-900 dark:text-white">{step.value.toLocaleString("pt-BR")}</span>
                <span className="w-14 shrink-0 text-right text-[10px] text-slate-500 dark:text-slate-400">{passRate === null ? "" : pct(passRate)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">A porcentagem é a passagem da etapa anterior; &quot;Compraram&quot; é sobre os entregues.</p>
      </Card>

      <Card title={`Clientes que compraram (${metrics.sales.length} pedido${metrics.sales.length === 1 ? "" : "s"})`}>
        {metrics.sales.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma venda no ERP atribuída a este envio até agora.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-slate-500 dark:text-slate-400">
                <tr><th className="py-1 pr-2">Cliente</th><th className="py-1 pr-2">Data</th><th className="py-1 pr-2">Pedido</th><th className="py-1 pr-2">Loja</th><th className="py-1 text-right">Valor</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {metrics.sales.map((sale) => (
                  <tr key={`${sale.contactId}-${sale.pedido}-${sale.data}`}>
                    <td className="py-1.5 pr-2"><p className="font-semibold text-slate-900 dark:text-white">{sale.nome}</p><p className="text-[10px] text-slate-500">{sale.telefone}</p></td>
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{dateBr(sale.data)}</td>
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{sale.pedido || "—"}</td>
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{sale.loja || "—"}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900 dark:text-white">{brl(sale.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
