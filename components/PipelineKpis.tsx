"use client";
import { AlarmClock, Briefcase, CircleDollarSign, Percent, Repeat, Trophy, UserPlus } from "lucide-react";
import type { PipelineKpis as Kpis } from "@/lib/pipeline-kpis";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: value >= 10_000 ? 0 : 2 });
const percent = (value: number | null) => (value === null ? "—" : `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

type Item = { label: string; value: string; hint: string; detail?: string; icon: React.ElementType; tone: "blue" | "lime" | "orange" | "navy" };

const TONE: Record<Item["tone"], string> = {
  blue: "bg-[#002187]/10 text-[#002187] dark:bg-[#002187]/40 dark:text-white",
  lime: "bg-[#C4D600]/25 text-[#051647] dark:bg-[#C4D600]/20 dark:text-[#C4D600]",
  orange: "bg-[#F7915E]/20 text-[#b4531f] dark:bg-[#F7915E]/20 dark:text-[#F7915E]",
  navy: "bg-[#051647]/10 text-[#051647] dark:bg-white/10 dark:text-white",
};

/** Faixa de indicadores no topo de Pipelines (pipeline ativa). */
export function PipelineKpis({ kpis, pipelineId }: { kpis: Kpis; pipelineId: string }) {
  const sales = pipelineId === "novos";
  const items: Item[] = sales
    ? [
      { label: "Negócios abertos", value: String(kpis.open), hint: "Negócios fora da etapa Ganho.", detail: `${kpis.newLast30} novos em 30 dias`, icon: Briefcase, tone: "blue" },
      { label: "Valor em negociação", value: money(kpis.openValue), hint: "Soma do valor estimado dos negócios abertos.", icon: CircleDollarSign, tone: "navy" },
      { label: "Ganhos no mês", value: String(kpis.wonMonth), hint: "Negócios que chegaram em Ganho neste mês (faturado no ERP ou estimado).", detail: kpis.wonMonth ? `${money(kpis.wonMonthValue)}${kpis.averageTicket ? ` · ticket ${money(kpis.averageTicket)}` : ""}` : "Nenhum ainda", icon: Trophy, tone: "lime" },
      { label: "Taxa de conversão", value: percent(kpis.conversion), hint: "Negócios em Ganho ÷ total de negócios desta pipeline.", detail: `${kpis.total} negócios no total`, icon: Percent, tone: "blue" },
      { label: "Parados além do prazo", value: String(kpis.overdue), hint: "Negócios abertos há mais dias na etapa do que o prazo configurado nela.", icon: AlarmClock, tone: kpis.overdue ? "orange" : "navy" },
    ]
    : [
      { label: "Clientes no relacionamento", value: String(kpis.total), hint: "Clientes em pós-venda, recompra e reativação.", icon: Briefcase, tone: "blue" },
      { label: "Valor em negociação", value: money(kpis.openValue), hint: "Soma do valor estimado dos cards desta pipeline.", icon: CircleDollarSign, tone: "navy" },
      { label: "Entraram em 30 dias", value: String(kpis.newLast30), hint: "Cards abertos nos últimos 30 dias.", icon: UserPlus, tone: "lime" },
      { label: "Clientes recorrentes", value: String(kpis.recurring), hint: "Cards de clientes com compra anterior no ERP.", icon: Repeat, tone: "blue" },
      { label: "Parados além do prazo", value: String(kpis.overdue), hint: "Cards há mais dias na etapa do que o prazo configurado nela.", icon: AlarmClock, tone: kpis.overdue ? "orange" : "navy" },
    ];

  return (
    <section aria-label="Indicadores da pipeline" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map(({ label, value, hint, detail, icon: Icon, tone }) => (
        <div key={label} title={hint} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07194f]/60">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE[tone]}`}><Icon className="h-4 w-4" /></span>
          </div>
          <p className="mt-2 truncate text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
          {detail && <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{detail}</p>}
        </div>
      ))}
    </section>
  );
}
