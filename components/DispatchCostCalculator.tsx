"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, Save, Users } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { FormMultiSelect } from "@/components/FormMultiSelect";
import { useToast } from "@/components/ToastProvider";
import { useMetaPricing } from "@/hooks/useMetaPricing";
import { formatBrl, formatUsd, parseDecimal, PRICING_CATEGORIES, usdPrice, type PricingCategory } from "@/lib/meta-pricing-shared";

export type CostSegmentOption = { id: string; nome: string; count?: number };
/** Destinatários únicos dos segmentos (união sem repetir pessoa) e a soma simples, calculados pela página. */
export type ResolveUniqueAudience = (segmentIds: string[]) => Promise<{ unique: number; raw: number }>;

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";

/**
 * Calculadora de custo de disparo: segmentos (com deduplicação real) ou quantidade manual, categoria do modelo,
 * custo em R$ e US$, e edição da tabela da Meta (US$ por mensagem) e da cotação do dólar.
 */
export function DispatchCostCalculator({
  segments,
  resolveUnique,
  initialSegmentIds = [],
  initialCategory = "marketing",
  onClose,
}: {
  segments: CostSegmentOption[];
  resolveUnique: ResolveUniqueAudience;
  initialSegmentIds?: string[];
  initialCategory?: PricingCategory;
  onClose: () => void;
}) {
  const toast = useToast();
  const { pricing, save } = useMetaPricing();
  const [source, setSource] = useState<"segmentos" | "manual">(initialSegmentIds.length > 0 || segments.length > 0 ? "segmentos" : "manual");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSegmentIds);
  const [manual, setManual] = useState("1000");
  const [category, setCategory] = useState<PricingCategory>(initialCategory);
  const [audience, setAudience] = useState<{ signature: string; loading: boolean; unique?: number; raw?: number; error?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<PricingCategory | "rate", string>>({ marketing: "", utility: "", authentication: "", rate: "" });
  const [saving, setSaving] = useState(false);

  const signature = JSON.stringify([...selectedIds].sort());
  useEffect(() => {
    if (source !== "segmentos" || selectedIds.length === 0) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setAudience({ signature, loading: true });
      resolveUnique(selectedIds)
        .then((result) => { if (active) setAudience({ signature, loading: false, ...result }); })
        .catch((error: unknown) => { if (active) setAudience({ signature, loading: false, error: error instanceof Error ? error.message : "Não foi possível calcular o público." }); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só quando a seleção muda
  }, [source, signature]);

  const current = audience?.signature === signature ? audience : null;
  const manualCount = Math.max(0, Math.floor(parseDecimal(manual) || 0));
  const recipients = source === "manual" ? manualCount : selectedIds.length === 0 ? 0 : current?.unique ?? null;
  const unitBrl = pricing[category];
  const unitUsd = usdPrice(pricing, category);
  const totalBrl = recipients === null ? null : recipients * unitBrl;
  const totalUsd = recipients === null ? null : recipients * unitUsd;

  const segmentNames = useMemo(() => segments.map((segment) => segment.nome), [segments]);
  const selectedNames = segments.filter((segment) => selectedIds.includes(segment.id)).map((segment) => segment.nome);

  const startEditing = () => {
    const four = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    setDraft({
      marketing: four(usdPrice(pricing, "marketing")),
      utility: four(usdPrice(pricing, "utility")),
      authentication: four(usdPrice(pricing, "authentication")),
      rate: pricing.usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
    });
    setEditing(true);
  };

  const saveRates = async () => {
    const values = { marketing: parseDecimal(draft.marketing), utility: parseDecimal(draft.utility), authentication: parseDecimal(draft.authentication) };
    const rate = parseDecimal(draft.rate);
    if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0) || !Number.isFinite(rate) || rate <= 0) {
      toast.error("Valores inválidos", "Use números como 0,0625 para as tarifas e 5,50 para a cotação.");
      return;
    }
    setSaving(true);
    try {
      await save(values, rate);
      toast.success("Tarifas atualizadas", "As estimativas de custo e as métricas de campanha já usam os novos valores.");
      setEditing(false);
    } catch (error) {
      toast.error("Não foi possível salvar as tarifas", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityDialog titleId="dispatch-cost-calculator" title="Calculadora de custo de disparo" description="Estimativa pela tabela da Meta para o Brasil: cada mensagem de modelo entregue é cobrada conforme a categoria." onClose={onClose} size="lg">
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Público</p>
            <div role="radiogroup" aria-label="Origem do público" className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {([["segmentos", "Segmentos"], ["manual", "Quantidade manual"]] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={source === value} onClick={() => setSource(value)} className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition ${source === value ? "bg-white text-[#051647] shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-[#051647] dark:text-slate-400 dark:hover:text-white"}`}>{label}</button>
              ))}
            </div>
            {source === "segmentos" ? (
              <div className="space-y-2">
                <FormMultiSelect
                  label="Segmentos"
                  selected={selectedNames}
                  options={segmentNames}
                  onChange={(names) => setSelectedIds(segments.filter((segment) => names.includes(segment.nome)).map((segment) => segment.id))}
                  placeholder="Selecione um ou mais segmentos"
                />
                {selectedIds.length > 0 && current?.loading && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cruzando os segmentos...</p>}
                {current?.error && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{current.error}</p>}
                {current && !current.loading && current.unique !== undefined && current.raw !== undefined && selectedIds.length > 1 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Soma dos segmentos: {current.raw.toLocaleString("pt-BR")} · únicos após unir: <b className="text-slate-700 dark:text-slate-200">{current.unique.toLocaleString("pt-BR")}</b>
                    {current.raw > current.unique ? ` (${(current.raw - current.unique).toLocaleString("pt-BR")} repetidos não são cobrados)` : ""}
                  </p>
                )}
              </div>
            ) : (
              <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>Quantidade de destinatários</span>
                <input inputMode="numeric" value={manual} onChange={(event) => setManual(event.target.value.replace(/[^\d]/g, ""))} className={inputClass} />
              </label>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Categoria do modelo</p>
            <div role="radiogroup" aria-label="Categoria do modelo" className="grid gap-2 sm:grid-cols-3">
              {PRICING_CATEGORIES.map((item) => {
                const selected = category === item.key;
                return (
                  <button key={item.key} type="button" role="radio" aria-checked={selected} onClick={() => setCategory(item.key)} className={`cursor-pointer rounded-xl border p-3 text-left transition ${selected ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"}`}>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{item.hint}</span>
                    <span className="mt-2 block text-xs font-semibold tabular-nums text-[#002187] dark:text-[#C4D600]">{formatBrl(pricing[item.key], 4)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tabela da Meta e câmbio</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Valores em US$ por mensagem entregue · US$ 1 = {formatBrl(pricing.usdBrlRate, 2)}</p>
              </div>
              {!editing && <button type="button" onClick={startEditing} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Editar tarifas</button>}
            </div>
            {editing ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  {PRICING_CATEGORIES.map((item) => (
                    <label key={item.key} className="block space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <span>{item.label} (US$)</span>
                      <input inputMode="decimal" value={draft[item.key]} onChange={(event) => setDraft((current) => ({ ...current, [item.key]: event.target.value }))} className={inputClass} />
                    </label>
                  ))}
                  <label className="block space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>Cotação US$ → R$</span>
                    <input inputMode="decimal" value={draft.rate} onChange={(event) => setDraft((current) => ({ ...current, rate: event.target.value }))} className={inputClass} />
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Os valores salvos também passam a valer no gasto das campanhas e em Configurações.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditing(false)} disabled={saving} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
                  <button type="button" onClick={() => void saveRates()} disabled={saving} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#051647] px-3 py-2 text-xs font-semibold text-white hover:bg-[#002187] disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#d4e400]">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar tarifas
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-3 gap-2 text-xs">
                {PRICING_CATEGORIES.map((item) => (
                  <div key={item.key} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
                    <dt className="text-slate-500 dark:text-slate-400">{item.label}</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatUsd(usdPrice(pricing, item.key), 4)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>

        <aside aria-live="polite" className="flex flex-col gap-4 rounded-2xl bg-[#051647] p-5 text-white md:self-start">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#C4D600]"><Calculator className="h-4 w-4" /> Custo estimado</p>
          <div>
            <p className="text-3xl font-semibold tabular-nums">{totalBrl === null ? "—" : formatBrl(totalBrl)}</p>
            <p className="mt-1 text-sm tabular-nums text-slate-300">{totalUsd === null ? "" : formatUsd(totalUsd)}</p>
          </div>
          <dl className="space-y-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="flex items-center gap-1.5 text-slate-300"><Users className="h-3.5 w-3.5" /> Destinatários únicos</dt><dd className="font-semibold tabular-nums">{recipients === null ? "..." : recipients.toLocaleString("pt-BR")}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-300">Categoria</dt><dd className="font-semibold">{PRICING_CATEGORIES.find((item) => item.key === category)?.label}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-300">Por mensagem</dt><dd className="text-right font-semibold tabular-nums">{formatBrl(unitBrl, 4)}<span className="block text-[11px] font-normal text-slate-400">{formatUsd(unitUsd, 4)}</span></dd></div>
          </dl>
          <p className="text-[11px] leading-relaxed text-slate-400">Estimativa: a Meta cobra só as mensagens entregues. Contatos sem WhatsApp válido, descadastrados ou em descanso entre campanhas não são cobrados.</p>
        </aside>
      </div>
    </EntityDialog>
  );
}
