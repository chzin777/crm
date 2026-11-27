"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/dashboard/DashboardKit";
import { RulesTab } from "@/components/brasil-points/RulesTab";
import { RankingTab } from "@/components/brasil-points/RankingTab";
import { RewardsTab } from "@/components/brasil-points/RewardsTab";

type Tab = "ranking" | "regras" | "premios";

/** Brasil Points: gamificação comercial dos vendedores (regras, ranking/extrato e prêmios/resgates). */
export default function BrasilPointsPage() {
  const [tab, setTab] = useState<Tab>("ranking");
  return (
    <main className="w-full min-w-0 space-y-4 px-3 pb-24 pt-4 md:px-6 md:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7915E]">Gestão</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Brasil Points</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Pontos por vendas faturadas no VMSet, WhatsApp e NPS; estorno automático em devolução ou cancelamento; prêmios resgatados pelo app.</p>
        </div>
        <SegmentedControl<Tab> label="Seção" value={tab} onChange={setTab} options={[{ value: "ranking", label: "Ranking & Extrato" }, { value: "regras", label: "Critérios & Regras" }, { value: "premios", label: "Premiações & Resgates" }]} />
      </header>
      {tab === "ranking" ? <RankingTab /> : tab === "regras" ? <RulesTab /> : <RewardsTab />}
    </main>
  );
}
