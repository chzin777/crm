"use client";

import { useMemo, useState } from "react";
import { CalendarRange, ClipboardCheck, Filter, Gift, Plus, Store, Target, Trash2, Trophy, Users } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import Stepper, { Step } from "@/components/Stepper";
import { SegmentedControl } from "@/components/dashboard/DashboardKit";
import { MoneyInput, QuantityInput } from "@/components/NumericInputs";
import { ReviewBlock, WizardSection } from "@/components/campaigns/CampaignWizardParts";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { brl, ruleSummary, scopeLabel, type CampaignAudience, type CampaignMetric, type CampaignRule, type RewardMode } from "@/lib/sales-campaigns-shared";
import { firstInvalidStep, toggleStore, validateCampaignStep, type CampaignDraft } from "@/lib/sales-campaign-steps";

export type CampaignFormValue = CampaignRule & { id?: string; description: string | null; active: boolean };
export type CampaignFormOptions = { brands: string[]; categories: string[]; stores: number[] };

const CATEGORY_LABEL: Record<string, string> = { ARMACAO: "Armação (grau)", "OCULOS SOLAR": "Óculos solar", LENTES: "Lentes", "LENTES DE CONTATO": "Lentes de contato", ACESSORIOS: "Acessórios", SERVICOS: "Serviços" };
export const categoryLabel = (value: string) => CATEGORY_LABEL[value] ?? value.charAt(0) + value.slice(1).toLocaleLowerCase("pt-BR");

const monthBounds = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { start: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, end: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}` };
};

const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-[#C4D600] dark:[color-scheme:dark]";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300";
const required = <span aria-hidden="true" className="text-red-600 dark:text-red-400"> *</span>;
const brDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : "—");
const units = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const AUDIENCE_LABEL: Record<CampaignAudience, string> = { INDIVIDUAL: "Consultores (meta individual)", LOJA: "Gerentes / lojas", GRUPO: "Grupos de lojas" };
const REWARD_LABEL: Record<RewardMode, string> = { RECORRENTE: "Recorrente: a cada bloco atingido", UNICO: "Única: ao bater 100% da meta", RANKING: "1º lugar do ranking no fim do período" };

/** Lojas em chips clicáveis (vazio = todas, quando permitido). */
function StorePicker({ available, selected, onChange, taken = [], emptyLabel }: { available: number[]; selected: number[]; onChange: (stores: number[]) => void; taken?: number[]; emptyLabel?: string }) {
  if (!available.length) return <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma loja com vendas encontrada no VMSET.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {emptyLabel && (
          <button type="button" onClick={() => onChange([])} aria-pressed={!selected.length} className={`h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-semibold transition-colors ${!selected.length ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300"}`}>
            {emptyLabel}
          </button>
        )}
        {available.map((store) => {
          const active = selected.includes(store);
          const blocked = !active && taken.includes(store);
          return (
            <button
              key={store}
              type="button"
              disabled={blocked}
              onClick={() => onChange(toggleStore(selected, store))}
              aria-pressed={active}
              title={blocked ? "Já está em outro grupo" : undefined}
              className={`h-8 min-w-[3.25rem] cursor-pointer rounded-lg border px-2 text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-[#C4D600] bg-[#C4D600]/20 text-[#051647] ring-1 ring-[#C4D600]/60 dark:text-[#C4D600]" : "border-slate-200 text-slate-600 hover:border-[#002187]/40 dark:border-white/10 dark:text-slate-300 dark:hover:border-[#C4D600]/40"}`}
            >
              LJ {store}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{selected.length ? `${selected.length} loja${selected.length === 1 ? "" : "s"} selecionada${selected.length === 1 ? "" : "s"}` : emptyLabel ? "Todas as lojas participam." : "Nenhuma loja selecionada."}</p>
    </div>
  );
}

/** Criar/editar campanha comercial com premiação em 3 etapas (mesmo assistente do "Nova campanha" de marketing). */
export function CampaignForm({ initial, options, onClose, onSaved }: { initial?: CampaignFormValue; options: CampaignFormOptions; onClose: () => void; onSaved: (id: string) => void }) {
  const bounds = monthBounds();
  const { isDark } = useCrmTheme();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [metric, setMetric] = useState<CampaignMetric>(initial?.metric ?? "QUANTIDADE");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? bounds.start);
  const [endDate, setEndDate] = useState(initial?.endDate ?? bounds.end);
  const [audience, setAudience] = useState<CampaignAudience>(initial?.audience ?? "INDIVIDUAL");
  const [stores, setStores] = useState<number[]>(initial?.stores ?? []);
  const [groups, setGroups] = useState<{ name: string; stores: number[] }[]>(initial?.groups.length ? initial.groups.map((group) => ({ name: group.name, stores: [...group.stores] })) : [{ name: "Grupo 1", stores: [] }]);
  const [rewardMode, setRewardMode] = useState<RewardMode>(initial?.rewardMode ?? "RECORRENTE");
  const [target, setTarget] = useState(initial?.target ?? 0);
  const [rewardLabel, setRewardLabel] = useState(initial?.rewardLabel ?? "Voucher iFood");
  const [rewardAmount, setRewardAmount] = useState(initial?.rewardAmount ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Lojas do VMSET + as que já estavam na campanha (mesmo sem venda recente).
  const available = useMemo(
    () => [...new Set([...options.stores, ...(initial?.stores ?? []), ...(initial?.groups.flatMap((group) => group.stores) ?? [])])].sort((a, b) => a - b),
    [options.stores, initial],
  );

  const draft: CampaignDraft = { name, metric, target, startDate, endDate, audience, groups, rewardMode, rewardLabel, rewardAmount };
  const payload = {
    name,
    description,
    metric,
    brand,
    category,
    startDate,
    endDate,
    audience,
    stores: audience === "GRUPO" ? [] : stores,
    groups: audience === "GRUPO" ? groups.filter((group) => group.stores.length) : [],
    rewardMode,
    target: metric === "QUANTIDADE" ? Math.round(target) : target,
    rewardLabel,
    rewardAmount,
    active: initial?.active ?? true,
  };
  const preview = ruleSummary({ ...payload, brand: payload.brand.trim().toUpperCase() || null, category: payload.category || null });
  const edit = (patch: () => void) => { patch(); setError(""); };

  const save = async () => {
    const invalid = firstInvalidStep(draft);
    if (invalid) {
      setStep(invalid.step);
      setError(invalid.error);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(initial?.id ? `/api/vendas/campanhas/${initial.id}` : "/api/vendas/campanhas", { method: initial?.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json().catch(() => ({}))) as { data?: { id: string }; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Não foi possível salvar a campanha.");
      onSaved(body.data.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a campanha.");
    } finally {
      setSaving(false);
    }
  };

  const errorBox = error ? <p role="alert" className="rounded-lg border border-[#F7915E]/40 bg-[#F7915E]/10 px-3 py-2 text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p> : null;
  const targetText = metric === "QUANTIDADE" ? `${units(target)} unidade${target === 1 ? "" : "s"}` : brl(target);
  const scopeText = [brand.trim() ? `Marca ${brand.trim().toUpperCase()}` : "", category ? categoryLabel(category) : ""].filter(Boolean).join(" · ") || "Todo o catálogo";
  const audienceText = audience === "GRUPO"
    ? groups.filter((group) => group.stores.length).map((group) => `${group.name}: LJ ${group.stores.join(", ")}`).join(" · ") || "Nenhum grupo montado"
    : stores.length ? `Lojas ${stores.join(", ")}` : "Todas as lojas";
  const takenBy = (index: number) => groups.flatMap((group, position) => (position === index ? [] : group.stores));

  return (
    <EntityDialog
      titleId="campaign-form"
      title={initial?.id ? "Editar campanha com premiação" : "Nova campanha com premiação"}
      description="Meta, público e prêmio em 3 etapas. A apuração usa as vendas do VMSET."
      onClose={() => { if (!saving) onClose(); }}
      size="panel"
    >
      <Stepper
        step={step}
        onStepChange={(next) => { setError(""); setStep(next); }}
        onFinalStepCompleted={() => void save()}
        validateStep={(current) => {
          const message = validateCampaignStep(current, draft);
          setError(message);
          return !message;
        }}
        cancelButtonText="Cancelar"
        onCancel={() => { if (!saving) onClose(); }}
        backButtonText="Voltar"
        nextButtonText="Continuar"
        completeButtonText={saving ? "Salvando..." : initial?.id ? "Salvar alterações" : "Criar campanha"}
        nextButtonProps={{ disabled: saving }}
        backButtonProps={{ disabled: saving }}
        indicator="numbers"
        orientation="horizontal"
        transition="slide"
        linear={!initial?.id}
        showFooter
        theme={isDark ? "dark" : "light"}
        accentColor="#C4D600"
        frame={false}
        radius={16}
        width="100%"
        className="min-h-0 flex-1"
      >
        <Step title="Identificação e meta" description="Nome, métrica, alvo e período">
          <div className="space-y-4">
            <WizardSection icon={Trophy} title="Campanha" hint="Nome que a equipe vai ver no ranking.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className={labelClass}>Nome da campanha{required}</span>
                  <input value={name} onChange={(event) => edit(() => setName(event.target.value))} placeholder="Ex.: Foco Stepper Novembro" className={field} maxLength={120} aria-required="true" />
                </label>
                <label className="sm:col-span-2">
                  <span className={labelClass}>Descrição <span className="font-normal text-slate-400">(opcional)</span></span>
                  <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Regras, observações para a equipe..." className={field} maxLength={500} />
                </label>
              </div>
            </WizardSection>
            <WizardSection icon={Target} title="Regra da meta" hint={rewardMode === "RANKING" ? "No prêmio por ranking o alvo é opcional: ganha quem vender mais." : "No prêmio recorrente o alvo vira o bloco: a cada X atingido, um prêmio."}>
              <SegmentedControl<CampaignMetric> label="Tipo de métrica" value={metric} onChange={(value) => edit(() => { setMetric(value); if (value === "QUANTIDADE") setTarget((current) => Math.round(current)); })} options={[{ value: "VALOR", label: "Valor em R$" }, { value: "QUANTIDADE", label: "Quantidade (unidades)" }]} />
              <label className="block sm:max-w-xs">
                <span className={labelClass}>{metric === "QUANTIDADE" ? "Alvo (unidades)" : "Alvo (R$)"}{rewardMode !== "RANKING" && required}</span>
                {metric === "QUANTIDADE" ? (
                  <QuantityInput value={target} onValueChange={(value) => edit(() => setTarget(value))} placeholder="3" className={field} />
                ) : (
                  <MoneyInput value={target} onValueChange={(value) => edit(() => setTarget(value))} placeholder="R$ 10.000,00" className={field} />
                )}
              </label>
            </WizardSection>
            <WizardSection icon={CalendarRange} title="Vigência" hint="Vendas fora do período não contam.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className={labelClass}>Data de início{required}</span>
                  <input type="date" value={startDate} onChange={(event) => edit(() => setStartDate(event.target.value))} className={`${field} cursor-pointer`} />
                </label>
                <label>
                  <span className={labelClass}>Data de término{required}</span>
                  <input type="date" value={endDate} min={startDate} onChange={(event) => edit(() => setEndDate(event.target.value))} className={`${field} cursor-pointer`} />
                </label>
              </div>
            </WizardSection>
            {errorBox}
          </div>
        </Step>

        <Step title="Escopo e público" description="Produtos e quem participa">
          <div className="space-y-4">
            <WizardSection icon={Filter} title="O que conta" hint="Deixe em branco para valer todo o catálogo.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className={labelClass}>Marca <span className="font-normal text-slate-400">(vazio = todas)</span></span>
                  <input value={brand} onChange={(event) => setBrand(event.target.value)} list="campaign-brands" placeholder="Ex.: STEPPER" className={field} />
                  <datalist id="campaign-brands">{options.brands.map((value) => <option key={value} value={value} />)}</datalist>
                </label>
                <label>
                  <span className={labelClass}>Categoria</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)} className={`${field} cursor-pointer`}>
                    <option value="">Todo o catálogo</option>
                    {options.categories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
                  </select>
                </label>
              </div>
            </WizardSection>
            <WizardSection icon={Users} title="Quem participa" hint={audience === "INDIVIDUAL" ? "Cada consultor tem a própria meta." : audience === "LOJA" ? "A meta vale para o total de cada loja (gerente)." : "Cada grupo de lojas soma as vendas e disputa junto."}>
              <SegmentedControl<CampaignAudience> label="Público" value={audience} onChange={(value) => edit(() => setAudience(value))} options={[{ value: "INDIVIDUAL", label: "Consultores" }, { value: "LOJA", label: "Gerentes / lojas" }, { value: "GRUPO", label: "Grupos de lojas" }]} />
              {audience === "GRUPO" ? (
                <div className="space-y-3">
                  {groups.map((group, index) => (
                    <div key={index} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                      <div className="flex items-center gap-2">
                        <input value={group.name} onChange={(event) => edit(() => setGroups((list) => list.map((item, position) => (position === index ? { ...item, name: event.target.value } : item))))} aria-label={`Nome do grupo ${index + 1}`} className={`${field} h-9 max-w-xs`} maxLength={60} />
                        <button type="button" onClick={() => setGroups((list) => list.filter((_, position) => position !== index))} disabled={groups.length === 1} aria-label={`Remover ${group.name}`} className="ml-auto grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <StorePicker available={available} selected={group.stores} taken={takenBy(index)} onChange={(next) => edit(() => setGroups((list) => list.map((item, position) => (position === index ? { ...item, stores: next } : item))))} />
                    </div>
                  ))}
                  <button type="button" onClick={() => setGroups((list) => [...list, { name: `Grupo ${list.length + 1}`, stores: [] }])} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#002187] hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-white/5">
                    <Plus className="h-3.5 w-3.5" />Adicionar grupo
                  </button>
                </div>
              ) : (
                <div>
                  <span className={labelClass}>Lojas participantes</span>
                  <StorePicker available={available} selected={stores} onChange={setStores} emptyLabel="Todas as lojas" />
                </div>
              )}
            </WizardSection>
            {errorBox}
          </div>
        </Step>

        <Step title="Prêmio e revisão" description="Regra do prêmio e conferência">
          <div className="space-y-4">
            <WizardSection icon={Gift} title="Premiação" hint={rewardMode === "RANKING" ? `O líder de cada ${audience === "GRUPO" ? "grupo" : audience === "LOJA" ? "ranking de lojas" : "ranking de consultores"} ganha quando o período termina.` : undefined}>
              <SegmentedControl<RewardMode> label="Regra do prêmio" value={rewardMode} onChange={(value) => edit(() => setRewardMode(value))} options={[{ value: "RECORRENTE", label: "A cada bloco" }, { value: "UNICO", label: "Ao bater 100%" }, { value: "RANKING", label: "1º lugar" }]} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className={labelClass}>Prêmio{required}</span>
                  <input value={rewardLabel} onChange={(event) => edit(() => setRewardLabel(event.target.value))} placeholder="Ex.: Voucher iFood" className={field} maxLength={80} />
                </label>
                <label>
                  <span className={labelClass}>Valor do prêmio (R$)</span>
                  <MoneyInput value={rewardAmount} onValueChange={(value) => edit(() => setRewardAmount(value))} placeholder="R$ 100,00" className={field} />
                </label>
              </div>
            </WizardSection>

            <section aria-label="Revisão da campanha" className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"><ClipboardCheck className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Revisão antes de salvar</h3>
              <p className="rounded-xl bg-[#051647] px-3 py-2.5 text-sm font-semibold text-white"><span className="text-[#C4D600]">Regra:</span> {preview}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewBlock title="Campanha" icon={Trophy} onEdit={() => setStep(1)}>
                  <p className="font-semibold">{name.trim() || "—"}</p>
                  {description.trim() && <p className="text-xs text-slate-500 dark:text-slate-400">{description.trim()}</p>}
                </ReviewBlock>
                <ReviewBlock title="Métrica e alvo" icon={Target} onEdit={() => setStep(1)}>
                  <p className="font-semibold">{metric === "QUANTIDADE" ? "Quantidade (unidades)" : "Valor em R$"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{rewardMode === "RANKING" && !(target > 0) ? "Sem alvo (ranking)" : `${rewardMode === "RECORRENTE" ? "Bloco de" : "Alvo de"} ${targetText}`}</p>
                </ReviewBlock>
                <ReviewBlock title="Período" icon={CalendarRange} onEdit={() => setStep(1)}>
                  <p className="font-semibold tabular-nums">{brDate(startDate)} a {brDate(endDate)}</p>
                </ReviewBlock>
                <ReviewBlock title="Marca e categoria" icon={Filter} onEdit={() => setStep(2)}>
                  <p className="font-semibold">{scopeText}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Conta: {scopeLabel({ brand: brand.trim().toUpperCase() || null, category: category || null })}</p>
                </ReviewBlock>
                <ReviewBlock title="Público e lojas" icon={Store} onEdit={() => setStep(2)}>
                  <p className="font-semibold">{AUDIENCE_LABEL[audience]}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{audienceText}</p>
                </ReviewBlock>
                <ReviewBlock title="Premiação" icon={Gift}>
                  <p className="font-semibold">{rewardAmount > 0 ? `${brl(rewardAmount)} em ${rewardLabel.trim() || "prêmio"}` : rewardLabel.trim() || "—"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{REWARD_LABEL[rewardMode]}</p>
                </ReviewBlock>
              </div>
            </section>
            {errorBox}
          </div>
        </Step>
      </Stepper>
    </EntityDialog>
  );
}
