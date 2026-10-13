"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CircleDollarSign,
  RefreshCw,
  ShoppingBag,
  Star,
  Target,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";

type Period = "7d" | "30d" | "12m";

const revenueByPeriod: Record<Period, { label: string; receita: number; meta: number }[]> = {
  "7d": [
    { label: "Seg", receita: 1850, meta: 2100 },
    { label: "Ter", receita: 2670, meta: 2300 },
    { label: "Qua", receita: 2140, meta: 2400 },
    { label: "Qui", receita: 3310, meta: 2500 },
    { label: "Sex", receita: 2890, meta: 2700 },
    { label: "Sáb", receita: 3560, meta: 3000 },
    { label: "Dom", receita: 1990, meta: 2200 },
  ],
  "30d": [
    { label: "Sem. 1", receita: 16800, meta: 18000 },
    { label: "Sem. 2", receita: 21400, meta: 19500 },
    { label: "Sem. 3", receita: 18750, meta: 20500 },
    { label: "Sem. 4", receita: 25690, meta: 22000 },
  ],
  "12m": [
    { label: "Nov", receita: 62400, meta: 60000 },
    { label: "Dez", receita: 71800, meta: 65000 },
    { label: "Jan", receita: 68500, meta: 70000 },
    { label: "Fev", receita: 74300, meta: 72000 },
    { label: "Mar", receita: 79200, meta: 74000 },
    { label: "Abr", receita: 81800, meta: 78000 },
    { label: "Mai", receita: 84600, meta: 80000 },
    { label: "Jun", receita: 82750, meta: 82000 },
    { label: "Jul", receita: 91100, meta: 85000 },
    { label: "Ago", receita: 88400, meta: 87000 },
    { label: "Set", receita: 96200, meta: 90000 },
    { label: "Out", receita: 104800, meta: 95000 },
  ],
};

const summaries: Record<Period, { revenue: string; revenueChange: string; deals: string; dealsChange: string; conversion: string; conversionChange: string; nps: string; npsChange: string }> = {
  "7d": { revenue: "R$ 18.410", revenueChange: "+8,4%", deals: "12", dealsChange: "+3", conversion: "27,3%", conversionChange: "+1,8 p.p.", nps: "9,4", npsChange: "+0,2" },
  "30d": { revenue: "R$ 82.640", revenueChange: "+12,8%", deals: "38", dealsChange: "+6", conversion: "24,6%", conversionChange: "+2,1 p.p.", nps: "9,3", npsChange: "+0,4" },
  "12m": { revenue: "R$ 946.800", revenueChange: "+16,2%", deals: "412", dealsChange: "+48", conversion: "23,8%", conversionChange: "+1,6 p.p.", nps: "9,2", npsChange: "+0,3" },
};

const pipelineData = [
  { etapa: "Novos leads", deals: 42 },
  { etapa: "Em atendimento", deals: 27 },
  { etapa: "Fechamento", deals: 15 },
];

const customerSegments = [
  { name: "Novos clientes", value: 42, color: "#002187" },
  { name: "Recorrentes", value: 38, color: "#C4D600" },
  { name: "Em reativação", value: 20, color: "#F7915E" },
];

const recentActivity = [
  { initials: "AM", name: "Amanda Meirelles", detail: "Novo orçamento · Armação Vogue", value: "R$ 890", stage: "Em atendimento", color: "bg-blue-100 text-[#002187]" },
  { initials: "GS", name: "Guilherme Sampaio", detail: "Ray-Ban Aviator Polarizado", value: "R$ 1.250", stage: "Novo lead", color: "bg-[#F7915E]/15 text-[#b94a15]" },
  { initials: "CS", name: "Carlos Eduardo Silveira", detail: "Oakley Grau Esportivo", value: "R$ 1.950", stage: "Recompra", color: "bg-[#C4D600]/25 text-[#051647]" },
  { initials: "LF", name: "Lucas Ferraz Fontes", detail: "Reposição de lentes Acuvue", value: "R$ 540", stage: "Recompra", color: "bg-[#C4D600]/25 text-[#051647]" },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

export default function PainelPage() {
  const [isDark, setIsDark] = useState(false);
  const [period, setPeriod] = useState<Period>("30d");
  const summary = summaries[period];

  useEffect(() => {
    const savedTheme = localStorage.getItem("otb-crm-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const toggleTheme = () => {
    setIsDark((previous) => {
      const next = !previous;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("otb-crm-theme", next ? "dark" : "light");
      return next;
    });
  };

  const metrics = [
    { label: "Receita", value: summary.revenue, change: summary.revenueChange, note: "vs. período anterior", icon: CircleDollarSign, iconClass: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Deals ativos", value: summary.deals, change: summary.dealsChange, note: "oportunidades no funil", icon: ShoppingBag, iconClass: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
    { label: "Conversão", value: summary.conversion, change: summary.conversionChange, note: "lead até a compra", icon: Target, iconClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    { label: "NPS médio", value: summary.nps, change: summary.npsChange, note: "satisfação dos clientes", icon: Star, iconClass: "bg-orange-50 text-[#b94a15] dark:bg-orange-950/30 dark:text-[#F7915E]" },
  ];

  const tooltipStyle = {
    backgroundColor: isDark ? "#07194f" : "#ffffff",
    borderColor: isDark ? "#334155" : "#e2e8f0",
    borderRadius: 10,
    color: isDark ? "#f1f5f9" : "#0f172a",
  };
  const revenueColor = isDark ? "#C4D600" : "#002187";

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] text-slate-800 transition-colors dark:bg-[#030d29] dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-4 mt-4 flex h-16 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm dark:border-slate-800 dark:bg-[#051647]">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <span>Workspace</span>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <strong className="font-semibold text-slate-900 dark:text-white">Painel</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" aria-label="Alertas" title="Alertas" className="topbar-icon-button bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="space-y-5 px-6 pb-10 pt-8 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Painel</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Visão geral do desempenho e relacionamento com clientes.</p>
            </div>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-300">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <span className="sr-only">Período do painel</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="bg-transparent outline-none">
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
                <option value="12m">Últimos 12 meses</option>
              </select>
            </label>
          </div>

          <section aria-label="Indicadores do período" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{metric.value}</p>
                    </div>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${metric.iconClass}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                      <ArrowUpRight className="h-3.5 w-3.5" />{metric.change}
                    </span>
                    <span className="text-slate-400">{metric.note}</span>
                  </div>
                </article>
              );
            })}
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5 xl:col-span-8" aria-label="Receita ao longo do período">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Receita ao longo do período</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Faturamento comparado à meta</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: revenueColor }} />Receita</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-[#F7915E]" />Meta</span>
                </div>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueByPeriod[period]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={isDark ? "#1e335b" : "#e2e8f0"} vertical={false} strokeDasharray="3 4" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 0 }).format(value)} width={48} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
                    <Area isAnimationActive={false} type="monotone" dataKey="meta" stroke="#F7915E" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
                    <Area isAnimationActive={false} type="monotone" dataKey="receita" stroke={revenueColor} strokeWidth={2.5} fill={revenueColor} fillOpacity={0.1} activeDot={{ r: 4, fill: "#C4D600", stroke: "#051647", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5 xl:col-span-4" aria-label="Funil de novos clientes">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Funil de novos clientes</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">42 leads · 35,7% chegam ao fechamento</p>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineData} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid stroke={isDark ? "#1e335b" : "#e2e8f0"} horizontal={false} strokeDasharray="3 4" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis type="category" dataKey="etapa" axisLine={false} tickLine={false} tick={{ fill: isDark ? "#cbd5e1" : "#475569", fontSize: 10 }} width={104} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value} deals`} />
                    <Bar isAnimationActive={false} dataKey="deals" radius={[0, 6, 6, 0]} barSize={18}>
                      {pipelineData.map((entry, index) => <Cell key={entry.etapa} fill={index === 2 ? "#C4D600" : "#002187"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5 xl:col-span-4" aria-label="Perfil de clientes">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Perfil de clientes</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Distribuição da base ativa</p>
              </div>
              <div className="mt-3 grid grid-cols-[minmax(130px,1fr)_1fr] items-center gap-2">
                <div className="h-[190px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie isAnimationActive={false} data={customerSegments} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={3} stroke="none">
                        {customerSegments.map((segment) => <Cell key={segment.name} fill={segment.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {customerSegments.map((segment) => (
                    <div key={segment.name}>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="truncate">{segment.name}</span>
                      </div>
                      <p className="mt-0.5 pl-3.5 text-sm font-bold text-slate-900 dark:text-white">{segment.value}%</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Clientes recorrentes</span>
                <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"><ArrowUpRight className="h-3.5 w-3.5" />+8,2%</span>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5 xl:col-span-8" aria-label="Atividade recente">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Atividade recente</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Últimos deals atualizados</p>
                </div>
                <span className="text-xs font-semibold text-[#002187] dark:text-[#C4D600]">{recentActivity.length} atualizações</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentActivity.map((activity) => (
                  <div key={activity.name} className="flex items-center gap-3 py-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-bold ${activity.color}`}>{activity.initials}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{activity.name}</p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{activity.detail}</p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{activity.value}</p>
                      <p className="text-[10px] text-slate-400">{activity.stage}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${activity.color}`}>{activity.stage}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07194f] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><RefreshCw className="h-4 w-4" /></span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Clientes para reativar</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">8 clientes sem compra há mais de 6 meses.</p>
              </div>
            </div>
            <button type="button" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              Ver clientes
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </section>
        </main>
      </div>
    </div>
  );
}
