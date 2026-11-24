"use client";
import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { ATTENDANT_FIELDS, attendantValues, fillAttendantTokens } from "@/lib/attendant-variables";

type Template = { name: string; language: string; status: string; body: string };

export type TemplateChoice = { name: string; language: string; params: string[] };

type CommercialVariables = { model: string; store: string; city: string };

export function TemplatePicker({ onSend, requireNotice = true, customerName, agentName, conversationId, storeName }: { onSend: (template: TemplateChoice) => Promise<void>; requireNotice?: boolean; customerName?: string | null; agentName?: string | null; conversationId?: string | null; storeName?: string | null }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [commercial, setCommercial] = useState<CommercialVariables | null>(null);

  // Reengajamento de lead expirado: modelo consultado e loja/região vêm da conversa (catálogo, funil de vendas).
  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    fetch(`/api/chat/conversations/${conversationId}/brief?variables=1`)
      .then(async (response) => (response.ok ? ((await response.json()) as { variables?: CommercialVariables }) : {}))
      .then((data) => { if (active && data.variables) setCommercial(data.variables); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    fetch("/api/whatsapp/templates")
      .then(async (response) => {
        const data = (await response.json()) as { data?: Template[]; error?: string };
        if (!active) return;
        if (!response.ok) setError(data.error ?? "Não foi possível carregar os modelos.");
        else setTemplates((data.data ?? []).filter((item) => item.status === "APPROVED"));
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar os modelos.");
      });
    return () => {
      active = false;
    };
  }, []);

  const template = templates.find((item) => `${item.name}|${item.language}` === selected);
  const count = useMemo(() => new Set(template?.body.match(/\{\{\d+\}\}/g) ?? []).size, [template]);

  // Variáveis do cliente e do atendente (operador logado): {{nome_atendente}} e afins viram o valor real no envio.
  const attendant = useMemo(() => attendantValues(agentName), [agentName]);
  const resolve = (value: string) => {
    const customer = (customerName ?? "").trim();
    return fillAttendantTokens(value, attendant)
      .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, customer.split(/\s+/)[0] ?? "")
      .replace(/\{\{\s*nome\s*\}\}/gi, customer)
      .replace(/\{\{\s*modelo_consultado\s*\}\}/gi, commercial?.model ?? "")
      .replace(/\{\{\s*unidade\s*\}\}/gi, unit);
  };
  const unit = (commercial?.store || storeName || commercial?.city || "").trim();
  const sources = [
    ...(customerName?.trim() ? [{ label: "Nome do cliente", value: "{{nome}}" }, { label: "Primeiro nome do cliente", value: "{{primeiro_nome}}" }] : []),
    ...(commercial?.model ? [{ label: "Modelo consultado", value: "{{modelo_consultado}}" }] : []),
    ...(unit ? [{ label: "Unidade", value: "{{unidade}}" }] : []),
    ...ATTENDANT_FIELDS.map((item) => ({ label: item.label, value: `{{${item.value}}}` })),
  ];
  // Preenchimento automático ao escolher o modelo: {{1}} nome, {{2}} modelo consultado, {{3}} unidade (o atendente ajusta).
  const autoFill = (choice: Template | undefined) => {
    if (!choice) return [];
    const total = new Set(choice.body.match(/\{\{\d+\}\}/g) ?? []).size;
    const defaults = [customerName?.trim() ? "{{primeiro_nome}}" : "", commercial?.model ? "{{modelo_consultado}}" : "", unit ? "{{unidade}}" : ""];
    return Array.from({ length: total }, (_, index) => defaults[index] ?? "");
  };
  const setParam = (index: number, value: string) => setParams((current) => { const next = [...current]; next[index] = value; return next; });
  const preview = template
    ? template.body.replace(/\{\{(\d+)\}\}/g, (mark, number: string) => resolve(params[Number(number) - 1] ?? "").trim() || mark)
    : "";

  const send = async () => {
    if (!template || sending) return;
    setSending(true);
    await onSend({ name: template.name, language: template.language, params: Array.from({ length: count }, (_, index) => resolve(params[index] ?? "").trim()) });
    setSending(false);
  };

  const field = "h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";

  return (
    <div className="space-y-2">
      {requireNotice && (
        <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Clock className="h-4 w-4 shrink-0" />Faz mais de 24h desde a última mensagem do cliente. Só é possível enviar um modelo aprovado.
        </p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
      <select aria-label="Modelo" value={selected} onChange={(event) => { setSelected(event.target.value); setParams(autoFill(templates.find((item) => `${item.name}|${item.language}` === event.target.value))); }} className={`${field} cursor-pointer`}>
        <option value="">Selecione um modelo</option>
        {templates.map((item) => <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>{item.name} ({item.language})</option>)}
      </select>
      {template && <p aria-label="Pré-visualização do modelo" className="whitespace-pre-wrap break-words rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{preview}</p>}
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-1">
          <input aria-label={`Variável ${index + 1}`} placeholder={`Variável {{${index + 1}}}`} value={params[index] ?? ""} onChange={(event) => setParam(index, event.target.value)} className={field} />
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sources.map((source) => (
                <button key={source.label} type="button" onClick={() => setParam(index, source.value)} title={source.value} className="cursor-pointer rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-[#002187] hover:text-[#002187] dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600]">
                  {source.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => void send()} disabled={!template || sending || Array.from({ length: count }).some((_, index) => !resolve(params[index] ?? "").trim())} className="h-9 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-medium text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">
        {sending ? "Enviando..." : "Enviar modelo"}
      </button>
    </div>
  );
}
