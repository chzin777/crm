"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { FIXED_PREFIX, PARAM_FIELDS, fixedText, isFixedParam } from "@/lib/campaign-wizard";

export type CampaignTemplate = {
  name: string;
  language: string;
  body: string;
  hasImage: boolean;
  /** Imagem de exemplo do cabeçalho do modelo na Meta (usada quando a campanha não anexa outra). */
  headerImageUrl?: string | null;
  /** Cabeçalho de texto e rodapé do modelo (só para a prévia; o envio usa o modelo da Meta). */
  headerText?: string | null;
  footer?: string | null;
  category?: string | null;
  // Campo de contato usado em cada variável {{1}}, {{2}}... ("fixo:texto" = texto igual para todos).
  params: string[];
  buttons?: { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string }[];
};

type ApiTemplate = { id: string; name: string; status: string; language: string; category?: string; body: string; headerFormat: string | null; headerText?: string; footer?: string; headerImageUrl?: string | null; buttons?: CampaignTemplate["buttons"] };

// Ordem padrão das variáveis ao escolher um modelo (a mesma de sempre: {{1}} nome, {{2}} e-mail...).
const DEFAULT_ORDER = ["nome", "email", "telefone", "segmento", "data_nascimento", "nome_atendente", "primeiro_nome_atendente"];

const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] cursor-pointer";
const smallField = "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";

export function variableCount(body: string) {
  return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
}

/**
 * Seletor de modelo aprovado da Meta + mapeamento das variáveis ({{1}}, {{2}}...) para um campo do contato ou texto
 * fixo. `showPreview` mostra o corpo cru (o assistente de campanha tem prévia própria); `paramsAction` entra ao lado do
 * título das variáveis (ex.: botão compacto de IA).
 */
export function CampaignTemplatePicker({ value, onChange, showPreview = true, paramsAction, label = "Modelo aprovado do WhatsApp (opcional)", emptyLabel = "Mensagem livre (sem modelo)" }: {
  value: CampaignTemplate | null;
  onChange: (value: CampaignTemplate | null) => void;
  showPreview?: boolean;
  paramsAction?: ReactNode;
  label?: string;
  emptyLabel?: string;
}) {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Recarrega a lista depois de criar um modelo em /modelos (aberto em outra aba).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/whatsapp/templates", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as { data?: ApiTemplate[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar os modelos.");
        if (active) setTemplates((result.data ?? []).filter((template) => template.status === "APPROVED"));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar os modelos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const handleSelect = (key: string) => {
    const template = templates.find((item) => `${item.name}|${item.language}` === key);
    if (!template) return onChange(null);
    onChange({
      name: template.name,
      language: template.language,
      body: template.body,
      hasImage: template.headerFormat === "IMAGE",
      headerImageUrl: template.headerFormat === "IMAGE" ? template.headerImageUrl ?? null : null,
      headerText: template.headerFormat === "TEXT" ? template.headerText ?? null : null,
      footer: template.footer || null,
      category: template.category ?? null,
      params: Array.from({ length: variableCount(template.body) }, (_, index) => DEFAULT_ORDER[index] ?? "nome"),
      buttons: template.buttons ?? [],
    });
  };

  // O modelo escolhido pode vir de uma campanha antiga sem cabeçalho/rodapé gravados: completa pela lista.
  const listed = value ? templates.find((item) => item.name === value.name && item.language === value.language) : undefined;
  useEffect(() => {
    if (!value || !listed || value.footer !== undefined) return;
    onChange({ ...value, headerText: listed.headerFormat === "TEXT" ? listed.headerText ?? null : null, footer: listed.footer || null, category: listed.category ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- completa uma única vez quando a lista chega
  }, [listed]);

  const setParam = (index: number, field: string) => value && onChange({ ...value, params: value.params.map((item, i) => (i === index ? field : item)) });
  const currentKey = value ? `${value.name}|${value.language}` : "";
  const missingFromList = value && !templates.some((item) => `${item.name}|${item.language}` === currentKey);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{label}</span>
          <select value={currentKey} onChange={(event) => handleSelect(event.target.value)} disabled={loading} className={selectClass}>
            <option value="">{loading ? "Carregando modelos..." : emptyLabel}</option>
            {missingFromList && value && <option value={currentKey}>{value.name} ({value.language})</option>}
            {templates.map((template) => (
              <option key={template.id} value={`${template.name}|${template.language}`}>{template.name} ({template.language}){template.category ? ` · ${template.category === "UTILITY" ? "Utilidade" : template.category === "MARKETING" ? "Marketing" : template.category}` : ""}</option>
            ))}
          </select>
        </label>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <a href="/modelos" target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-[#002187] hover:underline dark:text-[#C4D600] cursor-pointer"><ExternalLink className="h-3 w-3" />Criar novo modelo</a>
          <button type="button" onClick={() => { setLoading(true); setError(""); setReloadKey((key) => key + 1); }} disabled={loading} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 hover:underline disabled:opacity-50 dark:text-slate-400 dark:hover:text-white cursor-pointer"><RefreshCw className="h-3 w-3" />Atualizar lista</button>
        </p>
        {error && <p className="text-[11px] text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}
      </div>
      {value && (
        <div className="space-y-2.5">
          {showPreview && <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">{value.body}</p>}
          {value.hasImage && (
            <p className="rounded-lg border border-dashed border-slate-300 p-2.5 text-[11px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
              Modelo com imagem no cabeçalho. Sem anexo vai a imagem do modelo; para trocar, anexe uma imagem JPG ou PNG.
            </p>
          )}
          {value.params.length > 0 && (
            <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <legend className="sr-only">Variáveis do modelo</legend>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Variáveis do modelo</p>
                {paramsAction}
              </div>
              {value.params.map((field, index) => (
                <div key={index} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="mt-2 rounded-md bg-[#002187]/10 px-1.5 py-0.5 text-center font-mono text-[11px] font-bold text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">{`{{${index + 1}}}`}</span>
                  <select
                    value={isFixedParam(field) ? FIXED_PREFIX : field}
                    onChange={(event) => setParam(index, event.target.value === FIXED_PREFIX ? (isFixedParam(field) ? field : FIXED_PREFIX) : event.target.value)}
                    aria-label={`Conteúdo da variável ${index + 1}`}
                    className={`${smallField} cursor-pointer`}
                  >
                    {PARAM_FIELDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    <option value={FIXED_PREFIX}>Texto fixo...</option>
                  </select>
                  {isFixedParam(field) ? (
                    <input
                      value={fixedText(field)}
                      onChange={(event) => setParam(index, `${FIXED_PREFIX}${event.target.value}`)}
                      maxLength={200}
                      placeholder="Ex.: 20% de desconto"
                      aria-label={`Texto fixo da variável ${index + 1}`}
                      className={`${smallField} col-span-2 col-start-2 sm:col-span-1 sm:col-start-auto ${fixedText(field).trim() ? "" : "border-[#F7915E]"}`}
                    />
                  ) : <span className="hidden sm:block" />}
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
