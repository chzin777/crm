"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CornerDownRight, Hand, ListOrdered, ListTree, MessageCircleQuestion, MessageSquareText, MessagesSquare, Plus, Save, Timer, Trash2, X } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { ChoiceCards, DurationField, MessageField, SettingCard, Switch, SwitchRow, fieldClass, labelClass } from "@/components/chat/MenuFormParts";
import { MenuSimulator } from "@/components/chat/MenuSimulator";
import { DEFAULT_CHAT_SETTINGS, type ChatMenuSettings, type MenuOption } from "@/lib/chat/settings";

type Queues = { id: string; name: string }[];
type Section = "menu" | "texts" | "silence" | "closing";

const field = fieldClass;
const CUSTOMER_VARIABLES = [{ mark: "{cliente}", label: "Nome do cliente" }, { mark: "{saudacao}", label: "Bom dia/tarde/noite" }];
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

/** Etapa da linha do tempo do silêncio. */
function TimelineStep({ number, title, description, last = false, children }: { number: number; title: string; description: string; last?: boolean; children?: React.ReactNode }) {
  return (
    <li className="relative pl-12">
      {!last && <span aria-hidden className="absolute bottom-0 left-[15px] top-8 w-0.5 bg-slate-200 dark:bg-slate-700" />}
      <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full bg-[#051647] text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{number}</span>
      <div className={last ? "" : "pb-6"}>
        <h3 className="pt-1 text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        {children && <div className="space-y-4">{children}</div>}
      </div>
    </li>
  );
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
                <MessageField
                  id={`text-${option.id}`}
                  variables={CUSTOMER_VARIABLES}
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

        <div className="min-w-0 space-y-4">
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
            <section className={`${panel} space-y-5`}>
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
            </section>
          )}

          {section === "texts" && (
            <>
              <SettingCard icon={MessagesSquare} title="Abertura" description="A primeira mensagem que o cliente recebe.">
                <MessageField id="menu-greeting" label="Saudação" rows={4} value={settings.greeting} onChange={(value) => set("greeting", value)} variables={[...CUSTOMER_VARIABLES, { mark: "{menu}", label: "Lista de opções" }]} hint="Sem a lista de opções no texto, ela entra no fim." />
                <MessageField id="menu-footer" label="Rodapé da lista" rows={1} value={settings.footer} onChange={(value) => set("footer", value)} />
              </SettingCard>

              <SettingCard icon={MessageCircleQuestion} title="Quando o cliente não escolhe uma opção" description="O que fazer se ele escrever algo fora da lista.">
                <ChoiceCards
                  label="Mensagem fora das opções"
                  value={settings.acceptFreeText ? "team" : "ask"}
                  onChange={(value) => set("acceptFreeText", value === "team")}
                  options={[
                    { id: "team", title: "Passar para a equipe", description: "A conversa segue para a fila." },
                    { id: "ask", title: "Pedir para escolher", description: "Envia um aviso e repete a lista." },
                  ]}
                />
                {!settings.acceptFreeText && <MessageField id="menu-invalid" label="Aviso" rows={2} value={settings.invalidOptionText} onChange={(value) => set("invalidOptionText", value)} />}
              </SettingCard>

              <SettingCard icon={Timer} title="Depois de responder uma opção" description="Uma pergunta de fechamento, sem atropelar quem ainda está lendo.">
                <DurationField
                  label="Tempo de espera"
                  value={settings.closingDelaySeconds}
                  onChange={(value) => set("closingDelaySeconds", value)}
                  unit="seg"
                  min={0}
                  max={3600}
                  step={15}
                  presets={[{ value: 0, label: "Na hora" }, { value: 30, label: "30 seg" }, { value: 60, label: "1 min" }, { value: 120, label: "2 min" }, { value: 300, label: "5 min" }]}
                />
                <MessageField id="menu-closing" label="Frase de fechamento" rows={2} value={settings.closingText} onChange={(value) => set("closingText", value)} hint="Se o cliente escrever antes, a frase não é enviada." />
                <SwitchRow title="Repetir a lista junto" description="Mostra as opções de novo com a frase." checked={settings.repeatMenu} onChange={(value) => set("repeatMenu", value)} />
              </SettingCard>
            </>
          )}

          {section === "silence" && (
            <SettingCard
              icon={Timer}
              title="Silêncio do cliente"
              description={settings.silenceEnabled ? `Sem resposta, a conversa encerra em ${settings.silenceAskMinutes + settings.silenceCloseMinutes} minutos. Só no menu: com a equipe, nunca encerra sozinha.` : "Desligado: conversas paradas no menu ficam abertas."}
              action={<Switch checked={settings.silenceEnabled} onChange={(value) => set("silenceEnabled", value)} label="Cuidar do silêncio do cliente" />}
            >
              {settings.silenceEnabled && (
                <ol>
                  <TimelineStep number={1} title="Cliente para de responder" description="O tempo conta a partir da última mensagem do menu." />
                  <TimelineStep number={2} title="Perguntar se ainda está aí" description="Se ele responder, o menu continua normalmente.">
                    <DurationField label="Esperar antes de perguntar" value={settings.silenceAskMinutes} onChange={(value) => set("silenceAskMinutes", value)} unit="min" min={1} max={1440} step={1} presets={[5, 10, 15, 30].map((value) => ({ value, label: `${value} min` }))} />
                    <MessageField id="menu-silence-ask" label="Pergunta" rows={2} value={settings.silenceAskText} onChange={(value) => set("silenceAskText", value)} variables={[{ mark: "{minutos}", label: "Tempo até encerrar" }]} />
                  </TimelineStep>
                  <TimelineStep number={3} title="Encerrar a conversa" description="Se ele voltar depois, começa uma conversa nova." last>
                    <DurationField label="Esperar depois da pergunta" value={settings.silenceCloseMinutes} onChange={(value) => set("silenceCloseMinutes", value)} unit="min" min={1} max={1440} step={1} presets={[2, 3, 5, 10].map((value) => ({ value, label: `${value} min` }))} />
                    <MessageField id="menu-silence-close" label="Mensagem de encerramento" rows={2} value={settings.silenceCloseText} onChange={(value) => set("silenceCloseText", value)} />
                  </TimelineStep>
                </ol>
              )}
            </SettingCard>
          )}

          {section === "closing" && (
            <>
              <SettingCard
                icon={Hand}
                title="Despedida"
                description="Enviada quando a equipe encerra, se a janela de 24h estiver aberta."
                action={<Switch checked={settings.farewellText.trim().length > 0} onChange={(value) => set("farewellText", value ? DEFAULT_CHAT_SETTINGS.farewellText : "")} label="Enviar despedida" />}
              >
                {settings.farewellText.trim().length > 0 && <MessageField id="menu-farewell" label="Mensagem" rows={3} value={settings.farewellText} onChange={(value) => set("farewellText", value)} variables={CUSTOMER_VARIABLES} />}
              </SettingCard>

              <SettingCard
                icon={ListOrdered}
                title="Posição na fila"
                description="Avisa o cliente quando ele avança, se a janela de 24h estiver aberta."
                action={<Switch checked={settings.notifyQueuePosition} onChange={(value) => set("notifyQueuePosition", value)} label="Avisar quando a posição na fila mudar" />}
              >
                {settings.notifyQueuePosition && (
                  <div>
                    <p className={labelClass}>O cliente recebe</p>
                    <p className="w-fit max-w-full rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">Você avançou na fila: agora é o 2º da fila Vendas. Obrigado por aguardar.</p>
                  </div>
                )}
              </SettingCard>
            </>
          )}
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
