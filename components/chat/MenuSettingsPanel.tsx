"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CornerDownRight, ListTree, MessageSquareText, Plus, Save, Timer, Trash2, X } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { MenuSimulator } from "@/components/chat/MenuSimulator";
import type { ChatMenuSettings, MenuOption } from "@/lib/chat/settings";

type Queues = { id: string; name: string }[];
type Section = "menu" | "texts" | "silence" | "closing";

const field = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const labelClass = "mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200";
const hintClass = "mt-1 text-[11px] text-slate-500 dark:text-slate-400";
const panel = "min-w-0 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-700/80 dark:bg-[#07194f]";

const ACTIONS: { id: MenuOption["action"]; label: string; hint: string }[] = [
  { id: "reply", label: "Responder", hint: "Envia um texto e continua no menu." },
  { id: "submenu", label: "Abrir submenu", hint: "Mostra outra lista de opções." },
  { id: "queue", label: "Enviar à fila", hint: "Encerra o menu e passa para a equipe." },
];

const updateTree = (options: MenuOption[], id: string, patch: Partial<MenuOption>): MenuOption[] =>
  options.map((option) => (option.id === id ? { ...option, ...patch } : { ...option, options: updateTree(option.options, id, patch) }));

const removeFromTree = (options: MenuOption[], id: string): MenuOption[] =>
  options.filter((option) => option.id !== id).map((option) => ({ ...option, options: removeFromTree(option.options, id) }));

function moveInTree(options: MenuOption[], id: string, step: number): MenuOption[] {
  const index = options.findIndex((option) => option.id === id);
  if (index >= 0) {
    const target = index + step;
    if (target < 0 || target >= options.length) return options;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return options.map((option) => ({ ...option, options: moveInTree(option.options, id, step) }));
}

const newOption = (): MenuOption => ({ id: crypto.randomUUID(), label: "", action: "reply", text: "", queueId: null, options: [] });

const addToTree = (options: MenuOption[], parentId: string, option: MenuOption): MenuOption[] =>
  options.map((item) => (item.id === parentId ? { ...item, options: [...item.options, option] } : { ...item, options: addToTree(item.options, parentId, option) }));

function findIssues(settings: ChatMenuSettings) {
  const issues: string[] = [];
  if (settings.enabled && settings.options.length === 0) issues.push("O menu está ligado, mas não tem opções.");
  if (!settings.greeting.trim()) issues.push("A saudação está vazia.");
  const walk = (options: MenuOption[], prefix: string) =>
    options.forEach((option, index) => {
      const name = `${prefix}${index + 1}`;
      if (!option.label.trim()) issues.push(`A opção ${name} está sem rótulo.`);
      if (option.action === "reply" && !option.text.trim()) issues.push(`A opção ${name} não tem resposta.`);
      if (option.action === "queue" && !option.queueId) issues.push(`A opção ${name} não tem fila de destino.`);
      if (option.action === "submenu") {
        if (option.options.length === 0) issues.push(`O submenu ${name} não tem opções.`);
        walk(option.options, `${name}.`);
      }
    });
  walk(settings.options, "");
  return issues;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${checked ? "bg-[#002187] dark:bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

function SwitchRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-white/5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function TextArea({ id, label, hint, value, rows = 3, onChange }: { id: string; label: string; hint?: string; value: string; rows?: number; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <textarea id={id} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className={`${field} resize-y`} />
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

function NumberInline({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return <input type="number" min={0} aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-9 w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 text-center text-sm font-semibold text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />;
}

type TreeProps = {
  options: MenuOption[];
  prefix: string;
  openId: string | null;
  queues: Queues;
  onOpen: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<MenuOption>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, step: number) => void;
  onAdd: (parentId: string | null) => void;
};

function OptionTree({ options, prefix, openId, queues, onOpen, onPatch, onRemove, onMove, onAdd }: TreeProps) {
  return (
    <ul className="space-y-2">
      {options.map((option, index) => {
        const open = openId === option.id;
        const queueName = queues.find((queue) => queue.id === option.queueId)?.name;
        const summary = option.action === "submenu" ? `Submenu · ${option.options.length} ${option.options.length === 1 ? "opção" : "opções"}` : option.action === "queue" ? `Fila: ${queueName ?? "não escolhida"}` : "Responde um texto";
        return (
          <li key={option.id} className={`rounded-xl border transition-colors ${open ? "border-[#002187] dark:border-[#C4D600]" : "border-slate-200/80 dark:border-slate-700/80"}`}>
            <div className="flex items-center gap-2 p-2">
              <button type="button" aria-expanded={open} onClick={() => onOpen(open ? null : option.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-[#051647] px-1 text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{prefix}{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{option.label || "Sem rótulo"}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{summary}</span>
                </span>
              </button>
              <button type="button" title="Subir" aria-label={`Subir ${option.label || "opção"}`} disabled={index === 0} onClick={() => onMove(option.id, -1)} className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" title="Descer" aria-label={`Descer ${option.label || "opção"}`} disabled={index === options.length - 1} onClick={() => onMove(option.id, 1)} className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" title="Excluir" aria-label={`Excluir ${option.label || "opção"}`} onClick={() => onRemove(option.id)} className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
            {open && (
              <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
                <div>
                  <label htmlFor={`label-${option.id}`} className={labelClass}>Rótulo que o cliente lê</label>
                  <input id={`label-${option.id}`} autoFocus={!option.label} value={option.label} placeholder="Ex.: Falar com vendas" onChange={(event) => onPatch(option.id, { label: event.target.value })} className={field} />
                </div>
                <div>
                  <p className={labelClass}>O que acontece ao escolher</p>
                  <div role="radiogroup" aria-label="Ação da opção" className="grid gap-2 sm:grid-cols-3">
                    {ACTIONS.map((action) => {
                      const selected = option.action === action.id;
                      return (
                        <button key={action.id} type="button" role="radio" aria-checked={selected} onClick={() => onPatch(option.id, { action: action.id })} className={`cursor-pointer rounded-lg border p-2.5 text-left transition-colors ${selected ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5"}`}>
                          <span className="block text-xs font-semibold text-slate-900 dark:text-white">{action.label}</span>
                          <span className="block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{action.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {option.action === "queue" && (
                  <div>
                    <label htmlFor={`queue-${option.id}`} className={labelClass}>Fila de destino</label>
                    <select id={`queue-${option.id}`} value={option.queueId ?? ""} onChange={(event) => onPatch(option.id, { queueId: event.target.value || null })} className={`${field} cursor-pointer`}>
                      <option value="">Selecione a fila</option>
                      {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                    </select>
                  </div>
                )}
                <TextArea
                  id={`text-${option.id}`}
                  label={option.action === "submenu" ? "Frase antes da lista (opcional)" : option.action === "queue" ? "Mensagem ao encaminhar (opcional)" : "Resposta enviada ao cliente"}
                  value={option.text}
                  onChange={(value) => onPatch(option.id, { text: value })}
                />
              </div>
            )}
            {option.action === "submenu" && (
              <div className="border-t border-slate-100 p-3 pl-4 dark:border-slate-800">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400"><CornerDownRight className="h-3.5 w-3.5" />Opções deste submenu</p>
                <OptionTree options={option.options} prefix={`${prefix}${index + 1}.`} openId={openId} queues={queues} onOpen={onOpen} onPatch={onPatch} onRemove={onRemove} onMove={onMove} onAdd={onAdd} />
                <button type="button" onClick={() => onAdd(option.id)} className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#002187] hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />Adicionar ao submenu</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MenuSettingsPanel({ queues }: { queues: Queues }) {
  const toast = useToast();
  const [settings, setSettings] = useState<ChatMenuSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [section, setSection] = useState<Section>("menu");
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/chat/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || !active) return;
        const { data } = (await response.json()) as { data: ChatMenuSettings };
        setSettings(data);
        setSaved(JSON.stringify(data));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const issues = useMemo(() => (settings ? findIssues(settings) : []), [settings]);

  if (!settings) return <div className="flex h-40 items-center justify-center"><LoadingSpinner label="Carregando menu..." size={32} /></div>;

  const dirty = JSON.stringify(settings) !== saved;
  const set = <K extends keyof ChatMenuSettings>(key: K, value: ChatMenuSettings[K]) => setSettings({ ...settings, [key]: value });
  const blocking = issues.filter((issue) => issue.includes("sem rótulo"));

  const addOption = (parentId: string | null) => {
    const option = newOption();
    set("options", parentId ? addToTree(settings.options, parentId, option) : [...settings.options, option]);
    setOpenId(option.id);
  };

  const removeOption = (id: string) => {
    set("options", removeFromTree(settings.options, id));
    if (openId === id) setOpenId(null);
  };

  const save = async () => {
    if (blocking.length > 0) {
      toast.error(blocking[0]);
      return;
    }
    setSaving(true);
    const response = await fetch("/api/chat/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }).catch(() => null);
    setSaving(false);
    if (response?.ok) {
      setSaved(JSON.stringify(settings));
      toast.success("Alterações salvas.");
    } else {
      toast.error(((await response?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
    }
  };

  const sections: { id: Section; label: string; status: string; icon: typeof Timer }[] = [
    { id: "menu", label: "Menu do WhatsApp", status: `${settings.enabled ? "Ligado" : "Desligado"} · ${settings.options.length} ${settings.options.length === 1 ? "opção" : "opções"}`, icon: ListTree },
    { id: "texts", label: "Textos do menu", status: "Saudação, rodapé e fechamento", icon: MessageSquareText },
    { id: "silence", label: "Silêncio do cliente", status: settings.silenceEnabled ? `${settings.silenceAskMinutes} min + ${settings.silenceCloseMinutes} min` : "Desligado", icon: Timer },
    { id: "closing", label: "Encerramento e fila", status: settings.farewellText.trim() ? "Despedida ativa" : "Sem despedida", icon: CheckCircle2 },
  ];

  return (
    <div className={dirty ? "pb-20" : ""}>
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
        <aside className="rounded-xl border border-slate-200/80 bg-white p-2 shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]">
          <ul>
            {sections.map(({ id, label, status, icon: Icon }) => {
              const active = section === id;
              return (
                <li key={id}>
                  <button type="button" aria-current={active} onClick={() => setSection(id)} className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${active ? "bg-[#051647]/5 dark:bg-white/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                    <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#002187] dark:text-[#C4D600]" : "text-slate-400"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{status}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        {(section === "menu" || section === "texts") && <MenuSimulator settings={settings} queues={queues} />}
        </div>

        <div className="min-w-0">
          <section className={`${panel} space-y-5`}>
            {issues.length > 0 && (
              <div role="status" className="rounded-xl border border-[#F7915E]/50 bg-[#F7915E]/10 px-4 py-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><AlertTriangle className="h-4 w-4 text-[#F7915E]" />Falta ajustar</p>
                <ul className="list-disc space-y-0.5 pl-6 text-xs text-slate-700 dark:text-slate-200">
                  {issues.slice(0, 5).map((issue) => <li key={issue}>{issue}</li>)}
                  {issues.length > 5 && <li>e mais {issues.length - 5}.</li>}
                </ul>
              </div>
            )}

            {section === "menu" && (
              <>
                <SwitchRow title="Menu automático" description={settings.enabled ? "Conversas novas começam no menu, sem ninguém assumir." : "Desligado: conversas novas vão direto para a primeira fila."} checked={settings.enabled} onChange={(value) => set("enabled", value)} />
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">Opções do menu</h2>
                    <button type="button" onClick={() => addOption(null)} className="inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg bg-[#051647] px-3 text-sm font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]"><Plus className="h-4 w-4" />Adicionar opção</button>
                  </div>
                  {settings.options.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
                      <ListTree className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Nenhuma opção ainda</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comece pelos assuntos mais comuns, como Vendas, Pós-venda e Financeiro.</p>
                    </div>
                  ) : (
                    <OptionTree
                      options={settings.options}
                      prefix=""
                      openId={openId}
                      queues={queues}
                      onOpen={setOpenId}
                      onPatch={(id, patch) => set("options", updateTree(settings.options, id, patch))}
                      onRemove={removeOption}
                      onMove={(id, step) => set("options", moveInTree(settings.options, id, step))}
                      onAdd={addOption}
                    />
                  )}
                </div>
              </>
            )}

            {section === "texts" && (
              <>
                <TextArea id="menu-greeting" label="Saudação" rows={4} value={settings.greeting} onChange={(value) => set("greeting", value)} hint="Use {cliente} para o nome e {menu} para o lugar da lista. Sem {menu}, a lista vai no fim." />
                <TextArea id="menu-footer" label="Rodapé da lista" rows={2} value={settings.footer} onChange={(value) => set("footer", value)} />
                <SwitchRow title="Aceitar texto livre" description={settings.acceptFreeText ? "Quem escreve fora das opções segue para a equipe." : "Quem escreve fora das opções recebe o aviso abaixo."} checked={settings.acceptFreeText} onChange={(value) => set("acceptFreeText", value)} />
                {!settings.acceptFreeText && <TextArea id="menu-invalid" label="Aviso de opção inválida" rows={2} value={settings.invalidOptionText} onChange={(value) => set("invalidOptionText", value)} />}
                <div className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Depois de responder uma opção</h2>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">Enviar a frase de fechamento depois de <NumberInline label="Segundos até o fechamento" value={settings.closingDelaySeconds} onChange={(value) => set("closingDelaySeconds", value)} /> segundos</p>
                  <TextArea id="menu-closing" label="Frase de fechamento" rows={2} value={settings.closingText} onChange={(value) => set("closingText", value)} hint="Se o cliente escrever antes, a frase não é enviada." />
                  <SwitchRow title="Repetir a lista no fechamento" description="Mostra as opções de novo junto com a frase." checked={settings.repeatMenu} onChange={(value) => set("repeatMenu", value)} />
                </div>
              </>
            )}

            {section === "silence" && (
              <>
                <SwitchRow title="Cuidar do silêncio do cliente" description="Vale só para conversas no menu, sem atendente. Conversa com a equipe nunca encerra sozinha." checked={settings.silenceEnabled} onChange={(value) => set("silenceEnabled", value)} />
                {settings.silenceEnabled && (
                  <>
                    <div className="space-y-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">Se o cliente não responder por <NumberInline label="Minutos até perguntar" value={settings.silenceAskMinutes} onChange={(value) => set("silenceAskMinutes", value)} /> minutos, perguntar:</p>
                      <TextArea id="menu-silence-ask" label="Pergunta" rows={2} value={settings.silenceAskText} onChange={(value) => set("silenceAskText", value)} hint="{minutos} vira o tempo até encerrar." />
                    </div>
                    <div className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">Sem resposta por mais <NumberInline label="Minutos até encerrar" value={settings.silenceCloseMinutes} onChange={(value) => set("silenceCloseMinutes", value)} /> minutos, encerrar com:</p>
                      <TextArea id="menu-silence-close" label="Mensagem de encerramento" rows={2} value={settings.silenceCloseText} onChange={(value) => set("silenceCloseText", value)} />
                    </div>
                  </>
                )}
              </>
            )}

            {section === "closing" && (
              <>
                <TextArea id="menu-farewell" label="Despedida ao encerrar" rows={3} value={settings.farewellText} onChange={(value) => set("farewellText", value)} hint="Enviada quando a equipe encerra, se a janela de 24h estiver aberta. Vazia, nada é enviado." />
                <SwitchRow title="Avisar quando a posição na fila mudar" description="O cliente recebe uma mensagem ao avançar na fila, se a janela de 24h estiver aberta." checked={settings.notifyQueuePosition} onChange={(value) => set("notifyQueuePosition", value)} />
              </>
            )}
          </section>
        </div>
      </div>

      {dirty && (
        <div className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-2xl dark:border-slate-700 dark:bg-[#07194f]">
          <span className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#F7915E]" />
          <span className="whitespace-nowrap text-sm font-medium text-slate-700 dark:text-slate-200">Alterações não salvas</span>
          <button type="button" onClick={() => { setSettings(JSON.parse(saved) as ChatMenuSettings); setOpenId(null); }} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><X className="h-4 w-4" />Descartar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#051647] px-4 py-2 text-sm font-semibold text-white hover:bg-[#002187] disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      )}
    </div>
  );
}
