"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import type { ChatMenuSettings, MenuOption } from "@/lib/chat/settings";

const field = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const label = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";
const card = "space-y-3 rounded-xl border border-slate-200/80 bg-white p-5 dark:border-slate-700/80 dark:bg-[#07194f]";

type Queues = { id: string; name: string }[];

function OptionsEditor({ options, queues, onChange }: { options: MenuOption[]; queues: Queues; onChange: (options: MenuOption[]) => void }) {
  const update = (index: number, patch: Partial<MenuOption>) => onChange(options.map((option, position) => (position === index ? { ...option, ...patch } : option)));
  return (
    <div className="space-y-3">
      {options.map((option, index) => (
        <div key={option.id} className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">{index + 1}.</span>
            <input aria-label="Rótulo da opção" placeholder="Rótulo" value={option.label} onChange={(event) => update(index, { label: event.target.value })} className={field} />
            <select aria-label="Ação da opção" value={option.action} onChange={(event) => update(index, { action: event.target.value as MenuOption["action"] })} className={`${field} w-36 cursor-pointer`}>
              <option value="reply">Responder</option>
              <option value="submenu">Submenu</option>
              <option value="queue">Enviar à fila</option>
            </select>
            <button type="button" aria-label="Remover opção" title="Remover opção" onClick={() => onChange(options.filter((_, position) => position !== index))} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>
          <textarea aria-label="Texto da opção" rows={2} placeholder={option.action === "submenu" ? "Frase antes da lista" : "Texto enviado ao cliente"} value={option.text} onChange={(event) => update(index, { text: event.target.value })} className={`${field} resize-none`} />
          {option.action === "queue" && (
            <select aria-label="Fila de destino" value={option.queueId ?? ""} onChange={(event) => update(index, { queueId: event.target.value || null })} className={`${field} cursor-pointer`}>
              <option value="">Selecione a fila</option>
              {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
            </select>
          )}
          {option.action === "submenu" && (
            <div className="ml-4 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
              <OptionsEditor options={option.options} queues={queues} onChange={(next) => update(index, { options: next })} />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, { id: crypto.randomUUID(), label: "", action: "reply", text: "", queueId: null, options: [] }])}
        className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#002187] dark:text-[#C4D600]"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar opção
      </button>
    </div>
  );
}

export function MenuSettingsPanel({ queues }: { queues: Queues }) {
  const toast = useToast();
  const [settings, setSettings] = useState<ChatMenuSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/chat/settings", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok && active) setSettings(((await response.json()) as { data: ChatMenuSettings }).data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!settings) return <div className="flex h-40 items-center justify-center"><LoadingSpinner label="Carregando menu..." size={32} /></div>;

  const set = <K extends keyof ChatMenuSettings>(key: K, value: ChatMenuSettings[K]) => setSettings({ ...settings, [key]: value });
  const check = (key: "enabled" | "repeatMenu" | "acceptFreeText" | "notifyQueuePosition" | "silenceEnabled", text: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
      <input type="checkbox" checked={settings[key]} onChange={(event) => set(key, event.target.checked)} className="cursor-pointer" />{text}
    </label>
  );
  const text = (key: "greeting" | "footer" | "closingText" | "invalidOptionText" | "farewellText" | "silenceAskText" | "silenceCloseText", title: string) => (
    <div><label htmlFor={`menu-${key}`} className={label}>{title}</label><textarea id={`menu-${key}`} rows={2} value={settings[key]} onChange={(event) => set(key, event.target.value)} className={`${field} resize-none`} /></div>
  );
  const number = (key: "closingDelaySeconds" | "silenceAskMinutes" | "silenceCloseMinutes", title: string) => (
    <div><label htmlFor={`menu-${key}`} className={label}>{title}</label><input id={`menu-${key}`} type="number" min={0} value={settings[key]} onChange={(event) => set(key, Number(event.target.value))} className={field} /></div>
  );

  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/chat/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    setSaving(false);
    if (response.ok) toast.success("Menu salvo.");
    else toast.error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Menu automático</h2>
        {check("enabled", "Menu ligado")}
        {text("greeting", "Saudação, use {menu} para a lista")}
        {text("footer", "Rodapé da lista")}
        {text("invalidOptionText", "Opção inválida")}
        {check("acceptFreeText", "Texto que não é opção segue adiante")}
        {text("closingText", "Frase de fechamento")}
        {number("closingDelaySeconds", "Segundos até o fechamento")}
        {check("repeatMenu", "Repetir a lista no fechamento")}
        <h3 className="pt-2 text-xs font-bold text-slate-900 dark:text-white">Opções</h3>
        <OptionsEditor options={settings.options} queues={queues} onChange={(options) => set("options", options)} />
      </section>
      <section className={`${card} self-start`}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Avisos ao cliente</h2>
        {text("farewellText", "Despedida ao encerrar")}
        {check("notifyQueuePosition", "Avisar quando a posição na fila mudar")}
        {check("silenceEnabled", "Cuidar do silêncio do cliente")}
        <div className="grid grid-cols-2 gap-3">
          {number("silenceAskMinutes", "Minutos até perguntar")}
          {number("silenceCloseMinutes", "Minutos até encerrar")}
        </div>
        {text("silenceAskText", "Pergunta, use {minutos}")}
        {text("silenceCloseText", "Encerramento por silêncio")}
        <button type="button" onClick={() => void save()} disabled={saving} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </section>
    </div>
  );
}
