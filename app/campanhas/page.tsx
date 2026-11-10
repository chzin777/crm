"use client";

import { useEffect, useState } from "react";
import { CheckCheck, Eye, MessageCircleReply, Send, ShoppingBag, TrendingUp } from "lucide-react";
import { CampaignsView } from "@/app/campanhas/campaigns-view";
import { BulkDispatchHistory } from "@/components/BulkDispatchHistory";
import { usePermissions } from "@/hooks/usePermissions";

type Overview = {
  campaigns: number;
  funnel: { dispatched: number; delivered: number; read: number; replied: number; converted: number };
  revenue: number;
  orders: number;
  cost: number;
  roi: number | null;
  windowDays: number;
};

type Tab = "campanhas" | "envios";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const int = (value: number) => value.toLocaleString("pt-BR");
const rate = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");

/** Funil somado de todas as campanhas e envios em massa, com o retorno em vendas do ERP. */
function CampaignsOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/metrics/campaigns-overview", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { data?: Overview; error?: string } | null;
        if (!response.ok || !body?.data) throw new Error(body?.error ?? "Não foi possível carregar o resumo.");
        setData(body.data);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Não foi possível carregar o resumo.");
      });
    return () => controller.abort();
  }, []);

  const steps = data
    ? [
        { label: "Enviados", value: data.funnel.dispatched, hint: `${int(data.campaigns)} disparos`, icon: Send },
        { label: "Entregues", value: data.funnel.delivered, hint: rate(data.funnel.delivered, data.funnel.dispatched), icon: CheckCheck },
        { label: "Lidos", value: data.funnel.read, hint: rate(data.funnel.read, data.funnel.delivered), icon: Eye },
        { label: "Responderam", value: data.funnel.replied, hint: rate(data.funnel.replied, data.funnel.delivered), icon: MessageCircleReply },
      ]
    : [];
  const top = Math.max(1, data?.funnel.dispatched ?? 1);

  return (
    <section aria-label="Funil consolidado" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Funil de todos os disparos</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Campanhas e envios em massa somados. Vendas do ERP contam quando o cliente compra até {data?.windowDays || "—"} dias depois de receber.
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>
      ) : !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <article key={step.label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400"><Icon className="h-3.5 w-3.5" />{step.label}</p>
                <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{int(step.value)}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-[#002187] dark:bg-[#C4D600]" style={{ width: `${Math.round((step.value / top) * 100)}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{step.hint}</p>
              </article>
            );
          })}
          <article className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"><ShoppingBag className="h-3.5 w-3.5" />Vendas no ERP</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{brl(data.revenue)}</p>
            <p className="mt-1 text-[10px] text-emerald-700/80 dark:text-emerald-300/80">{int(data.funnel.converted)} clientes · {int(data.orders)} pedidos</p>
          </article>
          <article className="rounded-xl bg-[#C4D600]/15 p-3 dark:bg-[#C4D600]/10">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#051647] dark:text-[#C4D600]"><TrendingUp className="h-3.5 w-3.5" />ROI</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-[#051647] dark:text-white">
              {data.roi === null ? "—" : `${(data.roi * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Custo Meta {data.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          </article>
        </div>
      )}
    </section>
  );
}

/** Tela única de campanhas e disparos: criação, lotes em andamento, histórico e funil consolidado. */
export default function CampanhasPage() {
  const { modules } = usePermissions();
  const canCampaigns = modules?.campanhas === true;
  const canBulk = modules?.disparos === true || canCampaigns;
  const [tab, setTab] = useState<Tab>("campanhas");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("aba") === "envios") setTab("envios");
  }, []);

  const current: Tab = !canCampaigns && modules !== null ? "envios" : tab;
  const changeTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "envios") url.searchParams.set("aba", "envios");
    else url.searchParams.delete("aba");
    window.history.replaceState(null, "", url);
  };

  const tabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: "campanhas", label: "Campanhas", visible: canCampaigns || modules === null },
    { id: "envios", label: "Envios em massa", visible: canBulk || modules === null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Campanhas e disparos</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Crie campanhas, acompanhe os lotes em andamento, o histórico e o retorno em vendas.</p>
        </div>
        <div role="tablist" aria-label="Seções" className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
          {tabs.filter((item) => item.visible).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={current === item.id}
              onClick={() => changeTab(item.id)}
              className={`h-9 rounded-lg px-4 text-sm font-semibold transition-colors cursor-pointer ${current === item.id ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <CampaignsOverview />

      <div role="tabpanel">
        {current === "campanhas" ? <CampaignsView /> : <BulkDispatchHistory />}
      </div>
    </div>
  );
}
