"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { SegmentedControl } from "@/components/dashboard/DashboardKit";
import { MoneyInput, QuantityInput } from "@/components/NumericInputs";
import { parseStoreList, ruleSummary, type CampaignAudience, type CampaignMetric, type CampaignRule, type RewardMode } from "@/lib/sales-campaigns-shared";

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

const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-white/10 dark:bg-white/[0.04] dark:text-white";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300";

/** Criar/editar campanha comercial com premiação. */
export function CampaignForm({ initial, options, onClose, onSaved }: { initial?: CampaignFormValue; options: CampaignFormOptions; onClose: () => void; onSaved: (id: string) => void }) {
  const bounds = monthBounds();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [metric, setMetric] = useState<CampaignMetric>(initial?.metric ?? "QUANTIDADE");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? bounds.start);
  const [endDate, setEndDate] = useState(initial?.endDate ?? bounds.end);
  const [audience, setAudience] = useState<CampaignAudience>(initial?.audience ?? "INDIVIDUAL");
  const [stores, setStores] = useState(initial?.stores.join(", ") ?? "");
  const [groups, setGroups] = useState<{ name: string; stores: string }[]>(initial?.groups.length ? initial.groups.map((group) => ({ name: group.name, stores: group.stores.join(", ") })) : [{ name: "Grupo 1", stores: "" }]);
  const [rewardMode, setRewardMode] = useState<RewardMode>(initial?.rewardMode ?? "RECORRENTE");
  const [target, setTarget] = useState(initial?.target ?? 0);
  const [rewardLabel, setRewardLabel] = useState(initial?.rewardLabel ?? "Voucher iFood");
  const [rewardAmount, setRewardAmount] = useState(initial?.rewardAmount ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const payload = useMemo(
    () => ({
      name,
      description,
      metric,
      brand,
      category,
      startDate,
      endDate,
      audience,
      stores: parseStoreList(stores),
      groups: groups.map((group) => ({ name: group.name, stores: parseStoreList(group.stores) })),
      rewardMode,
      target: metric === "QUANTIDADE" ? Math.round(target) : target,
      rewardLabel,
      rewardAmount,
      active: initial?.active ?? true,
    }),
    [name, description, metric, brand, category, startDate, endDate, audience, stores, groups, rewardMode, target, rewardLabel, rewardAmount, initial?.active],
  );
  const preview = ruleSummary({ ...payload, brand: payload.brand.trim().toUpperCase() || null, category: payload.category || null, groups: payload.groups.filter((group) => group.stores.length) });

  const save = async () => {
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

  const targetLabel = rewardMode === "RECORRENTE" ? (metric === "QUANTIDADE" ? "A cada quantas unidades" : "A cada quantos R$") : metric === "QUANTIDADE" ? "Meta (unidades)" : "Meta (R$)";

  return (
    <EntityDialog titleId="campaign-form" title={initial?.id ? "Editar campanha" : "Nova campanha com premiação"} description="Meta em R$ ou em unidades, com filtro de marca/categoria/loja e o prêmio de quem bater." onClose={onClose} size="lg">
      <form
        className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={labelClass}>Nome da campanha</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Foco Stepper" className={field} required maxLength={120} />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Descrição (opcional)</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Regras, observações para a equipe..." className={field} maxLength={500} />
          </label>
        </div>

        <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[#002187] dark:text-[#C4D600]">O que conta</legend>
          <SegmentedControl<CampaignMetric> label="Tipo de métrica" value={metric} onChange={setMetric} options={[{ value: "QUANTIDADE", label: "Quantidade (unidades)" }, { value: "VALOR", label: "Valor vendido (R$)" }]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Marca (vazio = todas)</span>
              <input value={brand} onChange={(event) => setBrand(event.target.value)} list="campaign-brands" placeholder="STEPPER" className={field} />
              <datalist id="campaign-brands">{options.brands.map((value) => <option key={value} value={value} />)}</datalist>
            </label>
            <label>
              <span className={labelClass}>Categoria</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className={`${field} cursor-pointer`}>
                <option value="">Todo o catálogo</option>
                {options.categories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
              </select>
            </label>
            <label>
              <span className={labelClass}>Início</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={field} required />
            </label>
            <label>
              <span className={labelClass}>Fim</span>
              <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className={field} required />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[#002187] dark:text-[#C4D600]">Quem participa</legend>
          <SegmentedControl<CampaignAudience> label="Público" value={audience} onChange={setAudience} options={[{ value: "INDIVIDUAL", label: "Vendedor (individual)" }, { value: "LOJA", label: "Por loja" }, { value: "GRUPO", label: "Grupos de lojas" }]} />
          {audience === "GRUPO" ? (
            <div className="space-y-2">
              {groups.map((group, index) => (
                <div key={index} className="flex items-end gap-2">
                  <label className="w-36 shrink-0">
                    <span className={labelClass}>Grupo</span>
                    <input value={group.name} onChange={(event) => setGroups((list) => list.map((item, position) => (position === index ? { ...item, name: event.target.value } : item)))} className={field} />
                  </label>
                  <label className="min-w-0 flex-1">
                    <span className={labelClass}>Lojas (números)</span>
                    <input value={group.stores} onChange={(event) => setGroups((list) => list.map((item, position) => (position === index ? { ...item, stores: event.target.value } : item)))} placeholder="1, 2, 3" className={field} />
                  </label>
                  <button type="button" onClick={() => setGroups((list) => list.filter((_, position) => position !== index))} disabled={groups.length === 1} aria-label={`Remover ${group.name}`} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setGroups((list) => [...list, { name: `Grupo ${list.length + 1}`, stores: "" }])} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#002187] hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-white/5">
                <Plus className="h-3.5 w-3.5" />Adicionar grupo
              </button>
            </div>
          ) : (
            <label className="block">
              <span className={labelClass}>Só estas lojas (vazio = todas)</span>
              <input value={stores} onChange={(event) => setStores(event.target.value)} placeholder={options.stores.slice(0, 4).join(", ") || "1, 2, 18"} className={field} />
            </label>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[#002187] dark:text-[#C4D600]">Prêmio</legend>
          <SegmentedControl<RewardMode> label="Regra do prêmio" value={rewardMode} onChange={setRewardMode} options={[{ value: "RECORRENTE", label: "A cada bloco" }, { value: "UNICO", label: "Ao bater a meta" }, { value: "RANKING", label: "1º lugar (ranking)" }]} />
          <div className="grid gap-3 sm:grid-cols-3">
            {rewardMode !== "RANKING" && (
              <label>
                <span className={labelClass}>{targetLabel}</span>
                {metric === "QUANTIDADE" ? (
                  <QuantityInput value={target} onValueChange={setTarget} placeholder="3" className={field} required />
                ) : (
                  <MoneyInput value={target} onValueChange={setTarget} placeholder="R$ 10.000,00" className={field} required />
                )}
              </label>
            )}
            <label>
              <span className={labelClass}>Prêmio</span>
              <input value={rewardLabel} onChange={(event) => setRewardLabel(event.target.value)} placeholder="Voucher iFood" className={field} maxLength={80} />
            </label>
            <label>
              <span className={labelClass}>Valor do prêmio (R$)</span>
              <MoneyInput value={rewardAmount} onValueChange={setRewardAmount} placeholder="R$ 100,00" className={field} />
            </label>
          </div>
          {rewardMode === "RANKING" && <p className="text-[11px] text-slate-500 dark:text-slate-400">O líder de cada {audience === "GRUPO" ? "grupo" : audience === "LOJA" ? "ranking de lojas" : "ranking de vendedores"} ganha o prêmio quando o período termina.</p>}
        </fieldset>

        <p className="rounded-xl bg-[#051647] px-3 py-2.5 text-sm font-semibold text-white"><span className="text-[#C4D600]">Regra:</span> {preview}</p>
        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Cancelar</button>
          <button type="submit" disabled={saving} className="h-10 cursor-pointer rounded-xl bg-[#051647] px-4 text-sm font-bold text-white hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647]">{saving ? "Salvando..." : initial?.id ? "Salvar alterações" : "Criar campanha"}</button>
        </div>
      </form>
    </EntityDialog>
  );
}
