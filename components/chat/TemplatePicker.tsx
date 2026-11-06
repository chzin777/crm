"use client";
import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";

type Template = { name: string; language: string; status: string; body: string };

export type TemplateChoice = { name: string; language: string; params: string[] };

export function TemplatePicker({ onSend, requireNotice = true }: { onSend: (template: TemplateChoice) => Promise<void>; requireNotice?: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

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

  const send = async () => {
    if (!template || sending) return;
    setSending(true);
    await onSend({ name: template.name, language: template.language, params: Array.from({ length: count }, (_, index) => params[index] ?? "") });
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
      <select aria-label="Modelo" value={selected} onChange={(event) => { setSelected(event.target.value); setParams([]); }} className={`${field} cursor-pointer`}>
        <option value="">Selecione um modelo</option>
        {templates.map((item) => <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>{item.name} ({item.language})</option>)}
      </select>
      {template && <p className="whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{template.body}</p>}
      {Array.from({ length: count }, (_, index) => (
        <input key={index} aria-label={`Variável ${index + 1}`} placeholder={`Variável {{${index + 1}}}`} value={params[index] ?? ""} onChange={(event) => setParams((current) => { const next = [...current]; next[index] = event.target.value; return next; })} className={field} />
      ))}
      <button type="button" onClick={() => void send()} disabled={!template || sending || Array.from({ length: count }).some((_, index) => !params[index]?.trim())} className="h-9 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-medium text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">
        {sending ? "Enviando..." : "Enviar modelo"}
      </button>
    </div>
  );
}
