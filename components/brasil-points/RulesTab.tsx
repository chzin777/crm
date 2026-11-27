"use client";

import { useCallback, useEffect, useState } from "react";
import { Hand, Pencil, Plus, Power, Trash2, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { cardClass } from "@/components/dashboard/DashboardKit";
import { AUTOMATIC_EVENTS, EVENT_LABELS, type EventKey, type RuleConditions } from "@/lib/brasil-points/rules";
import { api, ghostButton, inputClass, labelClass, pointsLabel, pointsTone, primaryButton } from "@/components/brasil-points/shared";

export type RuleRow = {
  id: string; title: string; description: string; type: "earn" | "penalty"; triggerType: "automatic" | "manual"; eventKey: string;
  pointsAmount: number; conditionsJson: RuleConditions; isActive: boolean; activeSince: string | null;
};

type Draft = { id?: string; title: string; description: string; type: "earn" | "penalty"; triggerType: "automatic" | "manual"; eventKey: EventKey; points: string; isActive: boolean; minOrderAmount: string; maxOrderAmount: string; brands: string; categories: string; pointsPerAmount: string; withinDays: string };

const EMPTY: Draft = { title: "", description: "", type: "earn", triggerType: "automatic", eventKey: "sale_completed", points: "10", isActive: false, minOrderAmount: "", maxOrderAmount: "", brands: "", categories: "", pointsPerAmount: "", withinDays: "" };
const SALE = ["sale_completed", "sale_high_ticket", "whatsapp_sale"];

const toDraft = (rule: RuleRow): Draft => ({
  id: rule.id, title: rule.title, description: rule.description, type: rule.type, triggerType: rule.triggerType, eventKey: rule.eventKey as EventKey,
  points: String(Math.abs(rule.pointsAmount)), isActive: rule.isActive,
  minOrderAmount: rule.conditionsJson.minOrderAmount?.toString() ?? "", maxOrderAmount: rule.conditionsJson.maxOrderAmount?.toString() ?? "",
  brands: (rule.conditionsJson.brands ?? []).join(", "), categories: (rule.conditionsJson.categories ?? []).join(", "),
  pointsPerAmount: rule.conditionsJson.pointsPerAmount?.toString() ?? "", withinDays: rule.conditionsJson.withinDays?.toString() ?? "",
});

const numberOrUndefined = (value: string) => (value.trim() === "" ? undefined : Number(value.replace(",", ".")));
const listOrUndefined = (value: string) => {
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
};

export function conditionsSummary(rule: Pick<RuleRow, "eventKey" | "conditionsJson">) {
  const c = rule.conditionsJson ?? {};
  const parts = [
    c.minOrderAmount !== undefined && `a partir de R$ ${c.minOrderAmount.toLocaleString("pt-BR")}`,
    c.maxOrderAmount !== undefined && `até R$ ${c.maxOrderAmount.toLocaleString("pt-BR")}`,
    c.brands?.length && `marcas: ${c.brands.join(", ")}`,
    c.categories?.length && `categorias: ${c.categories.join(", ")}`,
    c.pointsPerAmount && `por cada R$ ${c.pointsPerAmount.toLocaleString("pt-BR")}`,
    rule.eventKey === "whatsapp_sale" && `atendido no WhatsApp até ${c.withinDays ?? 30} dias antes`,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** Critérios & Regras: CRUD de ganhos (+) e perdas (−), automáticas ou manuais, com condições. */
export function RulesTab() {
  const toast = useToast();
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api<RuleRow[]>("/api/brasil-points/rules").then(setRules).catch((error: Error) => toast.error("Regras", error.message)), [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const body = {
        title: draft.title, description: draft.description, type: draft.type, triggerType: draft.triggerType, eventKey: draft.eventKey,
        pointsAmount: Number(draft.points), isActive: draft.isActive,
        conditions: {
          minOrderAmount: numberOrUndefined(draft.minOrderAmount), maxOrderAmount: numberOrUndefined(draft.maxOrderAmount),
          brands: listOrUndefined(draft.brands), categories: listOrUndefined(draft.categories),
          pointsPerAmount: numberOrUndefined(draft.pointsPerAmount), withinDays: numberOrUndefined(draft.withinDays),
        },
      };
      await api(draft.id ? `/api/brasil-points/rules/${draft.id}` : "/api/brasil-points/rules", { method: draft.id ? "PUT" : "POST", body: JSON.stringify(body) });
      toast.success(draft.id ? "Regra atualizada" : "Regra criada", draft.isActive ? "Vale a partir de agora (nada retroativo)." : "Ela fica desligada até você ativar.");
      setDraft(null);
      void load();
    } catch (error) {
      toast.error("Regra não salva", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: RuleRow) => {
    const draftOf = toDraft(rule);
    try {
      await api(`/api/brasil-points/rules/${rule.id}`, { method: "PUT", body: JSON.stringify({ ...draftOf, pointsAmount: Number(draftOf.points), isActive: !rule.isActive, conditions: rule.conditionsJson }) });
      toast.success(rule.isActive ? "Regra desligada" : "Regra ativada", rule.isActive ? "Para de pontuar eventos novos." : "Pontua eventos a partir de agora.");
      void load();
    } catch (error) {
      toast.error("Não foi possível alterar", (error as Error).message);
    }
  };

  const remove = async (rule: RuleRow) => {
    if (!window.confirm(`Remover a regra "${rule.title}"? Se já pontuou alguém, ela só é desligada (o extrato é mantido).`)) return;
    try {
      const result = await fetch(`/api/brasil-points/rules/${rule.id}`, { method: "DELETE" }).then((response) => response.json() as Promise<{ deactivated?: boolean }>);
      toast.success(result.deactivated ? "Regra desligada" : "Regra removida");
      void load();
    } catch {
      toast.error("Não foi possível remover");
    }
  };

  if (!rules) return <div className="flex justify-center py-16"><LoadingSpinner label="Carregando regras..." size={32} /></div>;

  const group = (type: "earn" | "penalty") => rules.filter((rule) => rule.type === type);
  const isSale = draft ? SALE.includes(draft.eventKey) : false;
  const availableEvents: readonly EventKey[] = draft?.triggerType === "manual"
    ? [draft.type === "earn" ? "manual_bonus" : "manual_penalty"]
    : AUTOMATIC_EVENTS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">Regras automáticas pontuam sozinhas (a cada 10 min) a partir do momento em que são ativadas. Pedido devolvido ou cancelado no VMSet estorna os pontos.</p>
        <button type="button" onClick={() => setDraft({ ...EMPTY })} className={primaryButton}><Plus className="h-4 w-4" />Nova regra</button>
      </div>
      {(["earn", "penalty"] as const).map((type) => (
        <section key={type} className={`${cardClass} min-w-0 overflow-hidden`}>
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-[#051647] dark:border-white/10 dark:text-white">
            {type === "earn" ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
            {type === "earn" ? "Como ganhar pontos" : "O que faz perder pontos"}
          </h2>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {group(type).length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Nenhuma regra.</li>}
            {group(type).map((rule) => (
              <li key={rule.id} className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3">
                <span className={`w-16 shrink-0 text-lg font-extrabold tabular-nums ${pointsTone(rule.pointsAmount)}`}>{pointsLabel(rule.pointsAmount)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <span className="break-words">{rule.title}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${rule.triggerType === "automatic" ? "bg-[#002187]/10 text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                      {rule.triggerType === "automatic" ? <Zap className="h-3 w-3" /> : <Hand className="h-3 w-3" />}{rule.triggerType === "automatic" ? "Automática" : "Manual"}
                    </span>
                    {!rule.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-white/10">Desligada</span>}
                  </p>
                  <p className="break-words text-xs text-slate-500 dark:text-slate-400">{EVENT_LABELS[rule.eventKey as EventKey] ?? rule.eventKey}{conditionsSummary(rule) ? ` · ${conditionsSummary(rule)}` : ""}</p>
                  {rule.description && <p className="break-words text-xs text-slate-400">{rule.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => void toggle(rule)} className={ghostButton} title={rule.isActive ? "Desligar" : "Ativar"}><Power className="h-3.5 w-3.5" />{rule.isActive ? "Desligar" : "Ativar"}</button>
                  <button type="button" onClick={() => setDraft(toDraft(rule))} className={ghostButton} aria-label="Editar regra"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => void remove(rule)} className={ghostButton} aria-label="Remover regra"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {draft && (
        <EntityDialog titleId="bp-rule" title={draft.id ? "Editar regra" : "Nova regra"} description="Pontos de ganho entram positivos e de perda negativos automaticamente." onClose={() => setDraft(null)}>
          <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-3">
            <label className="block space-y-1"><span className={labelClass}>Título (o vendedor vê)</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} required minLength={3} /></label>
            <label className="block space-y-1"><span className={labelClass}>Descrição</span><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} className={`${inputClass} h-auto py-2`} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1"><span className={labelClass}>Tipo</span>
                <select value={draft.type} onChange={(e) => {
                  const type = e.target.value as Draft["type"];
                  setDraft({ ...draft, type, ...(draft.triggerType === "manual" ? { eventKey: type === "earn" ? "manual_bonus" : "manual_penalty" } : {}) });
                }} className={inputClass}><option value="earn">Ganho (+)</option><option value="penalty">Perda (−)</option></select>
              </label>
              <label className="block space-y-1"><span className={labelClass}>Pontos</span><input inputMode="numeric" value={draft.points} onChange={(e) => setDraft({ ...draft, points: e.target.value.replace(/[^\d]/g, "") })} className={inputClass} required /></label>
              <label className="block space-y-1"><span className={labelClass}>Gatilho</span>
                <select value={draft.triggerType} onChange={(e) => {
                  const triggerType = e.target.value as Draft["triggerType"];
                  const eventKey = triggerType === "manual" ? draft.type === "earn" ? "manual_bonus" : "manual_penalty" : AUTOMATIC_EVENTS[0];
                  setDraft({ ...draft, triggerType, eventKey });
                }} className={inputClass}><option value="automatic">Automático</option><option value="manual">Lançamento manual</option></select>
              </label>
              <label className="block space-y-1"><span className={labelClass}>Evento</span>
                <select value={draft.eventKey} onChange={(e) => setDraft({ ...draft, eventKey: e.target.value as EventKey })} className={inputClass}>
                  {availableEvents.map((key) => <option key={key} value={key}>{EVENT_LABELS[key]}</option>)}
                </select>
              </label>
            </div>
            {isSale && (
              <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <legend className={`${labelClass} px-1`}>Condições do pedido (opcionais)</legend>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1"><span className={labelClass}>Valor mínimo (R$)</span><input inputMode="decimal" value={draft.minOrderAmount} onChange={(e) => setDraft({ ...draft, minOrderAmount: e.target.value })} className={inputClass} /></label>
                  <label className="block space-y-1"><span className={labelClass}>Valor máximo (R$)</span><input inputMode="decimal" value={draft.maxOrderAmount} onChange={(e) => setDraft({ ...draft, maxOrderAmount: e.target.value })} className={inputClass} /></label>
                </div>
                <label className="block space-y-1"><span className={labelClass}>Só estas marcas (separadas por vírgula)</span><input value={draft.brands} onChange={(e) => setDraft({ ...draft, brands: e.target.value })} placeholder="Ex.: RAY BAN, OAKLEY" className={inputClass} /></label>
                <label className="block space-y-1"><span className={labelClass}>Só estas categorias (separadas por vírgula)</span><input value={draft.categories} onChange={(e) => setDraft({ ...draft, categories: e.target.value })} placeholder="Ex.: OCULOS DE SOL" className={inputClass} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1"><span className={labelClass}>Pontos a cada R$ (proporcional)</span><input inputMode="decimal" value={draft.pointsPerAmount} onChange={(e) => setDraft({ ...draft, pointsPerAmount: e.target.value })} placeholder="Ex.: 100" className={inputClass} /></label>
                  {draft.eventKey === "whatsapp_sale" && <label className="block space-y-1"><span className={labelClass}>Atendimento até N dias antes</span><input inputMode="numeric" value={draft.withinDays} onChange={(e) => setDraft({ ...draft, withinDays: e.target.value })} placeholder="30" className={inputClass} /></label>}
                </div>
              </fieldset>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4 cursor-pointer" />Ativa (começa a pontuar agora)</label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setDraft(null)} className={ghostButton}>Cancelar</button>
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Salvando..." : "Salvar regra"}</button>
            </div>
          </form>
        </EntityDialog>
      )}
    </div>
  );
}
