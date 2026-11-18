"use client";

import { useState, type ReactNode } from "react";
import { Banknote, CalendarClock, Gem, Repeat, RotateCcw, ShieldCheck, type LucideIcon } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { SCORE_TONE } from "@/components/RfvpBadge";
import { TierBadge } from "@/components/TierBadge";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_RFVP, rfvpProblems, type RfvpSettings } from "@/lib/rfvp";
import { DEFAULT_THRESHOLDS, thresholdProblems, type TierThresholds } from "@/lib/scoring";

type Tab = "r" | "f" | "v" | "p" | "tiers";
type Cuts4 = [string, string, string, string];
type Draft = {
  recency: Cuts4; frequency: Cuts4; fMonths: string; value: Cuts4; vMonths: string; metric: "total" | "avg";
  onTime: Cuts4; delay: Cuts4; pMonths: string; grace: string; severe: string; noCredit: string;
  prata: string; ouro: string; diamante: string;
};

const four = (list: readonly number[]) => list.map(String) as Cuts4;
const toDraft = (s: RfvpSettings, t: TierThresholds): Draft => ({
  recency: four(s.recency.cuts), frequency: four(s.frequency.cuts), fMonths: String(s.frequency.months), value: four(s.value.cuts), vMonths: String(s.value.months), metric: s.value.metric,
  onTime: four(s.punctuality.onTime), delay: four(s.punctuality.delay), pMonths: String(s.punctuality.months), grace: String(s.punctuality.graceDays), severe: String(s.punctuality.severeOverdueDays), noCredit: String(s.punctuality.noCredit),
  prata: String(t.PRATA), ouro: String(t.OURO), diamante: String(t.DIAMANTE),
});
const nums = (list: Cuts4) => list.map(Number) as [number, number, number, number];
const toSettings = (d: Draft): RfvpSettings => ({
  recency: { cuts: nums(d.recency) },
  frequency: { months: Number(d.fMonths), cuts: nums(d.frequency) },
  value: { months: Number(d.vMonths), metric: d.metric, cuts: nums(d.value) },
  punctuality: { months: Number(d.pMonths), graceDays: Number(d.grace), onTime: nums(d.onTime), delay: nums(d.delay), severeOverdueDays: Number(d.severe), noCredit: Number(d.noCredit) },
});
const toThresholds = (d: Draft): TierThresholds => ({ PRATA: Number(d.prata), OURO: Number(d.ouro), DIAMANTE: Number(d.diamante) });
const blank = (values: string[]) => values.some((item) => item.trim() === "" || Number.isNaN(Number(item)));

const TABS: { id: Tab; letter: string; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "r", letter: "R", label: "Recência", icon: CalendarClock, hint: "Há quanto tempo o cliente fez a última compra concluída no VMSet." },
  { id: "f", letter: "F", label: "Frequência", icon: Repeat, hint: "Quantas compras (pedidos) o cliente fez dentro da janela." },
  { id: "v", letter: "V", label: "Valor", icon: Banknote, hint: "Quanto o cliente gastou na janela: valor acumulado ou ticket médio por compra." },
  { id: "p", letter: "P", label: "Pontualidade", icon: ShieldCheck, hint: "Como o cliente paga o crediário (carnê, boleto e crédito interno) que venceu na janela." },
  { id: "tiers", letter: "", label: "Níveis", icon: Gem, hint: "Pontos de Lead Score necessários para cada nível. Ao salvar, os clientes são reclassificados na hora." },
];

const NUM = "h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/20";
const SELECT = "h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white";

/** Campo numérico com prefixo/sufixo ("R$", "dias", "%"). */
function Num({ value, onChange, label, prefix, suffix, min = 0, max }: { value: string; onChange: (value: string) => void; label: string; prefix?: string; suffix?: string; min?: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {prefix && <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{prefix}</span>}
      <input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className={NUM} />
      {suffix && <span className="text-xs text-slate-500 dark:text-slate-400">{suffix}</span>}
    </span>
  );
}

/** Uma linha da grade de notas: badge da nota + critério em português. */
function ScoreRow({ score, children }: { score: number; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${SCORE_TONE[score]}`} aria-label={`Nota ${score}`}>{score}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-slate-700 dark:text-slate-200">{children}</div>
    </li>
  );
}

function Window({ value, onChange, children }: { value: string; onChange: (value: string) => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-200">
      <span className="inline-flex items-center gap-2">Considerar os últimos <Num value={value} onChange={onChange} label="Janela em meses" suffix="meses" min={1} max={120} /></span>
      {children}
    </div>
  );
}

/**
 * "Parametrizar RFV-P & Níveis": uma aba por pilar (R, F, V, P) com a grade das notas 5 a 1 em português e uma aba de
 * faixas dos níveis do Lead Score. Salva os dois e, se pedido, já recalcula a matriz.
 */
export function ScoringSettingsDialog({ rfvp, thresholds, onClose, onSaved }: { rfvp: RfvpSettings; thresholds: TierThresholds; onClose: () => void; onSaved: (recalculate: boolean) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("r");
  const [draft, setDraft] = useState<Draft>(() => toDraft(rfvp, thresholds));
  const [saving, setSaving] = useState(false);
  const initial = toDraft(rfvp, thresholds);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setCut = (key: "recency" | "frequency" | "value" | "onTime" | "delay", index: number) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: current[key].map((item, i) => (i === index ? value : item)) as Cuts4 }));

  const rfvpBlank = blank([...draft.recency, ...draft.frequency, ...draft.value, ...draft.onTime, ...draft.delay, draft.fMonths, draft.vMonths, draft.pMonths, draft.grace, draft.severe]);
  const tiersBlank = blank([draft.prata, draft.ouro, draft.diamante]);
  const settings = toSettings(draft);
  const problems = rfvpBlank ? ["Preencha todos os campos do RFV-P com números."] : rfvpProblems(settings);
  const tierIssues = tiersBlank ? ["Preencha as três faixas dos níveis."] : thresholdProblems(toThresholds(draft));
  const tabProblem: Record<Tab, boolean> = {
    r: problems.some((item) => item.startsWith("Recência")),
    f: problems.some((item) => item.startsWith("Frequência")),
    v: problems.some((item) => item.startsWith("Valor")),
    p: problems.some((item) => item.startsWith("Pontualidade")),
    tiers: tierIssues.length > 0,
  };
  const allProblems = [...problems, ...tierIssues];
  const rfvpChanged = JSON.stringify(toSettings(initial)) !== JSON.stringify(settings);
  const tiersChanged = initial.prata !== draft.prata || initial.ouro !== draft.ouro || initial.diamante !== draft.diamante;

  const restore = () => {
    const d = toDraft(DEFAULT_RFVP, DEFAULT_THRESHOLDS);
    const pick: Record<Tab, (keyof Draft)[]> = {
      r: ["recency"], f: ["frequency", "fMonths"], v: ["value", "vMonths", "metric"],
      p: ["onTime", "delay", "pMonths", "grace", "severe", "noCredit"], tiers: ["prata", "ouro", "diamante"],
    };
    setDraft((current) => ({ ...current, ...Object.fromEntries(pick[tab].map((key) => [key, d[key]])) }));
  };

  const save = async (recalculate: boolean) => {
    if (allProblems.length) return;
    setSaving(true);
    try {
      if (rfvpChanged || recalculate) {
        const response = await fetch("/api/rfvp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar os critérios RFV-P.");
      }
      let moved = 0;
      if (tiersChanged) {
        const response = await fetch("/api/scoring", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thresholds: toThresholds(draft) }) });
        const body = (await response.json().catch(() => ({}))) as { error?: string; moved?: number };
        if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar as faixas dos níveis.");
        moved = body.moved ?? 0;
      }
      toast.success("Parâmetros salvos", [tiersChanged ? `${moved} cliente(s) mudaram de nível` : "", recalculate ? "recalculando o RFV-P" : rfvpChanged ? "o RFV-P muda no próximo recálculo" : ""].filter(Boolean).join(" · ") || "Nada mudou.");
      onSaved(recalculate);
    } catch (error) {
      toast.error("Parametrizar RFV-P & Níveis", error instanceof Error ? error.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const active = TABS.find((item) => item.id === tab)!;
  const [r5, r4, r3, r2] = draft.recency;
  const money = (value: string) => Number(value || 0).toLocaleString("pt-BR");

  return (
    <EntityDialog titleId="parametrizar-rfvp" title="Parametrizar RFV-P & Níveis" description="Defina como cada pilar da matriz RFV-P (escala 555-5) recebe nota de 1 a 5 e as faixas de pontos dos níveis." onClose={onClose} size="xl">
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <nav role="tablist" aria-label="Pilares" className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col md:overflow-visible">
          {TABS.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.id;
            return (
              <button key={item.id} type="button" role="tab" aria-selected={selected} onClick={() => setTab(item.id)}
                className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${selected ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}>
                {item.letter ? <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-xs font-bold ${selected ? "bg-white/15 dark:bg-[#051647]/15" : "bg-slate-100 text-[#002187] dark:bg-white/10 dark:text-[#C4D600]"}`}>{item.letter}</span> : <Icon className="h-4 w-4 shrink-0" aria-hidden />}
                <span className="flex-1">{item.label}</span>
                {tabProblem[item.id] && <span className="h-2 w-2 shrink-0 rounded-full bg-[#F7915E]" aria-label="Com problema" />}
              </button>
            );
          })}
        </nav>

        <div role="tabpanel" aria-label={active.label} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#002187]/10 text-[#002187] dark:bg-white/10 dark:text-[#C4D600]"><active.icon className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[#051647] dark:text-white">{active.letter ? `${active.letter} · ${active.label}` : "Níveis do Lead Score"}</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{active.hint}</p>
            </div>
          </div>

          {tab === "r" && (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              <ScoreRow score={5}>Comprou nos últimos <Num value={r5} onChange={setCut("recency", 0)} label="Nota 5 até" suffix="dias" /></ScoreRow>
              <ScoreRow score={4}>Última compra há até <Num value={r4} onChange={setCut("recency", 1)} label="Nota 4 até" suffix="dias" /></ScoreRow>
              <ScoreRow score={3}>Última compra há até <Num value={r3} onChange={setCut("recency", 2)} label="Nota 3 até" suffix="dias" /></ScoreRow>
              <ScoreRow score={2}>Última compra há até <Num value={r2} onChange={setCut("recency", 3)} label="Nota 2 até" suffix="dias" /></ScoreRow>
              <ScoreRow score={1}><span className="text-slate-500 dark:text-slate-400">Mais de {r2 || "—"} dias sem comprar, ou nunca comprou</span></ScoreRow>
            </ul>
          )}

          {tab === "f" && (
            <>
              <Window value={draft.fMonths} onChange={(value) => set("fMonths", value)} />
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {[5, 4, 3, 2].map((score, index) => (
                  <ScoreRow key={score} score={score}><Num value={draft.frequency[index]} onChange={setCut("frequency", index)} label={`Nota ${score} a partir de`} suffix="compras ou mais" min={1} /></ScoreRow>
                ))}
                <ScoreRow score={1}><span className="text-slate-500 dark:text-slate-400">Menos de {draft.frequency[3] || "—"} compra(s) na janela (inclui quem não comprou)</span></ScoreRow>
              </ul>
            </>
          )}

          {tab === "v" && (
            <>
              <Window value={draft.vMonths} onChange={(value) => set("vMonths", value)}>
                <span className="inline-flex items-center gap-2">Medir por
                  <span className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800" role="radiogroup" aria-label="Métrica de valor">
                    {(["total", "avg"] as const).map((metric) => (
                      <button key={metric} type="button" role="radio" aria-checked={draft.metric === metric} onClick={() => set("metric", metric)} className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold ${draft.metric === metric ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"}`}>{metric === "total" ? "Valor acumulado" : "Ticket médio"}</button>
                    ))}
                  </span>
                </span>
              </Window>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {[5, 4, 3, 2].map((score, index) => (
                  <ScoreRow key={score} score={score}>{draft.metric === "avg" ? "Ticket médio de" : "Gastou"} <Num value={draft.value[index]} onChange={setCut("value", index)} label={`Nota ${score} a partir de`} prefix="R$" suffix="ou mais" /></ScoreRow>
                ))}
                <ScoreRow score={1}><span className="text-slate-500 dark:text-slate-400">Abaixo de R$ {money(draft.value[3])} (inclui quem não comprou)</span></ScoreRow>
              </ul>
            </>
          )}

          {tab === "p" && (
            <>
              <Window value={draft.pMonths} onChange={(value) => set("pMonths", value)}>
                <span className="inline-flex items-center gap-2">Tolerância <Num value={draft.grace} onChange={(value) => set("grace", value)} label="Dias de tolerância" suffix="dia(s) após o vencimento" max={30} /></span>
              </Window>
              <p className="text-xs text-slate-500 dark:text-slate-400">A nota é dada quando <b>qualquer uma</b> das duas condições é atendida.</p>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {[5, 4, 3, 2].map((score, index) => (
                  <ScoreRow key={score} score={score}>
                    <Num value={draft.onTime[index]} onChange={setCut("onTime", index)} label={`Nota ${score}: % em dia`} suffix="% ou mais das parcelas pagas em dia" max={100} />
                    <span className="text-xs font-semibold uppercase text-slate-400">ou</span>
                    <span className="inline-flex items-center gap-1.5">atraso médio de até <Num value={draft.delay[index]} onChange={setCut("delay", index)} label={`Nota ${score}: atraso médio até`} suffix="dias" /></span>
                  </ScoreRow>
                ))}
                <ScoreRow score={1}>
                  <span className="text-slate-500 dark:text-slate-400">Abaixo disso, ou com parcela vencida em aberto há mais de</span>
                  <Num value={draft.severe} onChange={(value) => set("severe", value)} label="Dias de atraso grave" suffix="dias" min={1} />
                </ScoreRow>
              </ul>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#C4D600]/60 bg-[#C4D600]/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" aria-hidden />
                <span className="min-w-0 flex-1">Clientes <b>sem crediário</b> na janela (compram à vista, PIX ou cartão) recebem</span>
                <select value={draft.noCredit} onChange={(event) => set("noCredit", event.target.value)} aria-label="Nota para clientes sem crediário" className={SELECT}>
                  {[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>Nota {score}</option>)}
                </select>
              </div>
            </>
          )}

          {tab === "tiers" && (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {([["DIAMANTE", "diamante"], ["OURO", "ouro"], ["PRATA", "prata"]] as const).map(([tier, key]) => (
                <li key={tier} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <TierBadge tier={tier} size="md" />
                  <span className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">A partir de <Num value={draft[key]} onChange={(value) => set(key, value)} label={`Pontos mínimos ${tier}`} suffix="pts" /></span>
                </li>
              ))}
              <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <TierBadge tier="BRONZE" size="md" />
                <span className="text-sm text-slate-500 dark:text-slate-400">De 0 a {Math.max(0, Number(draft.prata || 0) - 1)} pts</span>
              </li>
            </ul>
          )}

          {(tab === "tiers" ? tierIssues : problems.filter((item) => item.startsWith(active.label) || item.startsWith("Preencha"))).slice(0, 1).map((item) => (
            <p key={item} role="alert" className="rounded-lg bg-[#F7915E]/15 px-3 py-2 text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{item}</p>
          ))}
        </div>
      </div>

      <footer className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <button type="button" onClick={restore} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/5 dark:hover:text-[#C4D600]">
          <RotateCcw className="h-3.5 w-3.5" />Restaurar padrão recomendado
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Cancelar</button>
          <button type="button" onClick={() => void save(false)} disabled={saving || allProblems.length > 0 || (!rfvpChanged && !tiersChanged)} className="h-9 cursor-pointer rounded-lg border border-[#002187] px-4 text-sm font-semibold text-[#002187] hover:bg-[#002187]/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#C4D600] dark:text-[#C4D600]">Salvar</button>
          <button type="button" onClick={() => void save(true)} disabled={saving || allProblems.length > 0} className="h-9 cursor-pointer rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Salvando..." : "Salvar e recalcular RFV-P"}</button>
        </div>
      </footer>
    </EntityDialog>
  );
}
