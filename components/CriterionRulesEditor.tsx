"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { BirthdayDatePicker } from "@/components/BirthdayDatePicker";
import { FormSelect } from "@/components/FormSelect";
import {
  MAX_RULES,
  getOperator,
  getOperators,
  getRuleField,
  ruleFields,
  validateRule,
  type SegmentRule,
} from "@/lib/segment-rules";

const DAY_SHORTCUTS = [30, 60, 90, 180];
const MONEY_FIELDS = new Set(["avgTicket", "totalSpent"]);
const PREVIEW_DELAY_MS = 500;

/** Prévia ao vivo: quantos contatos da base atendem a todas as regras (calculado no servidor). */
function useRulesPreview(rules: SegmentRule[]) {
  const [state, setState] = useState<{ loading: boolean; count: number | null; error: string }>({ loading: false, count: null, error: "" });
  const signature = JSON.stringify(rules);
  useEffect(() => {
    const current = JSON.parse(signature) as SegmentRule[];
    if (current.length === 0 || current.some((rule) => validateRule(rule))) {
      setState({ loading: false, count: null, error: "" });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    const timer = setTimeout(() => {
      fetch("/api/segments/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: { preview: [{ id: "preview", nome: "Prévia", tipo: "geral", regras: current }] } }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as { counts?: Record<string, number>; error?: string } | null;
          if (!response.ok) throw new Error(body?.error ?? "Não foi possível calcular a prévia.");
          setState({ loading: false, count: body?.counts?.preview ?? 0, error: "" });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({ loading: false, count: null, error: error instanceof Error ? error.message : "Não foi possível calcular a prévia." });
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [signature]);
  return state;
}

interface CriterionRulesEditorProps {
  rules: SegmentRule[];
  onChange: (rules: SegmentRule[]) => void;
}

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:focus:border-[#C4D600]";

export const emptyRule = (): SegmentRule => ({ campo: "purchases", operador: "gt", valor: "" });

export function CriterionRulesEditor({ rules, onChange }: CriterionRulesEditorProps) {
  const updateRule = (index: number, patch: Partial<SegmentRule>) =>
    onChange(rules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)));

  const changeField = (index: number, fieldId: string) => {
    const field = getRuleField(fieldId);
    const operator = getOperators(fieldId)[0];
    updateRule(index, {
      campo: fieldId,
      operador: operator?.id ?? "",
      valor: field?.type === "select" ? field.options?.[0]?.value ?? "" : "",
      valor2: "",
    });
  };

  const changeOperator = (index: number, operatorId: string) => updateRule(index, { operador: operatorId, valor2: "" });
  const preview = useRulesPreview(rules);

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Regras do critério</h4>
        <p className="mt-0.5 text-xs text-slate-400">O contato entra neste critério quando atende a todas as regras abaixo.</p>
      </div>
      <ul className="space-y-3">
        {rules.map((rule, index) => {
          const field = getRuleField(rule.campo);
          const operators = getOperators(rule.campo);
          const operator = getOperator(rule.campo, rule.operador);
          const isDays = field?.type === "date" && operator?.id.endsWith("_days");
          const isDate = field?.type === "date" && !isDays && operator && operator.input !== "none";
          const fieldLabels = ruleFields.map((item) => item.label);
          return (
            <li key={index} className="relative rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-[#051647]/40">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <FormSelect
                  label="Campo"
                  ariaLabel={`Campo da regra ${index + 1}`}
                  value={field?.label ?? "Selecione"}
                  options={fieldLabels}
                  onChange={(label) => {
                    const next = ruleFields.find((item) => item.label === label);
                    if (next) changeField(index, next.id);
                  }}
                />
                <FormSelect
                  label="Condição"
                  ariaLabel={`Condição da regra ${index + 1}`}
                  value={operator?.label ?? "Selecione"}
                  options={operators.map((item) => item.label)}
                  onChange={(label) => {
                    const next = operators.find((item) => item.label === label);
                    if (next) changeOperator(index, next.id);
                  }}
                />
                <div className="space-y-3 sm:space-y-1.5">
                  {operator && operator.input !== "none" && field?.type === "select" && (
                    <FormSelect
                      label="Valor"
                      ariaLabel={`Valor da regra ${index + 1}`}
                      value={field.options?.find((option) => option.value === rule.valor)?.label ?? "Selecione"}
                      options={field.options?.map((option) => option.label) ?? []}
                      onChange={(label) => {
                        const next = field.options?.find((option) => option.label === label);
                        if (next) updateRule(index, { valor: next.value });
                      }}
                    />
                  )}
                  {operator && operator.input !== "none" && (field?.type === "number" || field?.type === "text" || isDays) && (
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {operator.input === "two" ? "De" : "Valor"}
                      <input
                        value={rule.valor ?? ""}
                        inputMode={field.type === "text" ? "text" : "decimal"}
                        onChange={(event) => updateRule(index, { valor: event.target.value })}
                        placeholder={field.type === "text" ? (rule.campo === "ddd" ? "Ex.: 62" : "Digite o valor") : isDays ? "Dias" : MONEY_FIELDS.has(rule.campo) ? "Ex.: 2000" : "0"}
                        className={inputClass}
                      />
                    </label>
                  )}
                  {isDays && (
                    <div className="flex flex-wrap gap-1" aria-label="Atalhos de dias">
                      {DAY_SHORTCUTS.map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => updateRule(index, { valor: String(days) })}
                          aria-pressed={rule.valor === String(days)}
                          className={`h-7 rounded-lg border px-2 text-[11px] font-semibold transition-colors cursor-pointer ${rule.valor === String(days) ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-200 text-slate-600 hover:border-[#002187] dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#C4D600]"}`}
                        >
                          {days === 180 ? "6 meses" : `${days} dias`}
                        </button>
                      ))}
                    </div>
                  )}
                  {operator?.input === "two" && field?.type === "number" && (
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Até
                      <input
                        value={rule.valor2 ?? ""}
                        inputMode="decimal"
                        onChange={(event) => updateRule(index, { valor2: event.target.value })}
                        placeholder="0"
                        className={inputClass}
                      />
                    </label>
                  )}
                  {isDate && (
                    <BirthdayDatePicker
                      label={operator?.input === "two" ? "Data inicial" : "Data"}
                      value={rule.valor ?? ""}
                      onChange={(value) => updateRule(index, { valor: value })}
                      startAtToday
                    />
                  )}
                  {isDate && operator?.input === "two" && (
                    <BirthdayDatePicker
                      label="Data final"
                      value={rule.valor2 ?? ""}
                      onChange={(value) => updateRule(index, { valor2: value })}
                      startAtToday
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(rules.filter((_, ruleIndex) => ruleIndex !== index))}
                  aria-label={`Remover regra ${index + 1}`}
                  className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 cursor-pointer hover:cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {rules.length < MAX_RULES && (
        <button
          type="button"
          onClick={() => onChange([...rules, emptyRule()])}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-semibold text-[#002187] transition-colors hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-600 dark:text-[#C4D600] dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer hover:cursor-pointer"
        >
          <Plus className="h-4 w-4" />Adicionar regra
        </button>
      )}
      <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-[#002187]/15 bg-[#002187]/5 px-3 py-2.5 text-xs text-[#051647] dark:border-[#C4D600]/25 dark:bg-[#C4D600]/10 dark:text-slate-100">
        {preview.loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Users className="h-4 w-4 shrink-0" />}
        {preview.error ? (
          <span className="text-[#9a3d12] dark:text-[#F7915E]">{preview.error}</span>
        ) : preview.count === null && !preview.loading ? (
          <span className="text-slate-500 dark:text-slate-400">Preencha as regras para ver quantos contatos atendem a elas.</span>
        ) : (
          <span>
            {preview.loading && preview.count === null ? "Calculando..." : <><b className="font-bold tabular-nums">{(preview.count ?? 0).toLocaleString("pt-BR")}</b> contatos atendem a todas as regras</>}
          </span>
        )}
      </div>
    </div>
  );
}
