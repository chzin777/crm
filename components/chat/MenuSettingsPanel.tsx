"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CornerDownRight, Hand, List, ListOrdered, ListTree, MessageCircleQuestion, MessagesSquare, Plus, Save, Star, Timer, Trash2, Workflow, X } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { ChoiceCards, DurationField, MessageField, SettingCard, Switch, SwitchRow, fieldClass, labelClass } from "@/components/chat/MenuFormParts";
import { CUSTOMER_VARIABLES, MenuOptionFields, menuActionSummary, type MenuPeople } from "@/components/chat/MenuOptionFields";
import { MenuSimulator } from "@/components/chat/MenuSimulator";
import { ClosingSimulator } from "@/components/chat/ClosingSimulator";
import { DEFAULT_CHAT_SETTINGS, NPS_SCORE_LABELS, npsScoreLine, addToTree, moveInTree, newMenuOption, removeFromTree, updateTree, type ChatMenuSettings, type MenuOption } from "@/lib/chat/settings";

const MenuFlowCanvas = dynamic(() => import("@/components/chat/MenuFlowCanvas").then((module) => module.MenuFlowCanvas), {
  ssr: false,
  loading: () => <div className="flex h-96 items-center justify-center"><LoadingSpinner label="Carregando fluxograma..." size={32} /></div>,
});

type Queues = MenuPeople;
type Section = "menu" | "silence" | "closing";
type MenuView = "list" | "canvas";

const field = fieldClass;
const panel = "min-w-0 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-700/80 dark:bg-[#07194f]";

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
      if (option.action === "assign" && !option.assigneeId) issues.push(`A opção ${name} não tem pessoa responsável.`);
      if (option.action === "tag" && !option.tagValue.trim()) issues.push(`A opção ${name} não tem etiqueta ou segmento definido.`);
      if (option.action === "close" && !option.text.trim()) issues.push(`A opção ${name} não tem mensagem final.`);
      if (option.action === "none") issues.push(`A opção ${name} não tem destino.`);
      if (option.action === "submenu") {
        if (option.options.length === 0) issues.push(`O submenu ${name} não tem opções.`);
        walk(option.options, `${name}.`);
      }
    });
  walk(settings.options, "");
  // Etapas soltas não rodam, mas as opções dentro delas precisam de rótulo para salvar.
  settings.canvas.drafts.forEach((draft) => walkDraftLabels(draft.options, "solta ", issues));
  if (settings.canvas.drafts.length > 0) issues.push(`${settings.canvas.drafts.length} ${settings.canvas.drafts.length === 1 ? "etapa solta não está ligada" : "etapas soltas não estão ligadas"} ao menu.`);
  return issues;
}

function walkDraftLabels(options: MenuOption[], prefix: string, issues: string[]) {
  options.forEach((option, index) => {
    const name = `${prefix}${index + 1}`;
    if (!option.label.trim()) issues.push(`A opção ${name} está sem rótulo.`);
    walkDraftLabels(option.options, `${name}.`, issues);
  });
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
  agents: MenuPeople;
  onOpen: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<MenuOption>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, step: number) => void;
  onAdd: (parentId: string | null) => void;
};

function OptionTree({ options, prefix, openId, queues, agents, onOpen, onPatch, onRemove, onMove, onAdd }: TreeProps) {
  return (
    <ul className="space-y-2">
      {options.map((option, index) => {
        const open = openId === option.id;
        const summary = menuActionSummary(option, queues, agents);
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
                <MenuOptionFields option={option} queues={queues} agents={agents} onPatch={(patch) => onPatch(option.id, patch)} />
              </div>
            )}
            {option.action === "submenu" && (
              <div className="border-t border-slate-100 p-3 pl-4 dark:border-slate-800">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400"><CornerDownRight className="h-3.5 w-3.5" />Opções deste submenu</p>
                <OptionTree options={option.options} prefix={`${prefix}${index + 1}.`} openId={openId} queues={queues} agents={agents} onOpen={onOpen} onPatch={onPatch} onRemove={onRemove} onMove={onMove} onAdd={onAdd} />
                <button type="button" onClick={() => onAdd(option.id)} className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#002187] hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />Adicionar ao submenu</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MenuSettingsPanel({ queues, agents }: { queues: Queues; agents: MenuPeople }) {
  const toast = useToast();
  const [view, setView] = useState<MenuView>("list");
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
  // Opção de fila sem fila escolhida mandaria o cliente para a fila padrão sem ninguém perceber.
  const blocking = issues.filter((issue) => issue.includes("sem rótulo") || issue.includes("não tem fila de destino"));

  const addOption = (parentId: string | null) => {
    const option = newMenuOption();
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
    { id: "silence", label: "Silêncio do cliente", status: settings.silenceEnabled ? `${settings.silenceAskMinutes} min + ${settings.silenceCloseMinutes} min` : "Desligado", icon: Timer },
    { id: "closing", label: "Encerramento e fila", status: `${settings.farewellText.trim() ? "Despedida ativa" : "Sem despedida"} · ${settings.npsEnabled ? "com pesquisa" : "sem pesquisa"}`, icon: CheckCircle2 },
  ];

  const issuesBanner = issues.length > 0 && (
    <div role="status" className="rounded-xl border border-[#F7915E]/50 bg-[#F7915E]/10 px-4 py-3">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><AlertTriangle className="h-4 w-4 text-[#F7915E]" />Falta ajustar</p>
      <ul className="list-disc space-y-0.5 pl-6 text-xs text-slate-700 dark:text-slate-200">
        {issues.slice(0, 5).map((issue) => <li key={issue}>{issue}</li>)}
        {issues.length > 5 && <li>e mais {issues.length - 5}.</li>}
      </ul>
    </div>
  );

  const views: { id: MenuView; label: string; icon: typeof Timer }[] = [
    { id: "list", label: "Visualização em Lista", icon: List },
    { id: "canvas", label: "Fluxograma / Canvas", icon: Workflow },
  ];

  return (
    <div className={dirty ? "pb-20" : ""}>
      <div role="tablist" aria-label="Modo de edição do menu" className="mb-4 inline-flex max-w-full gap-1 rounded-xl border border-slate-200/80 bg-white p-1 shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]">
        {views.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${view === id ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"}`}><Icon className="h-4 w-4 shrink-0" />{label}</button>
        ))}
      </div>

      {view === "canvas" ? (
        <div className="space-y-4">
          {issuesBanner}
          <MenuFlowCanvas settings={settings} queues={queues} agents={agents} saving={saving} onChange={setSettings} onSave={() => void save()} />
        </div>
      ) : (
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
        {section === "menu" && <MenuSimulator settings={settings} queues={queues} agents={agents} />}
        {section === "closing" && <ClosingSimulator settings={settings} />}
        </div>

        <div className="min-w-0 space-y-4">
          {issuesBanner}

          {section === "menu" && (
            <>
              <section className={panel}>
                <SwitchRow title="Menu automático" description={settings.enabled ? "Conversas novas começam no menu, sem ninguém assumir." : "Desligado: conversas novas vão direto para a primeira fila."} checked={settings.enabled} onChange={(value) => set("enabled", value)} />
              </section>

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

              <section className={`${panel} space-y-5`}>
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
                      agents={agents}
                      onOpen={setOpenId}
                      onPatch={(id, patch) => set("options", updateTree(settings.options, id, patch))}
                      onRemove={removeOption}
                      onMove={(id, step) => set("options", moveInTree(settings.options, id, step))}
                      onAdd={addOption}
                    />
                  )}
                </div>
              </section>
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
                  <TimelineStep number={3} title="Encerrar a conversa" description="Acontece se o cliente não responder à pergunta dentro do tempo abaixo. Se ele voltar depois, começa uma conversa nova." last>
                    <DurationField label="Esperar depois da pergunta" value={settings.silenceCloseMinutes} onChange={(value) => set("silenceCloseMinutes", value)} unit="min" min={1} max={1440} step={1} presets={[2, 3, 5, 10].map((value) => ({ value, label: `${value} min` }))} />
                    <div>
                      <SwitchRow
                        title="Personalizar mensagem ao encerrar por inatividade"
                        description={settings.silenceCloseCustom ? "O cliente recebe o texto abaixo." : "Usando a despedida padrão."}
                        tip="Desligado: envia a Mensagem de Despedida Padrão. Ligado: envia o texto abaixo; se ele ficar vazio, volta para a padrão."
                        checked={settings.silenceCloseCustom}
                        onChange={(value) => set("silenceCloseCustom", value)}
                      />
                      <div inert={!settings.silenceCloseCustom} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${settings.silenceCloseCustom ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                        <div className="min-h-0 overflow-hidden">
                          <div className="ml-1 mt-3 border-l-2 border-[#C4D600] pl-3">
                            <MessageField id="menu-silence-close" label="Mensagem de encerramento por inatividade" rows={2} value={settings.silenceCloseText} onChange={(value) => set("silenceCloseText", value)} placeholder="Seu atendimento foi encerrado por falta de retorno. Caso precise, mande um oi novamente." variables={CUSTOMER_VARIABLES} hint="Vazio: a despedida padrão é enviada." />
                          </div>
                        </div>
                      </div>
                      {!settings.silenceCloseCustom && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                          <p className={labelClass}>O cliente recebe</p>
                          <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{settings.farewellText.trim() || "Nenhuma mensagem: a despedida padrão está desligada."}</p>
                          <button type="button" onClick={() => setSection("closing")} className="mt-1 cursor-pointer text-xs font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">Editar em Encerramento e fila</button>
                        </div>
                      )}
                    </div>
                  </TimelineStep>
                </ol>
              )}
            </SettingCard>
          )}

          {section === "closing" && (
            <>
              <SettingCard
                icon={Hand}
                title="Mensagem de Despedida Padrão"
                description="Enviada ao finalizar o atendimento, seja manualmente pelo atendente ou ao concluir a fila."
                tip="Só é enviada com a janela de 24h aberta. Também vale para o silêncio do cliente, salvo mensagem própria. Opções de menu que encerram usam o texto da opção."
                action={<Switch checked={settings.farewellText.trim().length > 0} onChange={(value) => set("farewellText", value ? DEFAULT_CHAT_SETTINGS.farewellText : "")} label="Enviar despedida" />}
              >
                {settings.farewellText.trim().length > 0 && <MessageField id="menu-farewell" label="Texto da mensagem" rows={3} value={settings.farewellText} onChange={(value) => set("farewellText", value)} variables={CUSTOMER_VARIABLES} />}
              </SettingCard>

              <SettingCard
                icon={Star}
                title="Pesquisa de Satisfação (NPS)"
                description="Enviada logo depois da despedida quando um atendente encerra a conversa."
                tip="Só sai com a janela de 24h aberta. Conversas encerradas por silêncio no menu não recebem a pesquisa, porque ninguém da equipe falou com o cliente."
                action={<Switch checked={settings.npsEnabled} onChange={(value) => set("npsEnabled", value)} label="Enviar pesquisa de satisfação" />}
              >
                {settings.npsEnabled && (
                  <>
                    <MessageField id="menu-nps-prompt" label="Pergunta" rows={2} value={settings.npsPromptText} onChange={(value) => set("npsPromptText", value)} placeholder={DEFAULT_CHAT_SETTINGS.npsPromptText} hint="Vazia: usa a pergunta padrão." />
                    <MessageField id="menu-nps-thanks" label="Agradecimento após a nota" rows={2} value={settings.npsThanksText} onChange={(value) => set("npsThanksText", value)} hint="Vazio: a nota é gravada sem mensagem de volta." />
                    <div>
                      <p className={labelClass}>Escala de notas</p>
                      <ul className="flex flex-wrap gap-1.5" aria-label="Escala de notas">
                        {NPS_SCORE_LABELS.map((label, index) => (
                          <li key={label} className={`rounded-full border px-2 py-0.5 text-[11px] ${index >= 3 ? "border-[#C4D600] bg-[#C4D600]/10 text-slate-700 dark:text-slate-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{npsScoreLine(label, index)}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
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
      )}

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
