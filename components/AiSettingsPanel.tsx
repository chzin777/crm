"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRightLeft, Bot, BookOpenText, CheckCircle2, Coins, FlaskConical, PlugZap, Plus, RefreshCw, RotateCcw, Save, Send, Trash2, UserRoundCheck, Wallet, XCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { AI_TONES, DEFAULT_AI_SETTINGS, type AiSettings } from "@/lib/ai/settings";
import type { AiUsageReport } from "@/lib/ai/store";

type Queue = { id: string; name: string };
type Tab = "identidade" | "atuacao" | "conexao" | "consumo" | "teste";
type PlaygroundMessage = { from: "customer" | "ai"; text: string; note?: string };
type PlaygroundResult = { action: "reply" | "handoff" | "resolved"; reply: string; reason: string; queue: string; byKeyword: boolean };

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: "identidade", label: "Identidade e comportamento", icon: BookOpenText },
  { id: "atuacao", label: "Atuação e transbordo", icon: UserRoundCheck },
  { id: "conexao", label: "Conexão e parâmetros", icon: PlugZap },
  { id: "consumo", label: "Consumo e créditos", icon: Wallet },
  { id: "teste", label: "Testar a IA", icon: FlaskConical },
];

const input = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#C4D600]";
const area = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#C4D600]";
const labelCls = "block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300";
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const usd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const int = (value: number) => value.toLocaleString("pt-BR");

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-[10px] text-slate-400">{description}</span>}
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
        <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-[#C4D600] peer-focus-visible:ring-2 peer-focus-visible:ring-[#002187] dark:bg-slate-600" />
        <span className="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div>
        <p className="text-xs font-bold text-slate-800 dark:text-white">{title}</p>
        {hint && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, detail, tone = "default" }: { label: string; value: string; detail?: string; tone?: "default" | "warn" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "warn" ? "border-[#F7915E]/60 bg-[#F7915E]/10" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-[#051647] dark:text-white">{value}</p>
      {detail && <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{detail}</p>}
    </div>
  );
}

/** Teste da IA: conversa simulada com os parâmetros da tela, sem enviar nada a clientes. */
function Playground({ settings }: { settings: AiSettings }) {
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...messages, { from: "customer" as const, text }];
    setMessages(next);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/playground", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings, messages: next.map(({ from, text: body }) => ({ from, text: body })) }) });
      const data = (await response.json()) as PlaygroundResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível testar a IA.");
      const note = data.action === "handoff"
        ? `Transferiria para uma pessoa${data.queue ? ` (fila ${data.queue})` : ""}: ${data.reason || "sem motivo"}`
        : data.action === "resolved" ? `Encerraria o atendimento: ${data.reason || "resolvido"}` : "";
      setMessages([...next, { from: "ai", text: data.reply || "(transfere sem mensagem)", note }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível testar a IA.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block title="Conversa de teste" hint="Escreva como se fosse o cliente. A IA responde com os parâmetros desta tela, mesmo os ainda não salvos, e com as mesmas lojas, horários e assuntos do atendimento real. Nada é enviado pelo WhatsApp; cada teste conta no consumo.">
      <div className="h-80 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3 dark:bg-white/5">
        {messages.length === 0 && <p className="pt-24 text-center text-[11px] text-slate-400">Ex.: “Oi, vocês fazem exame de vista? Qual loja abre sábado?”</p>}
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.from === "customer" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] space-y-1 rounded-xl px-3 py-2 text-xs leading-relaxed ${message.from === "customer" ? "bg-[#002187] text-white" : "border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"}`}>
              {message.from === "ai" && <p className="text-[10px] font-bold text-[#002187] dark:text-[#C4D600]">{settings.agentName}</p>}
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.note && <p className="flex items-start gap-1 rounded-md bg-[#F7915E]/15 px-2 py-1 text-[10px] font-semibold text-[#9a4a1c] dark:text-[#F7915E]"><ArrowRightLeft className="mt-0.5 h-3 w-3 shrink-0" />{message.note}</p>}
            </div>
          </div>
        ))}
        {busy && <p className="text-[11px] text-slate-400">A IA está pensando...</p>}
        <div ref={endRef} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        <input aria-label="Mensagem do cliente" value={draft} placeholder="Mensagem do cliente e Enter" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void send(); } }} className={input} />
        <button type="button" disabled={busy || !draft.trim()} onClick={() => void send()} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#002187] px-3 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-3.5 w-3.5" />Enviar</button>
        <button type="button" disabled={busy || messages.length === 0} onClick={() => { setMessages([]); setError(""); }} title="Começar outra conversa" className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"><RotateCcw className="h-3.5 w-3.5" />Limpar</button>
      </div>
    </Block>
  );
}

/** Página Inteligência Artificial (/ia): parâmetros definidos pelo administrador, consumo e teste. */
export function AiSettingsPanel() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("identidade");
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [queues, setQueues] = useState<Queue[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<AiUsageReport | null>(null);
  const [usageError, setUsageError] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/ai/settings")
      .then(async (response) => {
        const data = (await response.json()) as { settings?: AiSettings; queues?: Queue[]; configured?: boolean; error?: string };
        if (!active) return;
        if (!response.ok || !data.settings) throw new Error(data.error ?? "Não foi possível carregar as configurações da IA.");
        setSettings(data.settings);
        setSaved(JSON.stringify(data.settings));
        setQueues(data.queues ?? []);
        setConfigured(data.configured !== false);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as configurações da IA."); });
    return () => { active = false; };
  }, []);

  const loadUsage = useCallback(async () => {
    setUsageError("");
    try {
      const response = await fetch("/api/ai/usage");
      const data = (await response.json()) as AiUsageReport & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o consumo.");
      setUsage(data);
    } catch (cause) {
      setUsageError(cause instanceof Error ? cause.message : "Não foi possível carregar o consumo.");
    }
  }, []);

  // Consumo e Conexão mostram o status da conta (créditos); carrega na primeira abertura.
  useEffect(() => {
    if ((tab !== "consumo" && tab !== "conexao") || usage) return;
    let active = true;
    fetch("/api/ai/usage")
      .then(async (response) => {
        const data = (await response.json()) as AiUsageReport & { error?: string };
        if (!active) return;
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o consumo.");
        setUsage(data);
      })
      .catch((cause: unknown) => { if (active) setUsageError(cause instanceof Error ? cause.message : "Não foi possível carregar o consumo."); });
    return () => { active = false; };
  }, [tab, usage]);

  if (error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>;
  if (!settings) return <div className="flex justify-center py-8"><LoadingSpinner label="Carregando configurações da IA..." size={32} /></div>;

  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => setSettings((current) => (current ? { ...current, [key]: value } : current));
  const dirty = JSON.stringify(settings) !== saved;

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/ai/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
      const data = (await response.json()) as { settings?: AiSettings; error?: string };
      if (!response.ok || !data.settings) throw new Error(data.error ?? "Não foi possível salvar.");
      setSettings(data.settings);
      setSaved(JSON.stringify(data.settings));
      setUsage(null);
      toast.success("IA atualizada", data.settings.autonomousEnabled ? "O atendimento autônomo segue os novos parâmetros." : "Parâmetros salvos.");
    } catch (cause) {
      toast.error("Erro ao salvar a IA", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const toggleQueue = (id: string) => set("queueIds", settings.queueIds.includes(id) ? settings.queueIds.filter((item) => item !== id) : [...settings.queueIds, id]);
  const toggleDay = (day: number) => {
    const has = settings.schedule.some((slot) => slot.day === day);
    const first = settings.schedule[0];
    set("schedule", has ? settings.schedule.filter((slot) => slot.day !== day) : [...settings.schedule, { day, start: first?.start ?? "18:00", end: first?.end ?? "23:59" }].sort((a, b) => a.day - b.day));
  };
  const setSlotTime = (day: number, field: "start" | "end", value: string) => set("schedule", settings.schedule.map((slot) => (slot.day === day ? { ...slot, [field]: value } : slot)));
  const updateTopic = (index: number, patch: Partial<AiSettings["topics"][number]>) => set("topics", settings.topics.map((topic, position) => (position === index ? { ...topic, ...patch } : topic)));
  const addKeyword = () => {
    const value = keywordDraft.trim();
    if (value && !settings.handoffKeywords.includes(value)) set("handoffKeywords", [...settings.handoffKeywords, value]);
    setKeywordDraft("");
  };

  return (
    <div className="space-y-4">
      {!configured && (
        <p className="flex items-start gap-2 rounded-lg border border-[#F7915E]/60 bg-[#F7915E]/10 px-3 py-2 text-xs text-[#9a4a1c] dark:text-[#F7915E]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A chave da OpenAI não está configurada no servidor: a IA fica desligada até ela ser definida.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${settings.autonomousEnabled ? "bg-[#C4D600] text-[#051647]" : "bg-slate-100 text-slate-400 dark:bg-white/10"}`}><Bot className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-white">{settings.agentName}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{settings.autonomousEnabled ? "Atendimento autônomo ligado" : "Atendimento autônomo desligado: só o copiloto do atendente funciona"}</p>
          </div>
        </div>
        <div className="w-56"><Toggle label="Atendimento autônomo" checked={settings.autonomousEnabled} onChange={(value) => set("autonomousEnabled", value)} /></div>
      </div>

      <div role="tablist" aria-label="Seções da IA" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === item.id ? "bg-white text-[#051647] shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}>
              <Icon className="h-3.5 w-3.5" />{item.label}
            </button>
          );
        })}
      </div>

      {tab === "identidade" && (
        <div className="space-y-4">
          <Block title="Identidade" hint="Como a IA se apresenta e fala com o cliente.">
            <label className={labelCls}>Nome com que a IA se apresenta
              <input value={settings.agentName} onChange={(event) => set("agentName", event.target.value)} className={input} maxLength={60} />
            </label>
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Tom de voz</p>
              <div className="grid gap-2 sm:grid-cols-4">
                {AI_TONES.map((tone) => (
                  <label key={tone.id} className={`cursor-pointer rounded-lg border p-3 text-xs transition ${settings.tone === tone.id ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-white/5" : "border-slate-200 dark:border-slate-700"}`}>
                    <input type="radio" name="ai-tone" className="sr-only" checked={settings.tone === tone.id} onChange={() => set("tone", tone.id)} />
                    <span className="block font-semibold text-slate-800 dark:text-white">{tone.label}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">{tone.hint}</span>
                  </label>
                ))}
              </div>
            </div>
          </Block>

          <Block title="Fontes automáticas" hint="Dados que o sistema já tem e a IA pode usar nas respostas.">
            <Toggle label="Lojas e endereços" description="Usa o cadastro de Lojas (lojas ativas)." checked={settings.useStores} onChange={(value) => set("useStores", value)} />
            <Toggle label="Horário de atendimento" description="Usa os horários cadastrados em Filas › Horário de atendimento." checked={settings.useOperatingHours} onChange={(value) => set("useOperatingHours", value)} />
            <Toggle label="Pedidos do próprio cliente" description="Pode informar data, loja e situação dos pedidos do cliente no ERP." checked={settings.useCustomerOrders} onChange={(value) => set("useCustomerOrders", value)} />
            <Toggle label="Pode citar preços" description="Usa o preço médio dos mais vendidos como referência “a partir de”. Desligado, a IA diz que a loja passa o orçamento." checked={settings.canQuotePrices} onChange={(value) => set("canQuotePrices", value)} />
          </Block>

          <Block title="Base de conhecimento da ótica" hint="Escreva o que a IA deve dizer sobre cada assunto (lentes, armações, exame de vista, prazos...). Assunto desligado ou fora da lista vira transferência para uma pessoa.">
            <div className="space-y-3">
              {settings.topics.map((topic, index) => (
                <div key={topic.id} className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                  <div className="flex items-center gap-2">
                    <input aria-label="Título do assunto" value={topic.title} onChange={(event) => updateTopic(index, { title: event.target.value })} className={`${input} flex-1 font-semibold`} />
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={topic.enabled} onChange={(event) => updateTopic(index, { enabled: event.target.checked })} className="h-4 w-4 cursor-pointer accent-[#002187]" />Ativo
                    </label>
                    <button type="button" aria-label={`Remover ${topic.title}`} title="Remover assunto" onClick={() => set("topics", settings.topics.filter((_, position) => position !== index))} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <textarea aria-label={`Resposta sobre ${topic.title}`} rows={3} value={topic.content} onChange={(event) => updateTopic(index, { content: event.target.value })} className={area} />
                </div>
              ))}
              <button type="button" onClick={() => set("topics", [...settings.topics, { id: `topico-${Date.now()}`, title: "Novo assunto", enabled: true, content: "" }])} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#002187]/40 px-3 py-2 text-xs font-semibold text-[#002187] hover:bg-[#002187]/5 dark:border-[#C4D600]/40 dark:text-[#C4D600]">
                <Plus className="h-3.5 w-3.5" />Adicionar assunto
              </button>
            </div>
          </Block>

          <Block title="Instruções e restrições" hint="Regras de comportamento que valem para todas as respostas (ex.: o que nunca prometer).">
            <textarea aria-label="Instruções adicionais" rows={5} value={settings.extraInstructions} onChange={(event) => set("extraInstructions", event.target.value)} className={area} />
          </Block>
        </div>
      )}

      {tab === "atuacao" && (
        <div className="space-y-4">
          <Block title="Onde a IA atende" hint="A IA só responde conversas sem atendente. Assim que alguém assume, ela para.">
            <Toggle label="Na entrada, no lugar do menu automático" description="Toda conversa nova é recebida pela IA, que resolve ou transfere para a fila certa." checked={settings.attendAtEntry} onChange={(value) => set("attendAtEntry", value)} />
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Nas filas (clientes aguardando)</p>
              <p className="mb-2 text-[10px] text-slate-400">A IA conversa com quem está na fila enquanto ninguém assume.</p>
              {queues.length === 0 ? <p className="text-[11px] text-slate-400">Nenhuma fila cadastrada.</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {queues.map((queue) => {
                    const on = settings.queueIds.includes(queue.id);
                    return (
                      <button key={queue.id} type="button" aria-pressed={on} onClick={() => toggleQueue(queue.id)} className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] font-semibold transition ${on ? "border-[#C4D600] bg-[#C4D600] text-[#051647]" : "border-slate-200 text-slate-600 hover:border-[#002187] dark:border-slate-700 dark:text-slate-300"}`}>
                        {queue.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Block>

          <Block title="Quando a IA atende" hint="Horário de Brasília.">
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { id: "off_hours", label: "Fora do horário de atendimento", hint: "Usa o horário cadastrado em Filas." },
                { id: "always", label: "Sempre", hint: "24 horas, todos os dias." },
                { id: "custom", label: "Horários próprios", hint: "Dias e faixas definidos aqui." },
              ] as const).map((option) => (
                <label key={option.id} className={`cursor-pointer rounded-lg border p-3 text-xs transition ${settings.scheduleMode === option.id ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-white/5" : "border-slate-200 dark:border-slate-700"}`}>
                  <input type="radio" name="ai-schedule" className="sr-only" checked={settings.scheduleMode === option.id} onChange={() => set("scheduleMode", option.id)} />
                  <span className="block font-semibold text-slate-800 dark:text-white">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">{option.hint}</span>
                </label>
              ))}
            </div>
            {settings.scheduleMode === "custom" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((label, day) => {
                    const on = settings.schedule.some((slot) => slot.day === day);
                    return <button key={label} type="button" aria-pressed={on} onClick={() => toggleDay(day)} className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${on ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{label}</button>;
                  })}
                </div>
                {settings.schedule.map((slot) => (
                  <div key={slot.day} className="flex items-center gap-2 text-xs">
                    <span className="w-10 font-semibold text-slate-700 dark:text-slate-200">{WEEKDAYS[slot.day]}</span>
                    <input type="time" aria-label={`Início ${WEEKDAYS[slot.day]}`} value={slot.start} onChange={(event) => setSlotTime(slot.day, "start", event.target.value)} className={`${input} w-28`} />
                    <span className="text-slate-400">às</span>
                    <input type="time" aria-label={`Fim ${WEEKDAYS[slot.day]}`} value={slot.end} onChange={(event) => setSlotTime(slot.day, "end", event.target.value)} className={`${input} w-28`} />
                  </div>
                ))}
              </div>
            )}
          </Block>

          <Block title="A IA passa para uma pessoa quando" hint="Na transferência, a conversa vai para Aguardando com o motivo registrado no histórico.">
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">O cliente usar estas palavras</p>
              <p className="mb-2 text-[10px] text-slate-400">Transfere na hora, sem consultar a IA.</p>
              <div className="flex flex-wrap gap-1.5">
                {settings.handoffKeywords.map((keyword) => (
                  <span key={keyword} className="inline-flex items-center gap-1 rounded-full bg-[#051647]/5 px-2.5 py-1 text-[11px] font-medium text-[#002187] dark:bg-white/10 dark:text-[#C4D600]">
                    {keyword}
                    <button type="button" aria-label={`Remover ${keyword}`} onClick={() => set("handoffKeywords", settings.handoffKeywords.filter((item) => item !== keyword))} className="cursor-pointer text-slate-400 hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={keywordDraft} placeholder="Nova palavra e Enter (ex.: receita, orçamento)" onChange={(event) => setKeywordDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addKeyword(); } }} className={`${input} max-w-xs`} />
                <button type="button" onClick={addKeyword} className="cursor-pointer rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">Adicionar</button>
              </div>
            </div>
            <Toggle label="Reclamação ou cliente irritado" checked={settings.handoffOnComplaint} onChange={(value) => set("handoffOnComplaint", value)} />
            <Toggle label="Intenção de compra ou orçamento" description="Fechar compra, orçamento com receita ou negociar condições." checked={settings.handoffOnPurchaseIntent} onChange={(value) => set("handoffOnPurchaseIntent", value)} />
            <Toggle label="A IA não tiver certeza da resposta" description="Assunto fora do que está cadastrado." checked={settings.handoffWhenUnsure} onChange={(value) => set("handoffWhenUnsure", value)} />
            <Toggle label="O cliente enviar foto, documento ou áudio" description="Ex.: foto da receita médica. A IA não lê arquivos: transfere na hora." checked={settings.handoffOnMedia} onChange={(value) => set("handoffOnMedia", value)} />
            <label className={labelCls}>Máximo de respostas da IA por conversa
              <input type="number" min={1} max={50} value={settings.maxAiReplies} onChange={(event) => set("maxAiReplies", Number(event.target.value))} className={`${input} w-28`} />
            </label>
          </Block>

          <Block title="Para onde vai" hint="Fila que recebe a conversa transferida.">
            <label className={labelCls}>Fila de destino
              <select value={settings.handoffQueueId} onChange={(event) => set("handoffQueueId", event.target.value)} className={`${input} cursor-pointer`}>
                <option value="">Manter a fila atual da conversa</option>
                {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
              </select>
            </label>
            {!settings.handoffQueueId && <Toggle label="A IA escolhe a fila pelo assunto" description="Ex.: dúvida de pagamento vai para Financeiro." checked={settings.aiChoosesQueue} onChange={(value) => set("aiChoosesQueue", value)} />}
            <label className={labelCls}>Mensagem ao transferir
              <textarea rows={2} value={settings.handoffMessage} onChange={(event) => set("handoffMessage", event.target.value)} className={area} />
              <span className="block text-[10px] font-normal text-slate-400">Vazia: transfere sem avisar o cliente. Aceita {"{cliente}"} e {"{fila}"}.</span>
            </label>
          </Block>

          <Block title="Quando a IA resolve sozinha">
            <Toggle label="Encerrar quando o cliente confirmar que foi resolvido" description="A IA se despede e encerra a conversa, sem pesquisa de satisfação." checked={settings.closeWhenResolved} onChange={(value) => set("closeWhenResolved", value)} />
          </Block>
        </div>
      )}

      {tab === "conexao" && (
        <div className="space-y-4">
          <Block title="Conexão" hint="A chave da API fica só no servidor (arquivo .env) e nunca aparece na tela.">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Provedor</p>
                <p className="mt-1 text-sm font-bold text-[#051647] dark:text-white">OpenAI</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Chave da API</p>
                <p className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${configured ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
                  {configured ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{configured ? "Configurada" : "Não configurada"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Créditos</p>
                {!usage ? <p className="mt-1 text-xs text-slate-400">{usageError || "Verificando..."}</p> : usage.status.creditExhausted
                  ? <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#c2410c] dark:text-[#F7915E]"><AlertTriangle className="h-4 w-4" />Sem créditos</p>
                  : <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />{usage.credit.remainingBrl === null ? "Sem alerta" : brl(usage.credit.remainingBrl)}</p>}
              </div>
            </div>
          </Block>

          <Block title="Modelo e criatividade">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>Modelo
                <input value={settings.model} onChange={(event) => set("model", event.target.value)} className={input} />
                <span className="block text-[10px] font-normal text-slate-400">Nome exato do modelo na OpenAI (ex.: gpt-5.4-mini).</span>
              </label>
              <div className="space-y-1.5">
                <Toggle label="Usar a criatividade padrão do modelo" description="Recomendado. Alguns modelos só aceitam o padrão." checked={settings.temperature === null} onChange={(value) => set("temperature", value ? null : 0.4)} />
                {settings.temperature !== null && (
                  <label className={labelCls}>Criatividade: {settings.temperature.toFixed(1)} {settings.temperature <= 0.3 ? "(mais previsível)" : settings.temperature >= 0.8 ? "(mais variada)" : "(equilibrada)"}
                    <input type="range" min={0} max={1} step={0.1} value={settings.temperature} onChange={(event) => set("temperature", Number(event.target.value))} className="w-full cursor-pointer accent-[#002187] dark:accent-[#C4D600]" />
                  </label>
                )}
              </div>
            </div>
          </Block>

          <Block title="Preços do modelo" hint="Usados para converter os tokens em R$ no consumo.">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>US$ por 1 milhão de tokens de entrada
                <input type="number" min={0} step="0.01" value={settings.priceInputPerMillionUsd} onChange={(event) => set("priceInputPerMillionUsd", Number(event.target.value))} className={input} />
              </label>
              <label className={labelCls}>US$ por 1 milhão de tokens de saída
                <input type="number" min={0} step="0.01" value={settings.priceOutputPerMillionUsd} onChange={(event) => set("priceOutputPerMillionUsd", Number(event.target.value))} className={input} />
              </label>
              <label className={labelCls}>Cotação do dólar (R$)
                <input type="number" min={0.01} step="0.01" value={settings.usdToBrl} onChange={(event) => set("usdToBrl", Number(event.target.value))} className={input} />
              </label>
            </div>
            <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><Coins className="h-3 w-3" />Confira os preços do modelo em platform.openai.com/docs/pricing.</p>
          </Block>
        </div>
      )}

      {tab === "consumo" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Gastos registrados pelo CRM a cada uso da IA, convertidos em R$ pela cotação de Conexão e parâmetros.</p>
            <button type="button" onClick={() => void loadUsage()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"><RefreshCw className="h-3.5 w-3.5" />Atualizar</button>
          </div>
          {usageError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">{usageError}</p>}
          {!usage ? <div className="flex justify-center py-6"><LoadingSpinner label="Carregando consumo..." size={28} /></div> : (
            <>
              {usage.status.creditExhausted && (
                <p className="flex items-start gap-2 rounded-lg border border-[#F7915E]/60 bg-[#F7915E]/10 px-3 py-2 text-xs text-[#9a4a1c] dark:text-[#F7915E]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A OpenAI recusou o último pedido por falta de créditos. A IA fica parada até a recarga.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Crédito disponível" value={usage.credit.remainingBrl === null ? "—" : brl(usage.credit.remainingBrl)} detail={usage.credit.remainingUsd === null ? "Informe o crédito carregado abaixo" : `${usd(usage.credit.remainingUsd)} de ${usd(usage.credit.loadedUsd)} carregados`} tone={usage.credit.remainingUsd !== null && usage.credit.remainingUsd < usage.credit.loadedUsd * 0.1 ? "warn" : "default"} />
                <Stat label="Gasto hoje" value={brl(usage.today.costBrl)} detail={`${int(usage.today.inputTokens + usage.today.outputTokens)} tokens · ${int(usage.today.calls)} usos`} />
                <Stat label="Gasto no mês" value={brl(usage.month.costBrl)} detail={`${int(usage.month.inputTokens + usage.month.outputTokens)} tokens${usage.monthlyBudgetBrl > 0 ? ` · ${Math.round((usage.month.costBrl / usage.monthlyBudgetBrl) * 100)}% do orçamento` : ""}`} tone={usage.monthlyBudgetBrl > 0 && usage.month.costBrl >= usage.monthlyBudgetBrl ? "warn" : "default"} />
                <Stat label="Total desde o início" value={brl(usage.allTime.costBrl)} detail={`${int(usage.allTime.inputTokens)} de entrada · ${int(usage.allTime.outputTokens)} de saída`} />
              </div>

              <Block title="Gasto por função no mês">
                {usage.byFeature.length === 0 ? <p className="text-[11px] text-slate-400">Nenhum uso registrado neste mês.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-left text-xs">
                      <thead className="text-[10px] uppercase text-slate-500"><tr><th className="py-1.5">Função</th><th className="py-1.5 text-right">Usos</th><th className="py-1.5 text-right">Tokens entrada</th><th className="py-1.5 text-right">Tokens saída</th><th className="py-1.5 text-right">Gasto</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {usage.byFeature.map((row) => (
                          <tr key={row.feature}><td className="py-1.5 font-medium text-slate-800 dark:text-slate-100">{row.label}</td><td className="py-1.5 text-right tabular-nums">{int(row.calls)}</td><td className="py-1.5 text-right tabular-nums">{int(row.inputTokens)}</td><td className="py-1.5 text-right tabular-nums">{int(row.outputTokens)}</td><td className="py-1.5 text-right font-semibold tabular-nums">{brl(row.costBrl)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Block>

              <Block title="Últimos 30 dias">
                {usage.daily.length === 0 ? <p className="text-[11px] text-slate-400">Sem uso nos últimos 30 dias.</p> : (
                  <div className="flex h-28 items-end gap-1" role="img" aria-label="Gasto diário da IA nos últimos 30 dias">
                    {usage.daily.map((row) => {
                      const max = Math.max(...usage.daily.map((item) => item.costBrl), 0.01);
                      return <div key={row.day} title={`${row.day.split("-").reverse().join("/")}: ${brl(row.costBrl)} · ${int(row.tokens)} tokens`} className="min-w-[6px] flex-1 rounded-t bg-[#002187] dark:bg-[#C4D600]" style={{ height: `${Math.max(4, (row.costBrl / max) * 100)}%` }} />;
                    })}
                  </div>
                )}
              </Block>
            </>
          )}

          <Block title="Créditos e orçamento" hint="A OpenAI não informa o saldo pela chave do projeto: informe o valor carregado e a data, e o CRM desconta o que foi gasto desde então.">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>Crédito carregado (US$)
                <input type="number" min={0} step="0.01" value={settings.creditLoadedUsd} onChange={(event) => set("creditLoadedUsd", Number(event.target.value))} className={input} />
              </label>
              <label className={labelCls}>Data da recarga
                <input type="date" value={settings.creditLoadedAt} onChange={(event) => set("creditLoadedAt", event.target.value)} className={input} />
              </label>
              <label className={labelCls}>Orçamento mensal (R$)
                <input type="number" min={0} step="1" value={settings.monthlyBudgetBrl} onChange={(event) => set("monthlyBudgetBrl", Number(event.target.value))} className={input} />
              </label>
            </div>
          </Block>
        </div>
      )}

      {tab === "teste" && <Playground settings={settings} />}

      <div className="sticky bottom-0 flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-[#051647]/95">
        {dirty && <span className="text-[11px] text-slate-500 dark:text-slate-300">Alterações da IA não salvas</span>}
        <button type="button" disabled={!dirty} onClick={() => setSettings(JSON.parse(saved) as AiSettings)} className="h-9 cursor-pointer rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10">Descartar</button>
        <button type="button" onClick={() => setSettings({ ...DEFAULT_AI_SETTINGS, creditLoadedUsd: settings.creditLoadedUsd, creditLoadedAt: settings.creditLoadedAt })} className="h-9 cursor-pointer rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">Restaurar padrões</button>
        <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#C4D600] px-4 text-xs font-bold text-[#051647] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
          <Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar IA"}
        </button>
      </div>
    </div>
  );
}
