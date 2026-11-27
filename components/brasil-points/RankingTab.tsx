"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Medal, MinusCircle, PlusCircle, RefreshCw, Store } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { SegmentedControl, cardClass } from "@/components/dashboard/DashboardKit";
import { api, ghostButton, inputClass, labelClass, pointsLabel, pointsTone, primaryButton } from "@/components/brasil-points/shared";
import type { RuleRow } from "@/components/brasil-points/RulesTab";

type Row = { userId: string; name: string; initials: string; image: string | null; store: string | null; balance: number; earnedMonth: number; lostMonth: number; points: number; position: number };
type RankingData = { period: "month" | "all"; store: string | null; stores: string[]; items: Row[] };
type LedgerItem = { id: string; type: string; title: string; reason: string; points: number; balanceAfter: number; reference: string | null; createdBy: string; createdAt: string };
type LedgerData = { page: number; pageSize: number; total: number; items: LedgerItem[]; balance: number };
type Filter = "todos" | "ganhos" | "perdas" | "resgates";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Ranking & extrato: placar por mês/geral e loja, extrato por vendedor e lançamento manual com justificativa. */
export function RankingTab() {
  const toast = useToast();
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [store, setStore] = useState("");
  const [data, setData] = useState<RankingData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [manualFor, setManualFor] = useState<Row | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ period });
    if (store) params.set("store", store);
    return api<RankingData>(`/api/brasil-points/ranking?${params}`).then(setData).catch((error: Error) => toast.error("Ranking", error.message));
  }, [period, store, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api<{ sales: { posted: number }; nps: { posted: number } }>("/api/brasil-points/sync", { method: "POST" });
      toast.success("Pontos recalculados", `${result.sales.posted + result.nps.posted} lançamento(s) novo(s).`);
      void load();
    } catch (error) {
      toast.error("Não foi possível recalcular", (error as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<"month" | "all"> label="Período" value={period} onChange={setPeriod} options={[{ value: "month", label: "Este mês" }, { value: "all", label: "Geral" }]} />
        <label className="relative">
          <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Loja" className={`${inputClass} w-44 cursor-pointer pl-9`}>
            <option value="">Todas as lojas</option>
            {(data?.stores ?? []).map((code) => <option key={code} value={code}>Loja {code}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void sync()} disabled={syncing} className={`${ghostButton} ml-auto h-10`}><RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Recalcular agora</button>
      </div>

      {!data ? (
        <div className="flex justify-center py-16"><LoadingSpinner label="Carregando ranking..." size={32} /></div>
      ) : (
        <section className={`${cardClass} min-w-0 overflow-hidden`}>
          {data.items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">Nenhum vendedor ligado a usuário ainda. Faça o vínculo em Campanhas e premiações → Vendedores x usuários.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
                  <tr><th className="px-4 py-2.5">#</th><th className="px-2 py-2.5">Vendedor</th><th className="px-2 py-2.5">Loja</th><th className="px-2 py-2.5 text-right">{period === "month" ? "Pontos do mês" : "Pontos totais"}</th><th className="px-2 py-2.5 text-right">Ganhos (mês)</th><th className="px-2 py-2.5 text-right">Perdas (mês)</th><th className="px-2 py-2.5 text-right">Saldo</th><th className="px-4 py-2.5" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {data.items.map((row) => (
                    <tr key={row.userId} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-bold tabular-nums text-slate-500">{row.position <= 3 ? <Medal className={`h-4 w-4 ${row.position === 1 ? "text-[#C4D600]" : row.position === 2 ? "text-slate-400" : "text-[#F7915E]"}`} /> : row.position}</td>
                      <td className="px-2 py-2.5">
                        <button type="button" onClick={() => setViewing(row)} className="flex cursor-pointer items-center gap-2 text-left font-semibold text-slate-800 hover:text-[#002187] dark:text-slate-100 dark:hover:text-[#C4D600]">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#051647] text-[11px] font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{row.initials}</span>{row.name}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-slate-500">{row.store ? `Loja ${row.store}` : "—"}</td>
                      <td className="px-2 py-2.5 text-right font-bold tabular-nums text-[#051647] dark:text-white">{row.points.toLocaleString("pt-BR")}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">+{row.earnedMonth.toLocaleString("pt-BR")}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">−{row.lostMonth.toLocaleString("pt-BR")}</td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{row.balance.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => setManualFor(row)} className={ghostButton}>Lançar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {viewing && <LedgerDialog row={viewing} onClose={() => setViewing(null)} onManual={() => { setManualFor(viewing); setViewing(null); }} />}
      {manualFor && <ManualDialog row={manualFor} onClose={() => setManualFor(null)} onSaved={() => { setManualFor(null); void load(); }} />}
    </div>
  );
}

function LedgerDialog({ row, onClose, onManual }: { row: Row; onClose: () => void; onManual: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("todos");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerData | null>(null);
  useEffect(() => {
    const params = new URLSearchParams({ userId: row.userId, filter, page: String(page) });
    api<LedgerData>(`/api/brasil-points/ledger?${params}`).then(setData).catch((error: Error) => toast.error("Extrato", error.message));
  }, [row.userId, filter, page, toast]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <EntityDialog titleId="bp-ledger" title={`Extrato · ${row.name}`} description={data ? `Saldo atual: ${data.balance.toLocaleString("pt-BR")} pontos` : "Carregando saldo..."} onClose={onClose} size="lg">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <SegmentedControl<Filter> label="Filtro" value={filter} onChange={(value) => { setFilter(value); setPage(1); }} options={[{ value: "todos", label: "Todos" }, { value: "ganhos", label: "Ganhos" }, { value: "perdas", label: "Perdas" }, { value: "resgates", label: "Resgates" }]} />
        <button type="button" onClick={onManual} className={`${primaryButton} ml-auto`}>Lançamento manual</button>
      </div>
      {!data ? <div className="flex justify-center py-10"><LoadingSpinner label="Carregando extrato..." size={28} /></div> : (
        <>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-white/5 dark:border-white/10">
            {data.items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">Sem movimentos.</li>}
            {data.items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</p>
                  <p className="break-words text-xs text-slate-500 dark:text-slate-400">{item.reason}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{when(item.createdAt)}{item.reference ? ` · ${item.reference}` : ""}{item.createdBy !== "system" ? ` · por ${item.createdBy}` : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-extrabold tabular-nums ${pointsTone(item.points)}`}>{pointsLabel(item.points)}</p>
                  <p className="text-[10px] tabular-nums text-slate-400">saldo {item.balanceAfter.toLocaleString("pt-BR")}</p>
                </div>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 pt-3 text-xs text-slate-500">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={ghostButton} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
              {page} de {pages}
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={ghostButton} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </>
      )}
    </EntityDialog>
  );
}

function ManualDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"bonus" | "desconto">("bonus");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [ruleId, setRuleId] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api<RuleRow[]>("/api/brasil-points/rules").then((list) => setRules(list.filter((rule) => rule.triggerType === "manual" && rule.isActive))).catch(() => undefined);
  }, []);
  const options = rules.filter((rule) => (kind === "bonus" ? rule.type === "earn" : rule.type === "penalty"));
  const pickRule = (id: string) => {
    setRuleId(id);
    const rule = rules.find((item) => item.id === id);
    if (rule) setPoints(String(Math.abs(rule.pointsAmount)));
  };
  const save = async () => {
    const value = Number(points);
    if (!value) return toast.error("Informe os pontos");
    if (reason.trim().length < 5) return toast.error("Escreva a justificativa", "O vendedor vê o motivo no extrato.");
    setSaving(true);
    try {
      await api("/api/brasil-points/ledger", { method: "POST", body: JSON.stringify({ userId: row.userId, points: kind === "bonus" ? value : -value, reason, ruleId: ruleId || null }) });
      toast.success(kind === "bonus" ? "Bônus lançado" : "Desconto lançado", `${row.name}: ${kind === "bonus" ? "+" : "−"}${value} pontos.`);
      onSaved();
    } catch (error) {
      toast.error("Lançamento não salvo", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <EntityDialog titleId="bp-manual" title={`Lançamento manual · ${row.name}`} description="Fica no extrato do vendedor com a sua justificativa e o seu nome." onClose={onClose} size="sm">
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setKind("bonus"); setRuleId(""); }} aria-pressed={kind === "bonus"} className={`${ghostButton} h-10 ${kind === "bonus" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : ""}`}><PlusCircle className="h-4 w-4" />Bonificar</button>
          <button type="button" onClick={() => { setKind("desconto"); setRuleId(""); }} aria-pressed={kind === "desconto"} className={`${ghostButton} h-10 ${kind === "desconto" ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" : ""}`}><MinusCircle className="h-4 w-4" />Descontar</button>
        </div>
        {options.length > 0 && (
          <label className="block space-y-1"><span className={labelClass}>Critério (opcional)</span>
            <select value={ruleId} onChange={(e) => pickRule(e.target.value)} className={inputClass}><option value="">Sem critério</option>{options.map((rule) => <option key={rule.id} value={rule.id}>{rule.title} ({pointsLabel(rule.pointsAmount)})</option>)}</select>
          </label>
        )}
        <label className="block space-y-1"><span className={labelClass}>Pontos</span><input inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d]/g, ""))} className={inputClass} required /></label>
        <label className="block space-y-1"><span className={labelClass}>Justificativa (obrigatória)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={`${inputClass} h-auto py-2`} placeholder="Ex.: Destaque no atendimento da campanha de Dia dos Pais" required minLength={5} /></label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostButton}>Cancelar</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Lançando..." : "Lançar pontos"}</button>
        </div>
      </form>
    </EntityDialog>
  );
}
