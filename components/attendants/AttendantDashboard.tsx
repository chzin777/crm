"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Clock3,
  Coins,
  LoaderCircle,
  RefreshCw,
  Store,
  Users,
  X,
} from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { attendantKpis } from "@/lib/attendants/attribution";

type Settings = { attributionWindowDays: 7 | 15; commissionMode: "sale" | "percentage"; commissionValue: number };
type AttendanceRow = {
  id: string;
  conversationId: string;
  saleKey: string | null;
  customerName: string;
  customerPhone: string | null;
  attendantId: string | null;
  attendantName: string;
  orderNumber: string | null;
  invoiceNumber: string | null;
  attendanceAt: string;
  orderDate: string | null;
  saleDate: string | null;
  store: string | null;
  seller: string | null;
  netAmount: number | null;
  windowDays: number;
  aiStatus: string;
  aiQualified: boolean | null;
  aiConfidence: number | null;
  aiSummary: string | null;
  targetStore: string | null;
  manualDecision: boolean | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  eligible: boolean;
};
type DashboardPayload = {
  period: { from: string; to: string };
  settings: Settings;
  kpis: { qualifiedAttendances: number; validSales: number; revenue: number; conversionRate: number | null; averageTicket: number | null; commissionForecast: number };
  attendants: string[];
  stores: string[];
  canReview: boolean;
  data: AttendanceRow[];
};
type Detail = {
  id: string;
  customerName: string;
  phone: string;
  orderNumber: string | null;
  invoiceNumber: string | null;
  attendanceAt: string;
  orderDate: string | null;
  saleDate: string | null;
  store: string | null;
  seller: string | null;
  netAmount: number | null;
  aiStatus: string;
  aiQualified: boolean | null;
  aiConfidence: number | null;
  aiSummary: string | null;
  targetStore: string | null;
  manualDecision: boolean | null;
  reviewNote: string | null;
  messages: { id: string; author: string; attendant: boolean; authorName: string | null; text: string; transcription: string | null; hasAttachment: boolean; createdAt: string }[];
  orderLines: { type: string | null; productCode: string | null; description: string | null; brand: string | null; category: string | null; quantity: number | null; amount: number | null; discount: number | null; invoiceNumber: string | null }[];
};

type RangePreset = "today" | "week" | "month" | "custom";
type AuditFilter = "all" | "approved" | "superficial" | "pending";

const brToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const shiftDay = (day: string, count: number) => {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const initialRange = () => {
  const today = brToday();
  return { from: monthStart(today), to: today };
};
const money = (value: number | null | undefined) => value === null || value === undefined
  ? "—"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const dayLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
  : "—";
const dateTimeLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));

function daysUntilSale(attendanceAt: string, saleDate: string | null) {
  if (!saleDate) return "—";
  const attendedDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(attendanceAt));
  const days = (Date.parse(`${saleDate}T00:00:00Z`) - Date.parse(`${attendedDay}T00:00:00Z`)) / 86_400_000;
  return `${Math.max(0, Math.round(days))} ${Math.round(days) === 1 ? "dia" : "dias"}`;
}

function verdictLabel(row: Pick<AttendanceRow, "aiStatus" | "aiQualified" | "manualDecision">) {
  if (row.manualDecision === true) return "Aprovada manualmente";
  if (row.manualDecision === false) return "Reprovada manualmente";
  if (row.aiStatus === "processing" || row.aiStatus === "pending") return "Pendente";
  if (row.aiStatus === "failed") return "Falha na análise";
  return row.aiQualified ? "Atendimento validado" : "Interação superficial";
}

function verdictClass(row: Pick<AttendanceRow, "aiStatus" | "aiQualified" | "manualDecision">) {
  if (row.manualDecision === true || (row.manualDecision === null && row.aiStatus === "completed" && row.aiQualified)) {
    return "border-[#C4D600]/60 bg-[#C4D600]/15 text-[#051647] dark:text-[#eaf28b]";
  }
  if (row.aiStatus === "pending" || row.aiStatus === "processing") return "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300";
}

function presetRange(preset: RangePreset) {
  const today = brToday();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    return { from: shiftDay(today, mondayOffset), to: today };
  }
  return { from: monthStart(today), to: today };
}

export function AttendantDashboard() {
  const initial = initialRange();
  const [range, setRange] = useState(initial);
  const [preset, setPreset] = useState<RangePreset>("month");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attendant, setAttendant] = useState("all");
  const [store, setStore] = useState("all");
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [windowDays, setWindowDays] = useState<7 | 15>(7);
  const [commissionMode, setCommissionMode] = useState<"sale" | "percentage">("sale");
  const [commissionValue, setCommissionValue] = useState("0");

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const response = await fetch(`/api/atendentes?${query}`, { cache: "no-store" });
      const payload = await response.json() as DashboardPayload | { error?: string };
      if (!response.ok || !("data" in payload)) throw new Error("error" in payload ? payload.error : "Não foi possível carregar o painel.");
      setDashboard(payload);
      if (!quiet) {
        setWindowDays(payload.settings.attributionWindowDays);
        setCommissionMode(payload.settings.commissionMode);
        setCommissionValue(String(payload.settings.commissionValue));
      }
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    const timer = window.setInterval(() => void loadData(true), 15_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadData]);

  const sales = useMemo(() => (dashboard?.data ?? []).filter((row) => row.saleKey !== null), [dashboard]);
  const attendantSales = useMemo(
    () => sales.filter((row) => (attendant === "all" || row.attendantName === attendant) && (store === "all" || row.store === store)),
    [sales, attendant, store],
  );
  const filteredSales = useMemo(() => attendantSales.filter((row) => {
    if (auditFilter === "approved") return row.aiStatus === "completed" && row.aiQualified === true && row.manualDecision === null;
    if (auditFilter === "superficial") return row.aiStatus === "completed" && row.aiQualified === false && row.manualDecision === null;
    if (auditFilter === "pending") return row.aiStatus === "pending" || row.aiStatus === "processing" || row.aiStatus === "failed";
    return true;
  }), [attendantSales, auditFilter]);
  const metricRows = useMemo(() => {
    const visibleConversations = store === "all" ? null : new Set(attendantSales.map((row) => row.conversationId));
    const markers = (dashboard?.data ?? []).filter((row) =>
      row.saleKey === null &&
      (attendant === "all" || row.attendantName === attendant) &&
      (!visibleConversations || visibleConversations.has(row.conversationId)),
    );
    return [...markers, ...attendantSales];
  }, [dashboard, attendantSales, attendant, store]);
  const kpis = dashboard
    ? attendantKpis(metricRows.map((row) => ({
      conversationId: row.conversationId,
      saleKey: row.saleKey,
      aiStatus: row.aiStatus,
      aiQualified: row.aiQualified,
      manualDecision: row.manualDecision,
      netAmount: row.netAmount,
    })), { mode: commissionMode, value: Number(commissionValue) || 0 })
    : null;

  function choosePreset(value: RangePreset) {
    setPreset(value);
    if (value !== "custom") setRange(presetRange(value));
  }

  async function openDetail(row: AttendanceRow) {
    if (!dashboard?.canReview || !row.saleKey) return;
    setDetail(null);
    setReviewNote("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/atendentes/${row.id}`, { cache: "no-store" });
      const payload = await response.json() as { data?: Detail; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Não foi possível abrir a auditoria.");
      setDetail(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível abrir a auditoria.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveReview(approved: boolean) {
    if (!detail) return;
    setSavingReview(true);
    try {
      const response = await fetch(`/api/atendentes/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, note: reviewNote }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar a revisão.");
      await loadData(true);
      const refreshed = await fetch(`/api/atendentes/${detail.id}`, { cache: "no-store" });
      const refreshedPayload = await refreshed.json() as { data?: Detail; error?: string };
      if (!refreshed.ok || !refreshedPayload.data) throw new Error(refreshedPayload.error ?? "A revisão foi salva, mas não foi possível atualizar a auditoria.");
      setDetail(refreshedPayload.data);
      setReviewNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a revisão.");
    } finally {
      setSavingReview(false);
    }
  }

  async function refreshAttributions() {
    setSyncing(true);
    try {
      const response = await fetch("/api/atendentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(range),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar as atribuições.");
      await loadData(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar as atribuições.");
    } finally {
      setSyncing(false);
    }
  }

  async function saveSettings() {
    const parsedValue = Number(commissionValue);
    if (!Number.isFinite(parsedValue) || parsedValue < 0 || (commissionMode === "percentage" && parsedValue > 100)) {
      setError("Informe uma regra de premiação válida.");
      return;
    }
    setSavingSettings(true);
    try {
      const response = await fetch("/api/atendentes/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributionWindowDays: windowDays, commissionMode, commissionValue: parsedValue }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar as regras.");
      await refreshAttributions();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar as regras.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <main className="min-w-0 space-y-5 px-3 pb-10 pt-4 md:px-6 md:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F7915E]">Gestão · WhatsApp + VMSET</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Desempenho de Atendentes</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Audite atendimentos humanos e vendas faturadas atribuídas, com validação por IA e revisão do gestor.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dashboard?.canReview && (
            <button type="button" onClick={refreshAttributions} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#051647] hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white cursor-pointer hover:cursor-pointer">
              {syncing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar atribuições
            </button>
          )}
        </div>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#07194f] md:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[170px]">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Período</span>
            <select value={preset} onChange={(event) => choosePreset(event.target.value as RangePreset)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value="today">Hoje</option><option value="week">Esta semana</option><option value="month">Este mês</option><option value="custom">Personalizado</option>
            </select>
          </label>
          {preset === "custom" && (
            <>
              <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">De</span><input type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
              <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Até</span><input type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
            </>
          )}
          <label className="min-w-[190px]">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Atendente</span>
            <select value={attendant} onChange={(event) => setAttendant(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value="all">Todos</option>{dashboard?.attendants.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="min-w-[170px]">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Loja de fechamento</span>
            <select value={store} onChange={(event) => setStore(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value="all">Todas</option>{dashboard?.stores.map((code) => <option key={code} value={code}>Loja {code}</option>)}
            </select>
          </label>
          <label className="min-w-[220px]">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Auditoria IA</span>
            <select value={auditFilter} onChange={(event) => setAuditFilter(event.target.value as AuditFilter)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value="all">Todas</option><option value="approved">Aprovadas pela IA</option><option value="superficial">Descartadas / superficiais</option><option value="pending">Pendentes</option>
            </select>
          </label>
          {loading && <LoaderCircle className="mb-2 h-4 w-4 animate-spin text-[#002187]" aria-label="Carregando" />}
        </div>
      </section>

      {dashboard?.canReview && (
        <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#07194f] md:p-4">
          <div className="mr-auto min-w-[180px]">
            <p className="text-sm font-bold text-[#051647] dark:text-white">Regra de atribuição e premiação</p>
            <p className="mt-0.5 text-xs text-slate-500">A previsão usa apenas vendas elegíveis.</p>
          </div>
          <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Janela</span><select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value) as 7 | 15)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value={7}>7 dias</option><option value={15}>15 dias</option></select></label>
          <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Premiação</span><select value={commissionMode} onChange={(event) => setCommissionMode(event.target.value as "sale" | "percentage")} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="sale">Valor por venda válida</option><option value="percentage">Percentual do faturamento</option></select></label>
          <label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{commissionMode === "sale" ? "R$ por venda" : "Comissão %"}</span><input type="number" min="0" max={commissionMode === "percentage" ? "100" : undefined} step="0.01" value={commissionValue} onChange={(event) => setCommissionValue(event.target.value)} className="h-10 w-36 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
          <button type="button" onClick={saveSettings} disabled={savingSettings || syncing} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] cursor-pointer hover:cursor-pointer">
            {savingSettings ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar regra
          </button>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={Users} title="Atendimentos qualificados" value={kpis?.qualifiedAttendances.toLocaleString("pt-BR") ?? "—"} detail="Conversas conduzidas por atendente" />
        <KpiCard icon={BadgeCheck} title="Vendas válidas" value={kpis?.validSales.toLocaleString("pt-BR") ?? "—"} detail={money(kpis?.revenue)} />
        <KpiCard icon={CalendarDays} title="Conversão real" value={kpis?.conversionRate === null || kpis?.conversionRate === undefined ? "—" : `${kpis.conversionRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} detail="Conversas qualificadas com venda válida" />
        <KpiCard icon={Store} title="Ticket médio" value={money(kpis?.averageTicket)} detail="Por venda elegível" />
        <KpiCard icon={Coins} title="Previsão de premiação" value={money(kpis?.commissionForecast)} detail={commissionMode === "sale" ? `${money(Number(commissionValue) || 0)} por venda válida` : `${commissionValue || 0}% do faturamento`} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#07194f]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div><h2 className="text-sm font-bold text-[#051647] dark:text-white">Vendas atribuídas</h2><p className="text-xs text-slate-500">{filteredSales.length} registros no período · selecione uma linha para auditar</p></div>
          <div className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Atualização automática a cada minuto</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/60">
              <tr><th className="px-4 py-3 font-semibold">Cliente / pedido</th><th className="px-4 py-3 font-semibold">Atendente CRM</th><th className="px-4 py-3 font-semibold">Loja / vendedor VMSET</th><th className="px-4 py-3 font-semibold">Atendimento → compra</th><th className="px-4 py-3 text-right font-semibold">Líquido</th><th className="px-4 py-3 font-semibold">Veredito IA</th><th className="px-4 py-3 font-semibold">Justificativa</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSales.map((row) => (
                <tr key={row.id} tabIndex={dashboard?.canReview ? 0 : undefined} onClick={() => void openDetail(row)} onKeyDown={(event) => { if (dashboard?.canReview && (event.key === "Enter" || event.key === " ")) void openDetail(row); }} className={`${dashboard?.canReview ? "cursor-pointer hover:cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]" : ""}`}>
                  <td className="max-w-[220px] px-4 py-3"><p className="truncate font-semibold text-[#051647] dark:text-white">{row.customerName}</p><p className="mt-0.5 text-xs text-slate-500">Pedido {row.orderNumber ?? "—"}{row.invoiceNumber ? ` · NF ${row.invoiceNumber}` : ""}</p></td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.attendantName}</td>
                  <td className="px-4 py-3"><p className="text-slate-700 dark:text-slate-200">Loja {row.store ?? "—"}</p><p className="mt-0.5 text-xs text-slate-500">{row.seller ?? "Vendedor não informado"}</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-slate-600 dark:text-slate-300">{dateTimeLabel(row.attendanceAt)}</p><p className="mt-0.5 text-xs font-medium text-[#002187] dark:text-[#CFDB6D]">{dayLabel(row.saleDate)} · {daysUntilSale(row.attendanceAt, row.saleDate)}</p></td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-[#051647] dark:text-white">{money(row.netAmount)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${verdictClass(row)}`}>{verdictLabel(row)}</span>{row.aiConfidence !== null && <p className="mt-1 text-[10px] text-slate-400">Confiança {row.aiConfidence}%</p>}</td>
                  <td className="max-w-[300px] px-4 py-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{row.aiSummary ?? (row.aiStatus === "failed" ? "A análise automática falhou; revise ou tente atualizar a apuração." : "Aguardando validação da IA.")}{row.targetStore && <p className="mt-1 text-[10px] text-slate-400">Direcionada para: {row.targetStore}</p>}</td>
                </tr>
              ))}
              {!filteredSales.length && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">{loading ? "Carregando vendas e atendimentos..." : "Nenhuma venda atribuída encontrada para estes filtros."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#051647]/40 backdrop-blur-sm" role="status">
          <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 text-sm font-semibold text-[#051647] shadow-xl dark:bg-[#07194f] dark:text-white"><LoaderCircle className="h-5 w-5 animate-spin" />Carregando auditoria...</div>
        </div>
      )}

      {detail && (
        <EntityDialog titleId="attendance-audit-title" title={`Auditoria · ${detail.customerName}`} description="Transcrição do WhatsApp e pedido faturado no VMSET" size="drawer" onClose={() => setDetail(null)}>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            <span>{detail.customerName} · {detail.phone}</span><span>Pedido {detail.orderNumber ?? "—"}{detail.invoiceNumber ? ` · NF ${detail.invoiceNumber}` : ""}</span><span>Atendimento {dateTimeLabel(detail.attendanceAt)} → compra {dayLabel(detail.saleDate)}</span>
            <strong className="text-[#051647] dark:text-[#CFDB6D]">{money(detail.netAmount)}</strong>
          </div>
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <header className="shrink-0 border-b border-slate-200 px-3 py-2 dark:border-slate-700"><h3 className="text-sm font-bold text-[#051647] dark:text-white">Conversa WhatsApp</h3><p className="text-[11px] text-slate-500">Mensagens do atendente destacadas</p></header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/70 p-3 dark:bg-slate-950/30">
                {detail.messages.map((message) => (
                  <article key={message.id} className={`max-w-[92%] rounded-xl border p-2.5 text-xs leading-relaxed ${message.attendant ? "ml-auto border-[#002187]/20 bg-[#002187]/[0.06] text-[#051647] dark:border-[#CFDB6D]/20 dark:bg-[#C4D600]/10 dark:text-slate-100" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200"}`}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-slate-400"><strong className={message.attendant ? "text-[#002187] dark:text-[#CFDB6D]" : ""}>{message.attendant ? message.authorName ?? "Atendente" : message.author === "customer" ? detail.customerName : "Automação"}</strong><time>{dateTimeLabel(message.createdAt)}</time></div>
                    <p className="whitespace-pre-wrap break-words">{message.text || (message.transcription ? "Áudio recebido" : "Anexo de mídia")}</p>
                    {message.transcription && <p className="mt-1 border-l-2 border-[#C4D600] pl-2 text-slate-500">Áudio: {message.transcription}</p>}
                    {message.hasAttachment && <p className="mt-1 text-[10px] text-slate-400">Mensagem com anexo</p>}
                  </article>
                ))}
                {!detail.messages.length && <p className="py-8 text-center text-xs text-slate-500">Não há mensagens disponíveis nesta conversa.</p>}
              </div>
            </section>
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <header className="shrink-0 border-b border-slate-200 px-3 py-2 dark:border-slate-700"><h3 className="text-sm font-bold text-[#051647] dark:text-white">Pedido VMSET</h3><p className="text-[11px] text-slate-500">Loja {detail.store ?? "—"} · {detail.seller ?? "Vendedor não informado"}</p></header>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {detail.targetStore && <p className="mb-3 rounded-lg border border-[#C4D600]/40 bg-[#C4D600]/10 p-2 text-xs text-slate-700 dark:text-slate-200">Destino indicado pelo atendimento: <strong>{detail.targetStore}</strong></p>}
                <div className="space-y-2">
                  {detail.orderLines.map((line, index) => (
                    <article key={`${line.productCode}-${index}`} className={`rounded-lg border p-3 ${line.type === "Devolucao Cliente" ? "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20" : "border-slate-200 dark:border-slate-700"}`}>
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-xs font-semibold text-[#051647] dark:text-white">{line.description ?? "Item sem descrição"}</p><p className="mt-1 text-[10px] text-slate-500">{line.brand ?? line.category ?? "VMSET"}{line.productCode ? ` · ${line.productCode}` : ""}{line.quantity !== null ? ` · qtd. ${line.quantity}` : ""}</p></div><strong className="shrink-0 text-xs tabular-nums text-slate-700 dark:text-slate-200">{money(line.amount)}</strong></div>
                      {line.type === "Devolucao Cliente" && <p className="mt-1 text-[10px] font-semibold text-rose-600 dark:text-rose-300">Item devolvido</p>}
                    </article>
                  ))}
                  {!detail.orderLines.length && <p className="py-8 text-center text-xs text-slate-500">Os itens do pedido não estão disponíveis no espelho do VMSET.</p>}
                </div>
                <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><span className="font-semibold text-slate-600 dark:text-slate-300">Valor líquido atribuído</span><strong className="text-[#051647] dark:text-white">{money(detail.netAmount)}</strong></div>
              </div>
            </section>
          </div>
          {dashboard?.canReview && (
            <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={500} placeholder="Justificativa opcional da revisão" className="h-10 min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              <button type="button" onClick={() => void saveReview(true)} disabled={savingReview} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#C4D600] px-4 text-sm font-bold text-[#051647] hover:bg-[#CFDB6D] disabled:opacity-60 cursor-pointer hover:cursor-pointer"><Check className="h-4 w-4" />Aprovar</button>
              <button type="button" onClick={() => void saveReview(false)} disabled={savingReview} className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30 cursor-pointer hover:cursor-pointer"><X className="h-4 w-4" />Reprovar</button>
            </footer>
          )}
        </EntityDialog>
      )}
    </main>
  );
}

function KpiCard({ icon: Icon, title, value, detail }: { icon: typeof Users; title: string; value: string; detail: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07194f]">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{title}</p><p className="mt-2 truncate text-xl font-bold tabular-nums text-[#051647] dark:text-white">{value}</p></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#051647]/[0.06] text-[#002187] dark:bg-white/10 dark:text-[#C4D600]"><Icon className="h-[18px] w-[18px]" /></span></div>
      <p className="mt-2 truncate text-[11px] text-slate-500 dark:text-slate-400">{detail}</p>
    </article>
  );
}
