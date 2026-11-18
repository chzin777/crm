"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Grid3x3, Loader2, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { SCORE_TONE } from "@/components/RfvpBadge";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_RFVP, PILLARS, rfvpProblems, type Pillar, type RfvpSettings } from "@/lib/rfvp";

export type RfvpFilter = Record<`${Pillar}${"Min" | "Max"}` | "segment", string>;
export const EMPTY_RFVP_FILTER: RfvpFilter = { rMin: "", rMax: "", fMin: "", fMax: "", vMin: "", vMax: "", pMin: "", pMax: "", segment: "" };

type Segment = { key: string; label: string; description: string; tone: string; count: number };
type Run = { at: string; finishedAt: string | null; changed: number; events: number; punctuality: number | null; warning: string | null; error: string | null; trigger: string };
type Status = { settings: RfvpSettings; lastRun: Run | null; running: boolean; segments: Segment[]; punctuality: { customers: number; syncedAt: string | null } };

const SELECT = "h-8 cursor-pointer rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const BUTTON = "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#002187] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5";
const when = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—");

/**
 * Matriz RFV-P em /clientes-vip: segmentos (clique filtra), filtros por nota mínima/máxima de cada pilar,
 * critérios editáveis e "Recalcular RFV-P agora" (acompanha o andamento até terminar).
 */
export function RfvpPanel({ filter, onFilter, onRecalculated }: { filter: RfvpFilter; onFilter: (next: RfvpFilter) => void; onRecalculated: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [editing, setEditing] = useState(false);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/rfvp", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = (await response.json()) as Status;
    setStatus(body);
    if (wasRunning.current && !body.running) {
      const run = body.lastRun;
      if (run?.error) toast.error("Recálculo RFV-P falhou", run.error);
      else toast.success("RFV-P recalculado", `${run?.changed ?? 0} cliente(s) mudaram de código ou segmento${run?.events ? `, ${run.events} automação(ões) disparada(s)` : ""}.`);
      if (run?.warning) toast.error("Pontualidade", run.warning);
      onRecalculated();
    }
    wasRunning.current = body.running;
  }, [onRecalculated, toast]);

  useEffect(() => { void load(); }, [load]);
  // Enquanto recalcula, acompanha a cada 4 s.
  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [status?.running, load]);

  const recalculate = async () => {
    const response = await fetch("/api/rfvp", { method: "POST" }).catch(() => null);
    if (!response?.ok) { toast.error("Não foi possível iniciar o recálculo"); return; }
    wasRunning.current = true;
    setStatus((current) => (current ? { ...current, running: true } : current));
    toast.success("Recalculando RFV-P", "Sincronizando a pontualidade no VMSet e recalculando todos os clientes.");
  };

  const set = (key: keyof RfvpFilter, value: string) => onFilter({ ...filter, [key]: value });
  const active = Object.values(filter).some(Boolean);
  const run = status?.lastRun;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07194f]" aria-label="Matriz RFV-P">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#051647] dark:text-white"><Grid3x3 className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Matriz RFV-P <span className="font-mono text-xs text-slate-400">(máx. 555-5)</span></h2>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Recência, Frequência e Valor das compras no VMSet e Pontualidade do crediário, nota 1 a 5 cada. Recalcula todo dia às 6h.
            {" "}Último cálculo: {status?.running ? "em andamento..." : when(run?.finishedAt ?? null)}{run && !status?.running ? ` (${run.changed.toLocaleString("pt-BR")} mudança(s))` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} disabled={!status} className={BUTTON}><SlidersHorizontal className="h-4 w-4" />Configurar critérios RFV-P</button>
          <button type="button" onClick={() => void recalculate()} disabled={!status || status.running} className={`${BUTTON} border-transparent bg-[#C4D600] text-[#051647] hover:bg-[#C4D600] hover:brightness-105 dark:text-[#051647]`}>
            {status?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{status?.running ? "Recalculando..." : "Recalcular RFV-P agora"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(status?.segments ?? []).map((segment) => {
          const selected = filter.segment === segment.key;
          return (
            <button key={segment.key} type="button" onClick={() => set("segment", selected ? "" : segment.key)} aria-pressed={selected} title={segment.description}
              className={`inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-shadow ${segment.tone} ${selected ? "ring-2 ring-[#002187] dark:ring-[#C4D600]" : "ring-transparent hover:ring-slate-300"}`}>
              <span className="truncate">{segment.label}</span><b>{segment.count.toLocaleString("pt-BR")}</b>
            </button>
          );
        })}
        {!status && <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando segmentos...</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por nota de cada pilar">
        {PILLARS.map((pillar) => (
          <span key={pillar.key} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-white/5 dark:text-slate-300" title={pillar.hint}>
            <b className="text-[#051647] dark:text-white">{pillar.letter}</b>
            <select value={filter[`${pillar.key}Min`]} onChange={(event) => set(`${pillar.key}Min`, event.target.value)} aria-label={`${pillar.label} mínima`} className={SELECT}>
              <option value="">mín</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>≥ {score}</option>)}
            </select>
            <select value={filter[`${pillar.key}Max`]} onChange={(event) => set(`${pillar.key}Max`, event.target.value)} aria-label={`${pillar.label} máxima`} className={SELECT}>
              <option value="">máx</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>≤ {score}</option>)}
            </select>
          </span>
        ))}
        <button type="button" onClick={() => onFilter({ ...EMPTY_RFVP_FILTER, vMin: "4", pMax: "2" })} className="cursor-pointer rounded-lg px-2 py-1 text-[11px] font-semibold text-[#002187] hover:underline dark:text-[#C4D600]" title="Clientes de alto valor com pontualidade baixa">VIP com atraso (V ≥ 4 e P ≤ 2)</button>
        {active && <button type="button" onClick={() => onFilter(EMPTY_RFVP_FILTER)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-red-600"><X className="h-3.5 w-3.5" />Limpar filtros RFV-P</button>}
      </div>

      {editing && status && <CriteriaDialog current={status.settings} onClose={() => setEditing(false)} onSaved={(settings) => { setStatus({ ...status, settings }); setEditing(false); }} onRecalculate={() => void recalculate()} />}
    </section>
  );
}

type Draft = { recency: string[]; frequency: string[]; fMonths: string; value: string[]; vMonths: string; metric: "total" | "avg"; onTime: string[]; delay: string[]; pMonths: string; grace: string; severe: string; noCredit: string };

const toDraft = (s: RfvpSettings): Draft => ({
  recency: s.recency.cuts.map(String), frequency: s.frequency.cuts.map(String), fMonths: String(s.frequency.months), value: s.value.cuts.map(String), vMonths: String(s.value.months), metric: s.value.metric,
  onTime: s.punctuality.onTime.map(String), delay: s.punctuality.delay.map(String), pMonths: String(s.punctuality.months), grace: String(s.punctuality.graceDays), severe: String(s.punctuality.severeOverdueDays), noCredit: String(s.punctuality.noCredit),
});
const cuts = (list: string[]) => list.map((item) => Number(item)) as [number, number, number, number];
const fromDraft = (d: Draft): RfvpSettings => ({
  recency: { cuts: cuts(d.recency) },
  frequency: { months: Number(d.fMonths), cuts: cuts(d.frequency) },
  value: { months: Number(d.vMonths), metric: d.metric, cuts: cuts(d.value) },
  punctuality: { months: Number(d.pMonths), graceDays: Number(d.grace), onTime: cuts(d.onTime), delay: cuts(d.delay), severeOverdueDays: Number(d.severe), noCredit: Number(d.noCredit) },
});

const NUM = "h-8 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white";

/** Uma linha de faixas: nota 5, 4, 3 e 2 (a nota 1 é o resto). */
function CutsRow({ label, prefix, suffix, values, onChange }: { label: string; prefix: string; suffix: string; values: string[]; onChange: (index: number, value: string) => void }) {
  return (
    <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] items-end gap-1.5">
      {[0, 1, 2, 3].map((index) => (
        <label key={index} className="block min-w-0 space-y-1">
          <span className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${SCORE_TONE[5 - index]}`} title={`Nota ${5 - index}`}>{5 - index}</span>
          <span className="block text-[9px] text-slate-500 dark:text-slate-400">{prefix}</span>
          <input type="number" min={0} value={values[index]} onChange={(event) => onChange(index, event.target.value)} aria-label={`${label} nota ${5 - index}`} className={NUM} />
          <span className="block text-[9px] text-slate-400">{suffix}</span>
        </label>
      ))}
      <div className="space-y-1">
        <span className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${SCORE_TONE[1]}`}>1</span>
        <span className="block text-[10px] text-slate-500 dark:text-slate-400">o resto</span>
      </div>
    </div>
  );
}

/** "Configurar critérios RFV-P": faixas das notas 5 a 2 de cada pilar, janelas e regras da pontualidade. */
function CriteriaDialog({ current, onClose, onSaved, onRecalculate }: { current: RfvpSettings; onClose: () => void; onSaved: (settings: RfvpSettings) => void; onRecalculate: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(current));
  const [saving, setSaving] = useState(false);
  const settings = fromDraft(draft);
  const invalid = Object.values(draft).flat().some((item) => item === "" || Number.isNaN(Number(item)));
  const problems = invalid ? ["Preencha todos os campos com números."] : rfvpProblems(settings);
  const setCut = (key: "recency" | "frequency" | "value" | "onTime" | "delay") => (index: number, value: string) => setDraft((d) => ({ ...d, [key]: d[key].map((item, i) => (i === index ? value : item)) }));
  const setField = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async (recalc: boolean) => {
    setSaving(true);
    try {
      const response = await fetch("/api/rfvp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; settings?: RfvpSettings };
      if (!response.ok || !body.settings) throw new Error(body.error ?? "Não foi possível salvar.");
      toast.success("Critérios RFV-P salvos", recalc ? "Recalculando os clientes com as novas faixas." : "Valem a partir do próximo recálculo.");
      onSaved(body.settings);
      if (recalc) onRecalculate();
    } catch (error) {
      toast.error("Critérios RFV-P", error instanceof Error ? error.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const section = "space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700";
  const title = (letter: string, text: string, hint: string) => (
    <div><p className="text-xs font-bold text-[#051647] dark:text-white"><span className="mr-1 rounded bg-[#002187] px-1.5 py-0.5 font-mono text-white">{letter}</span>{text}</p><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p></div>
  );
  const months = (key: "fMonths" | "vMonths" | "pMonths") => (
    <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">Janela de<input type="number" min={1} max={120} value={draft[key]} onChange={(event) => setField(key, event.target.value)} aria-label="Janela em meses" className={`${NUM} w-16`} />meses</label>
  );

  return (
    <EntityDialog titleId="criterios-rfvp" title="Configurar critérios RFV-P" description="Defina quando cada pilar recebe nota 5, 4, 3 ou 2 (o que sobrar é nota 1). O código final vai de 111-1 a 555-5." onClose={onClose} size="lg">
      <div className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={section}>
            {title("R", "Recência", "Dias desde a última compra concluída no VMSet. Nunca comprou = 1.")}
            <CutsRow label="Recência" prefix="até" suffix="dias" values={draft.recency} onChange={setCut("recency")} />
          </div>
          <div className={section}>
            {title("F", "Frequência", "Quantidade de compras (pedidos) concluídas na janela.")}
            {months("fMonths")}
            <CutsRow label="Frequência" prefix="a partir de" suffix="compras" values={draft.frequency} onChange={setCut("frequency")} />
          </div>
          <div className={section}>
            {title("V", "Valor", "Total gasto ou ticket médio na janela.")}
            <div className="flex flex-wrap items-center gap-3">
              {months("vMonths")}
              <select value={draft.metric} onChange={(event) => setField("metric", event.target.value)} aria-label="Métrica de valor" className={SELECT}>
                <option value="total">Valor total acumulado</option>
                <option value="avg">Ticket médio por compra</option>
              </select>
            </div>
            <CutsRow label="Valor" prefix="a partir de R$" suffix="" values={draft.value} onChange={setCut("value")} />
          </div>
          <div className={section}>
            {title("P", "Pontualidade", "Parcelas de carnê, boleto e crédito interno vencidas na janela. Nota k quando o % pago em dia OU o atraso médio atinge a faixa.")}
            <div className="flex flex-wrap items-center gap-3">
              {months("pMonths")}
              <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">Tolerância<input type="number" min={0} max={30} value={draft.grace} onChange={(event) => setField("grace", event.target.value)} aria-label="Dias de tolerância" className={`${NUM} w-14`} />dia(s)</label>
            </div>
            <CutsRow label="% em dia" prefix="em dia ≥" suffix="%" values={draft.onTime} onChange={setCut("onTime")} />
            <CutsRow label="Atraso médio" prefix="ou atraso ≤" suffix="dias" values={draft.delay} onChange={setCut("delay")} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1 text-[11px] text-slate-600 dark:text-slate-300">Título em aberto vencido há mais de (dias) = nota 1<input type="number" min={1} value={draft.severe} onChange={(event) => setField("severe", event.target.value)} className={NUM} /></label>
              <label className="block space-y-1 text-[11px] text-slate-600 dark:text-slate-300">Sem crediário (só à vista / PIX / cartão)
                <select value={draft.noCredit} onChange={(event) => setField("noCredit", event.target.value)} className={`${SELECT} w-full`}>{[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>Nota {score}</option>)}</select>
              </label>
            </div>
          </div>
        </div>
        {problems.length > 0 && <p role="alert" className="text-xs text-red-600">{problems[0]}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setDraft(toDraft(DEFAULT_RFVP))} className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-[#002187] dark:hover:text-[#C4D600]">Restaurar padrão</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Cancelar</button>
            <button type="button" onClick={() => void save(false)} disabled={saving || problems.length > 0} className="h-9 cursor-pointer rounded-lg border border-[#002187] px-4 text-sm font-semibold text-[#002187] hover:bg-[#002187]/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#C4D600] dark:text-[#C4D600]">Salvar</button>
            <button type="button" onClick={() => void save(true)} disabled={saving || problems.length > 0} className="h-9 cursor-pointer rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Salvando..." : "Salvar e recalcular"}</button>
          </div>
        </div>
      </div>
    </EntityDialog>
  );
}
