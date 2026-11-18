"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, Minus, Plus, Settings2, TrendingUp, UserRound } from "lucide-react";
import { TierBadge } from "@/components/TierBadge";
import { RfvpDetail, type ContactRfvpView } from "@/components/RfvpBadge";
import { useToast } from "@/components/ToastProvider";
import { isTier, TIER_META, TIERS, type Tier, type TierThresholds } from "@/lib/scoring";

type Log = { id: string; delta: number; scoreAfter: number; tierBefore: string; tierAfter: string; reason: string; source: string; createdAt: string };
type Data = { score: number; tier: string; scoreUpdatedAt: string | null; thresholds: TierThresholds; rfvp: ContactRfvpView | null; logs: Log[] };

const INPUT = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const when = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const SOURCE: Record<string, { label: string; icon: typeof Bot }> = {
  automacao: { label: "Automação", icon: Bot },
  equipe: { label: "Equipe", icon: UserRound },
  sistema: { label: "Sistema", icon: Settings2 },
};

/** Pontos mínimos de cada nível (Bronze começa em 0). */
const tierStart = (tier: Tier, t: TierThresholds) => (tier === "BRONZE" ? 0 : t[tier]);

/** Quanto falta para o próximo nível e o progresso dentro da faixa atual. */
export function tierProgress(score: number, tier: string, thresholds: TierThresholds) {
  const current: Tier = isTier(tier) ? tier : "BRONZE";
  const index = TIERS.indexOf(current);
  const next = TIERS[index + 1] as Tier | undefined;
  if (!next) return { next: null, missing: 0, percent: 100 };
  const start = tierStart(current, thresholds);
  const end = tierStart(next, thresholds);
  const percent = Math.min(100, Math.max(0, Math.round(((score - start) / Math.max(1, end - start)) * 100)));
  return { next, missing: Math.max(0, end - score), percent };
}

/**
 * Aba "Pontuação" da ficha do cliente: Lead Score com nível e barra para o próximo nível, matriz RFV-P explicada,
 * histórico completo de pontos e ajuste manual com justificativa.
 */
export function ContactScoreTab({ contactId, onChanged }: { contactId: string; onChanged?: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/scoring/${contactId}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData((await response.json()) as Data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [contactId]);
  useEffect(() => { void load(); }, [load]);

  const points = Number(delta);
  const valid = delta.trim() !== "" && Number.isInteger(points) && points !== 0 && reason.trim().length > 0;

  const adjust = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/scoring/${contactId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta: points, reason }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; change?: { score: number; tier: string } };
      if (!response.ok || !body.change) throw new Error(body.error ?? "Não foi possível ajustar.");
      toast.success("Pontos ajustados", `Novo saldo: ${body.change.score.toLocaleString("pt-BR")} pts (${TIER_META[body.change.tier as Tier]?.label ?? body.change.tier}).`);
      setDelta("");
      setReason("");
      await load();
      onChanged?.();
    } catch (error) {
      toast.error("Ajustar pontos", error instanceof Error ? error.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  if (failed) return <p className="py-6 text-center text-xs text-slate-500">Não foi possível carregar a pontuação.</p>;
  if (!data) return <p className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando pontuação...</p>;

  const progress = tierProgress(data.score, data.tier, data.thresholds);
  const gained = data.logs.filter((log) => log.delta > 0).reduce((sum, log) => sum + log.delta, 0);
  const lost = data.logs.filter((log) => log.delta < 0).reduce((sum, log) => sum + log.delta, 0);

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label="Lead Score">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Lead Score</span>
            <TierBadge tier={data.tier} size="md" />
          </div>
          <p className="text-3xl font-bold tracking-tight text-[#051647] dark:text-white">{data.score.toLocaleString("pt-BR")}<span className="ml-1 text-sm font-semibold text-slate-400">pts</span></p>
          <div className="space-y-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Progresso para o próximo nível">
              <div className="h-full rounded-full bg-[#C4D600] transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {progress.next ? <>Faltam <b className="text-[#051647] dark:text-white">{progress.missing.toLocaleString("pt-BR")} pts</b> para {TIER_META[progress.next].label}</> : "Nível máximo atingido"}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center dark:border-slate-800">
            <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Ganhos</dt><dd className="text-sm font-bold text-emerald-600 dark:text-emerald-300">+{gained.toLocaleString("pt-BR")}</dd></div>
            <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Perdidos</dt><dd className="text-sm font-bold text-red-600 dark:text-red-300">{lost.toLocaleString("pt-BR")}</dd></div>
            <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Movimentações</dt><dd className="text-sm font-bold text-[#051647] dark:text-white">{data.logs.length}</dd></div>
          </dl>
        </section>
        {data.rfvp ? <RfvpDetail rfvp={data.rfvp} /> : <section className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700">Matriz RFV-P indisponível para este contato.</section>}
      </div>

      <section className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label="Ajuste manual de pontos">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ajuste manual</p>
        <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setDelta(String((Number(delta) || 0) - 10))} aria-label="Tirar 10 pontos" className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5"><Minus className="h-3.5 w-3.5" /></button>
            <input type="number" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="+50 / -20" aria-label="Pontos (positivo soma, negativo tira)" className={`${INPUT} text-center`} />
            <button type="button" onClick={() => setDelta(String((Number(delta) || 0) + 10))} aria-label="Somar 10 pontos" className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <input value={reason} onChange={(event) => setReason(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void adjust(); }} placeholder="Justificativa (ex.: indicou um amigo)" aria-label="Justificativa" maxLength={200} className={INPUT} />
          <button type="button" onClick={() => void adjust()} disabled={!valid || saving} className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#C4D600] dark:text-[#051647]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}Aplicar
          </button>
        </div>
      </section>

      <section className="space-y-2" aria-label="Histórico de pontos">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Histórico de movimentações</p>
        {data.logs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Nenhuma movimentação de pontos ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {data.logs.map((log) => {
              const source = SOURCE[log.source] ?? SOURCE.sistema;
              const Icon = source.icon;
              const changedTier = log.tierBefore !== log.tierAfter;
              return (
                <li key={log.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                  <span className={`w-14 shrink-0 text-right text-sm font-bold ${log.delta >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>{log.delta > 0 ? "+" : ""}{log.delta.toLocaleString("pt-BR")}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-medium text-slate-800 dark:text-slate-100">{log.reason || "Ajuste de pontos"}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" aria-hidden />{source.label}</span>
                      <span>{when(log.createdAt)}</span>
                      <span>saldo {log.scoreAfter.toLocaleString("pt-BR")} pts</span>
                      {changedTier && <span className="font-semibold text-[#002187] dark:text-[#C4D600]">{TIER_META[log.tierBefore as Tier]?.label ?? log.tierBefore} → {TIER_META[log.tierAfter as Tier]?.label ?? log.tierAfter}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
