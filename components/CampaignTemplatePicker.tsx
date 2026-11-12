"use client";

import { useEffect, useState } from "react";

export type CampaignTemplate = {
  name: string;
  language: string;
  body: string;
  hasImage: boolean;
  /** Imagem de exemplo do cabeçalho do modelo na Meta (usada quando a campanha não anexa outra). */
  headerImageUrl?: string | null;
  // Campo de contato usado em cada variável {{1}}, {{2}}...
  params: string[];
};

type ApiTemplate = { id: string; name: string; status: string; language: string; body: string; headerFormat: string | null; headerImageUrl?: string | null };

const FIELDS = [
  { value: "nome", label: "Nome do cliente" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "segmento", label: "Segmento" },
  { value: "data_nascimento", label: "Data de nascimento" },
];

const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] cursor-pointer";

export function variableCount(body: string) {
  return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
}

export function CampaignTemplatePicker({ value, onChange }: { value: CampaignTemplate | null; onChange: (value: CampaignTemplate | null) => void }) {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Recarrega a lista depois de criar um modelo em /modelos (aberto em outra aba).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
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
      params: Array.from({ length: variableCount(template.body) }, (_, index) => FIELDS[index]?.value ?? "nome"),
    });
  };

  const currentKey = value ? `${value.name}|${value.language}` : "";
  const missingFromList = value && !templates.some((item) => `${item.name}|${item.language}` === currentKey);

  return (
    <div className="space-y-2">
      <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        Modelo aprovado do WhatsApp (opcional)
        <select value={currentKey} onChange={(event) => handleSelect(event.target.value)} disabled={loading} className={selectClass}>
          <option value="">{loading ? "Carregando modelos..." : "Mensagem livre (sem modelo)"}</option>
          {missingFromList && value && <option value={currentKey}>{value.name} ({value.language})</option>}
          {templates.map((template) => (
            <option key={template.id} value={`${template.name}|${template.language}`}>{template.name} ({template.language})</option>
          ))}
        </select>
      </label>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <a href="/modelos" target="_blank" rel="noopener" className="font-semibold text-[#002187] hover:underline dark:text-[#C4D600] cursor-pointer">Criar novo modelo</a>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading} className="text-slate-500 hover:text-slate-800 hover:underline disabled:opacity-50 dark:text-slate-400 dark:hover:text-white cursor-pointer">Atualizar lista</button>
        <span className="text-slate-400">O modelo abre em outra aba; a campanha continua aqui.</span>
      </p>
      {error && <p className="text-[10px] text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}
      {value && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
          <p className="whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">{value.body}</p>
          {value.hasImage && (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-2 dark:border-slate-600 dark:bg-slate-900/40">
              {value.headerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- imagem hospedada pela Meta (domínio externo variável)
                <img src={value.headerImageUrl} alt="Imagem do cabeçalho do modelo" className="h-14 w-24 shrink-0 rounded-md object-cover" />
              ) : null}
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Modelo com imagem no cabeçalho. Sem anexo, vai a imagem do modelo; para trocar, anexe uma imagem JPG ou PNG (arquivo ou link) à campanha.
              </p>
            </div>
          )}
          {value.params.map((field, index) => (
            <label key={index} className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <span className="w-12 shrink-0">{`{{${index + 1}}}`}</span>
              <select
                value={field}
                onChange={(event) => onChange({ ...value, params: value.params.map((item, i) => (i === index ? event.target.value : item)) })}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] cursor-pointer"
              >
                {FIELDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
