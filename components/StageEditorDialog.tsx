"use client";

import { useState } from "react";
import { EntityDialog } from "@/components/EntityDialog";
import { CONTACT_CATEGORIES, type StageConfig, type StageCriteria } from "@/lib/pipeline-stages";

interface StageEditorDialogProps {
  stageName: string;
  config: StageConfig;
  position: number;
  stageCount: number;
  onClose: () => void;
  onSave: (config: StageConfig, position: number) => Promise<void>;
}

type NumericCriteriaKey = Exclude<keyof StageCriteria, "categorias">;
type TabId = "geral" | "prazo" | "sincronizacao" | "filtros";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "geral", label: "Geral" },
  { id: "prazo", label: "Prazo" },
  { id: "sincronizacao", label: "Sincronização" },
  { id: "filtros", label: "Filtros" },
];

const categoryLabels: Record<string, string> = { cliente: "Cliente", lead: "Lead", nps: "NPS", inativo: "Inativo" };

const criteriaGroups: Array<{ title: string; fields: Array<{ key: NumericCriteriaKey; label: string; integer: boolean }> }> = [
  {
    title: "Compras",
    fields: [
      { key: "minCompras", label: "Mínimo de compras", integer: true },
      { key: "maxCompras", label: "Máximo de compras", integer: true },
    ],
  },
  {
    title: "Valor gasto",
    fields: [
      { key: "minTotalGasto", label: "Gasto mínimo (R$)", integer: false },
      { key: "maxTotalGasto", label: "Gasto máximo (R$)", integer: false },
    ],
  },
  {
    title: "Tempo sem comprar",
    fields: [
      { key: "minDiasSemCompra", label: "Sem comprar há mais de (dias)", integer: true },
      { key: "maxDiasSemCompra", label: "Sem comprar há menos de (dias)", integer: true },
    ],
  },
];
const criteriaFields = criteriaGroups.flatMap((group) => group.fields);

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const labelClass = "block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300";

const toText = (value: number | null) => (value === null ? "" : String(value));

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-[#002187] dark:bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5 dark:bg-[#051647]" : ""}`} />
    </button>
  );
}

export function StageEditorDialog({ stageName, config, position, stageCount, onClose, onSave }: StageEditorDialogProps) {
  const [tab, setTab] = useState<TabId>("geral");
  const [titulo, setTitulo] = useState(config.titulo);
  const [descricao, setDescricao] = useState(config.descricao);
  const [newPosition, setNewPosition] = useState(position);
  const [maxDias, setMaxDias] = useState(toText(config.maxDiasNaEtapa));
  const [autoSync, setAutoSync] = useState(config.autoSync);
  const [criteria, setCriteria] = useState<Record<NumericCriteriaKey, string>>({
    minCompras: toText(config.criterios.minCompras),
    maxCompras: toText(config.criterios.maxCompras),
    minTotalGasto: toText(config.criterios.minTotalGasto),
    maxTotalGasto: toText(config.criterios.maxTotalGasto),
    minDiasSemCompra: toText(config.criterios.minDiasSemCompra),
    maxDiasSemCompra: toText(config.criterios.maxDiasSemCompra),
  });
  const [categorias, setCategorias] = useState<string[]>(config.criterios.categorias);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const parseOptional = (raw: string, label: string, integer: boolean): { value: number | null } | { error: string } => {
    const text = raw.trim().replace(",", ".");
    if (!text) return { value: null };
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
      return { error: `${label}: informe um número ${integer ? "inteiro " : ""}maior ou igual a zero.` };
    }
    return { value };
  };

  const fail = (target: TabId, message: string) => {
    setTab(target);
    setError(message);
  };

  const handleSave = async () => {
    if (!titulo.trim()) return fail("geral", "Informe o nome da etapa.");
    const parsedDias = parseOptional(maxDias, "Tempo limite na etapa", true);
    if ("error" in parsedDias) return fail("prazo", parsedDias.error);
    if (parsedDias.value === 0) return fail("prazo", "Tempo limite na etapa: informe pelo menos 1 dia ou deixe em branco.");

    const parsed = {} as Record<NumericCriteriaKey, number | null>;
    for (const field of criteriaFields) {
      const result = parseOptional(criteria[field.key], field.label, field.integer);
      if ("error" in result) return fail("filtros", result.error);
      parsed[field.key] = result.value;
    }
    const ranges: Array<[NumericCriteriaKey, NumericCriteriaKey, string]> = [
      ["minCompras", "maxCompras", "compras"],
      ["minTotalGasto", "maxTotalGasto", "gasto"],
      ["minDiasSemCompra", "maxDiasSemCompra", "dias sem comprar"],
    ];
    for (const [min, max, label] of ranges) {
      const low = parsed[min];
      const high = parsed[max];
      if (low !== null && high !== null && low > high) return fail("filtros", `O mínimo de ${label} não pode ser maior que o máximo.`);
    }

    setError("");
    setIsSaving(true);
    try {
      await onSave(
        {
          ...config,
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          maxDiasNaEtapa: parsedDias.value,
          autoSync,
          criterios: { ...parsed, categorias },
        },
        newPosition
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a etapa.");
      setIsSaving(false);
    }
  };

  return (
    <EntityDialog
      titleId="edit-stage-title"
      title={`Editar etapa: ${stageName}`}
      description="Defina nome, posição, prazo e quais contatos entram nesta etapa na sincronização."
      onClose={onClose}
      size="lg"
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div role="tablist" aria-label="Configurações da etapa" className="flex shrink-0 gap-1 border-b border-slate-200 dark:border-slate-700">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-xs font-bold transition-colors cursor-pointer hover:cursor-pointer ${tab === item.id ? "border-[#002187] text-[#002187] dark:border-[#C4D600] dark:text-[#C4D600]" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {tab === "geral" && (
            <>
              <label className={labelClass}>
                Nome da etapa
                <input value={titulo} onChange={(event) => setTitulo(event.target.value)} maxLength={40} className={inputClass} />
              </label>
              <label className={labelClass}>
                Descrição
                <input value={descricao} onChange={(event) => setDescricao(event.target.value)} maxLength={120} className={inputClass} />
              </label>
              <label className={labelClass}>
                Posição no funil
                <select value={newPosition} onChange={(event) => setNewPosition(Number(event.target.value))} className={`${inputClass} cursor-pointer`}>
                  {Array.from({ length: stageCount }, (_, index) => (
                    <option key={index} value={index}>{index + 1}ª etapa</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {tab === "prazo" && (
            <>
              <label className={labelClass}>
                Tempo limite na etapa (dias)
                <input value={maxDias} onChange={(event) => setMaxDias(event.target.value)} inputMode="numeric" placeholder="Sem limite" className={inputClass} />
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Cards que passarem do tempo limite recebem o aviso &quot;Prazo excedido&quot;. Deixe em branco para não ter limite.</p>
            </>
          )}

          {tab === "sincronizacao" && (
            <>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-white">Receber contatos na sincronização automática</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Quando desativado, esta etapa não recebe novos cards ao sincronizar.</p>
                </div>
                <Toggle checked={autoSync} onChange={setAutoSync} label="Receber contatos na sincronização automática" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Se um contato se encaixar em mais de uma etapa, ele vai para a mais avançada do funil. Os filtros ficam na aba &quot;Filtros&quot;.
              </p>
            </>
          )}

          {tab === "filtros" && (
            <>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Deixe campos em branco para não filtrar.{!autoSync && " Os filtros só valem com a sincronização automática ativada."}
              </p>
              {criteriaGroups.map((group) => (
                <fieldset key={group.title} className="space-y-2">
                  <legend className="text-xs font-bold text-slate-800 dark:text-white">{group.title}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <label key={field.key} className={labelClass}>
                        {field.label}
                        <input
                          value={criteria[field.key]}
                          onChange={(event) => setCriteria((current) => ({ ...current, [field.key]: event.target.value }))}
                          inputMode="decimal"
                          placeholder="Qualquer"
                          className={inputClass}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold text-slate-800 dark:text-white">Categoria do contato <span className="font-normal text-slate-500">(nenhuma ativa = todas)</span></legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CONTACT_CATEGORIES.map((category) => (
                    <div key={category} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                      <span className="text-xs text-slate-700 dark:text-slate-200">{categoryLabels[category]}</span>
                      <Toggle
                        checked={categorias.includes(category)}
                        onChange={(value) => setCategorias((current) => value ? [...current, category] : current.filter((item) => item !== category))}
                        label={categoryLabels[category]}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </div>

        {error && <p role="alert" className="shrink-0 text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={isSaving} className="h-9 rounded-lg bg-[#051647] px-4 text-xs font-bold text-white hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] cursor-pointer hover:cursor-pointer disabled:cursor-not-allowed">
            {isSaving ? "Salvando..." : "Salvar etapa"}
          </button>
        </div>
      </div>
    </EntityDialog>
  );
}
