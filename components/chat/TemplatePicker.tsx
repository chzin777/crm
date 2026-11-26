"use client";
import { useEffect, useMemo, useState } from "react";
import { Clock, Send } from "lucide-react";
import { ATTENDANT_FIELDS, attendantValues, fillAttendantTokens } from "@/lib/attendant-variables";
import { ownTemplates } from "@/lib/meta-sample-templates";

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
        else setTemplates(ownTemplates(data.data).filter((item) => item.status === "APPROVED"));
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
    <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-700/80 dark:bg-white/[0.03]">
      {requireNotice && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[#F7915E]" />Janela de 24h encerrada: envie um modelo aprovado para retomar a conversa.
        </p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
      <select aria-label="Modelo" value={selected} onChange={(event) => { setSelected(event.target.value); setParams(autoFill(templates.find((item) => `${item.name}|${item.language}` === event.target.value))); }} className={`${field} cursor-pointer bg-white! dark:bg-slate-800!`}>
        <option value="">Selecione um modelo</option>
        {templates.map((item) => <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>{item.name} ({item.language})</option>)}
      </select>
      {template && (
        <div className="flex justify-end">
          <p aria-label="Pré-visualização do modelo" className="max-h-40 max-w-[85%] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[#C4D600]/25 px-3 py-2 text-xs leading-relaxed text-slate-800 dark:bg-[#C4D600]/15 dark:text-slate-100">{preview}</p>
        </div>
      )}
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
      <div className="flex justify-end">
        <button type="button" onClick={() => void send()} disabled={!template || sending || Array.from({ length: count }).some((_, index) => !resolve(params[index] ?? "").trim())} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] hover:bg-[#b3c400] disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="h-4 w-4" />
          {sending ? "Enviando..." : "Enviar modelo"}
        </button>
      </div>
    </div>
  );
}
