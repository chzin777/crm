"use client";

import { useCallback, useEffect, useState } from "react";
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
  Bell,
  CalendarDays,
  CircleDollarSign,
  Plus,
  RefreshCw,
  ShoppingBag,
  Star,
  Target,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import Link from "next/link";
import { useCrmTheme } from "@/hooks/useCrmTheme";

type Period = "7d" | "30d" | "12m";
interface DashboardData {
  contacts: number;
  purchases: number;
  totalRevenue: number;
  categoryCounts: Record<string, number>;
  pipelineCounts: Record<string, number>;
  nps: number | null;
  npsResponses: number;
  dailySales: { day: string; revenue: number; sales: number }[];
  recentContacts: { id: string; name: string; category: string; updatedAt: string }[];
}

const stageLabels: Record<string, string> = {
  "novo-lead": "Novo lead",
  "em-atendimento": "Em atendimento",
  fechamento: "Fechamento",
  "pos-venda": "Pós-venda",
  recompra: "Recompra",
  reativacao: "Reativação",
};
const categoryLabels: Record<string, { label: string; color: string }> = {
  cliente: { label: "Clientes", color: "#002187" },
  lead: { label: "Leads", color: "#F7915E" },
  nps: { label: "NPS", color: "#C4D600" },
  inativo: { label: "Inativos", color: "#94a3b8" },
};
const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

export default function PainelPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const [period, setPeriod] = useState<Period>("30d");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);

  const reloadDashboard = useCallback(() => {
    setIsLoading(true);
    setDashboardError("");
    fetch("/api/dashboard")
      .then(async (response) => {
        const result = await response.json() as { data?: DashboardData; error?: string };
        if (!response.ok || !result.data) throw new Error(result.error || "Não foi possível carregar os indicadores.");
        setCurrentDate(new Date());
        setDashboardData(result.data);
      })
      .catch((error: unknown) => {
        setDashboardError(error instanceof Error ? error.message : "Não foi possível carregar os indicadores.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    reloadDashboard();
  }, [reloadDashboard]);

  const today = currentDate ?? new Date("2000-01-01T12:00:00");
  const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : 365;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - periodDays + 1);
  const matchingSales = (dashboardData?.dailySales ?? []).filter((sale) => sale.day >= toLocalDateKey(startDate) && sale.day <= toLocalDateKey(today));
  const salesByDay = new Map(matchingSales.map((sale) => [sale.day, sale]));
  const revenueByPeriod = period === "7d"
    ? Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setDate(date.getDate() - 6 + index);
        const key = toLocalDateKey(date);
        return { label: date.toLocaleDateString("pt-BR", { weekday: "short" }), receita: salesByDay.get(key)?.revenue ?? 0 };
      })
    : period === "30d"
      ? Array.from({ length: 4 }, (_, index) => {
          const firstDate = new Date(startDate);
          firstDate.setDate(firstDate.getDate() + index * 7);
          const lastDate = new Date(firstDate);
          lastDate.setDate(lastDate.getDate() + 6);
          return {
            label: `Sem. ${index + 1}`,
            receita: matchingSales.filter((sale) => sale.day >= toLocalDateKey(firstDate) && sale.day <= toLocalDateKey(lastDate)).reduce((sum, sale) => sum + sale.revenue, 0),
          };
        })
      : Array.from({ length: 12 }, (_, index) => {
          const date = new Date(today.getFullYear(), today.getMonth() - 11 + index, 1);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          return {
            label: date.toLocaleDateString("pt-BR", { month: "short" }),
            receita: matchingSales.filter((sale) => sale.day.startsWith(key)).reduce((sum, sale) => sum + sale.revenue, 0),
          };
        });
  const rangeRevenue = matchingSales.reduce((sum, sale) => sum + sale.revenue, 0);
  const pipelineData = Object.entries(dashboardData?.pipelineCounts ?? {}).map(([stage, deals]) => ({
    etapa: stageLabels[stage] ?? stage,
    deals,
  }));
  const totalPipeline = pipelineData.reduce((sum, item) => sum + item.deals, 0);
  const customerSegments = Object.entries(dashboardData?.categoryCounts ?? {})
    .filter(([category]) => category in categoryLabels)
    .map(([category, count]) => ({
      name: categoryLabels[category].label,
      value: dashboardData?.contacts ? Math.round((count / dashboardData.contacts) * 100) : 0,
      color: categoryLabels[category].color,
    }));
  const recentActivity = (dashboardData?.recentContacts ?? []).map((contact) => ({
    id: contact.id,
    name: contact.name,
    detail: `Contato atualizado · ${new Date(contact.updatedAt).toLocaleString("pt-BR")}`,
    stage: categoryLabels[contact.category]?.label ?? contact.category,
  }));
  const metrics = [
    { label: "Receita no período", value: formatCurrency(rangeRevenue), note: `${matchingSales.reduce((sum, sale) => sum + sale.sales, 0).toLocaleString("pt-BR")} vendas importadas`, icon: CircleDollarSign, iconClass: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Contatos", value: (dashboardData?.contacts ?? 0).toLocaleString("pt-BR"), note: "registros no banco", icon: ShoppingBag, iconClass: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
    { label: "Compras", value: (dashboardData?.purchases ?? 0).toLocaleString("pt-BR"), note: `valor histórico ${formatCurrency(dashboardData?.totalRevenue ?? 0)}`, icon: Target, iconClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    { label: "NPS", value: dashboardData?.nps === null || dashboardData?.nps === undefined ? "—" : String(dashboardData.nps), note: `${dashboardData?.npsResponses ?? 0} respostas registradas`, icon: Star, iconClass: "bg-orange-50 text-[#b94a15] dark:bg-orange-950/30 dark:text-[#F7915E]" },
  ];

  const tooltipStyle = {
    backgroundColor: isDark ? "#07194f" : "#ffffff",
    borderColor: isDark ? "#334155" : "#e2e8f0",
    borderRadius: 10,
    color: isDark ? "#f1f5f9" : "#0f172a",
  };
  const revenueColor = isDark ? "#C4D600" : "#002187";

  if (isLoading) {
    return <LoadingSpinner fullScreen label="Carregando dados reais do banco..." size={96} />;
  }

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
          {dashboardError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dashboardError}</p>}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Painel</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Visão geral do desempenho e relacionamento com clientes.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={reloadDashboard} disabled={isLoading} aria-label="Atualizar painel" title="Atualizar painel" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#051647] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer">
                <Plus className="h-4 w-4" />
                Novo negócio
              </button>
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
                  <p className="mt-3 text-[11px] text-slate-400">{metric.note}</p>
                </article>
              );
            })}
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5 xl:col-span-8" aria-label="Receita ao longo do período">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Receita ao longo do período</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Vendas importadas</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: revenueColor }} />Receita</span>
                </div>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueByPeriod} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={isDark ? "#1e335b" : "#e2e8f0"} vertical={false} strokeDasharray="3 4" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 0 }).format(value)} width={48} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
                    <Area isAnimationActive={false} type="monotone" dataKey="receita" stroke={revenueColor} strokeWidth={2.5} fill={revenueColor} fillOpacity={0.1} activeDot={{ r: 4, fill: "#C4D600", stroke: "#051647", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5 xl:col-span-4" aria-label="Funil de novos clientes">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Oportunidades por etapa</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{totalPipeline} oportunidades registradas</p>
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
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Distribuição dos contatos cadastrados</p>
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
              <p className="border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">{(dashboardData?.contacts ?? 0).toLocaleString("pt-BR")} contatos no total</p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f] sm:p-5 xl:col-span-8" aria-label="Atividade recente">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Atividade recente</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contatos atualizados recentemente</p>
                </div>
                <span className="text-xs font-semibold text-[#002187] dark:text-[#C4D600]">{recentActivity.length} atualizações</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#C4D600]/20 text-[10px] font-bold text-[#051647]">{activity.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{activity.name}</p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{activity.detail}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{activity.stage}</span>
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
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{dashboardData?.categoryCounts.inativo ?? 0} contatos classificados como inativos.</p>
              </div>
            </div>
            <Link href="/contatos" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              Ver clientes
            </Link>
          </section>
        </main>
      </div>
    </div>
  );
}
