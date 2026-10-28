"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCircle2, Clock3, ExternalLink, FileText, Image as ImageIcon, Phone, Plus, RefreshCw, Reply, Search, Send, X, XCircle } from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";
import Stepper, { Step } from "@/components/Stepper";

type TemplateButton = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string };
type ButtonDraft = { type: TemplateButton["type"]; text: string; value: string };

type Template = {
  buttons?: TemplateButton[];
  headerImageUrl?: string | null;
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  body: string;
  footer: string;
  headerFormat: string | null;
  headerText: string;
  rejectedReason?: string;
};

type Filter = "Todos" | "Aprovados" | "Em análise" | "Rejeitados";

const STATUS_LABEL: Record<string, string> = { APPROVED: "Aprovado", PENDING: "Em análise", REJECTED: "Rejeitado", PAUSED: "Pausado", DISABLED: "Desativado" };
const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-[#C4D600]/25 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]",
  PENDING: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
};
const CATEGORY_LABEL: Record<string, string> = { UTILITY: "Utilidade", MARKETING: "Marketing", AUTHENTICATION: "Autenticação" };

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const labelClass = "block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300";
const primaryButton = "inline-flex h-9 items-center gap-2 rounded-lg bg-[#051647] px-3.5 text-xs font-bold text-white shadow-sm hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer";
const ghostButton = "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer";

function variableCount(body: string) {
  return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
}

function maxVariable(body: string) {
  return Math.max(0, ...Array.from(body.matchAll(/\{\{(\d+)\}\}/g), (match) => Number(match[1])));
}

// Valores de exemplo exigidos pela Meta na análise; não são enviados aos clientes.
const VARIABLE_PRESETS = [
  { label: "Nome do cliente", example: "Maria" },
  { label: "Loja", example: "Óticas Brasil Centro" },
  { label: "Data", example: "25/10/2026" },
  { label: "Valor", example: "R$ 150,00" },
  { label: "Código", example: "12345" },
];

function StepHeading({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

function fillVariables(text: string, values: string[]) {
  return text.replace(/\{\{(\d+)\}\}/g, (match, index: string) => values[Number(index) - 1]?.trim() || match);
}

function WhatsAppBubble({ image, body, footer, values = [], buttons = [] }: { image?: string | null; body: string; footer?: string; values?: string[]; buttons?: { type: string; text: string }[] }) {
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]" aria-label="Prévia da mensagem">
      <div className="w-fit max-w-[92%]">
      <div className="rounded-lg rounded-tl-none bg-white p-1 text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
        {image === "" && (
          <div className="grid h-28 w-60 max-w-full place-items-center rounded-md bg-slate-200 text-slate-400 dark:bg-slate-700"><ImageIcon className="h-7 w-7" /></div>
        )}
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="Imagem do cabeçalho" className="max-h-44 w-full rounded-md object-cover" />
        )}
        <p className="whitespace-pre-wrap break-words px-1.5 pt-1 text-[13px] leading-snug">{fillVariables(body, values) || <span className="text-[#667781]">O texto do modelo aparece aqui.</span>}</p>
        {footer && <p className="px-1.5 pt-1 text-[11px] text-[#667781] dark:text-[#8696a0]">{footer}</p>}
        <p className="px-1.5 pb-0.5 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">{time}</p>
      </div>
      {buttons.map((button, index) => (
        <div key={index} className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-[#00a5f4] shadow-sm dark:bg-[#202c33]">
          {button.type === "URL" && <ExternalLink className="h-3.5 w-3.5" />}
          {button.type === "PHONE_NUMBER" && <Phone className="h-3.5 w-3.5" />}
          {button.type === "QUICK_REPLY" && <Reply className="h-3.5 w-3.5" />}
          <span className="truncate">{button.text || "Botão"}</span>
        </div>
      ))}
      </div>
    </div>
  );
}

export default function ModelosPage() {
  const { isDark } = useCrmTheme();
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("Todos");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [examples, setExamples] = useState<string[]>([]);
  const [headerImage, setHeaderImage] = useState<File | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const createImageRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [sendTarget, setSendTarget] = useState<Template | null>(null);
  const [phone, setPhone] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [sendImage, setSendImage] = useState<File | null>(null);
  const [sendPreview, setSendPreview] = useState<string | null>(null);
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const sendImageRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/whatsapp/templates", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as { data?: Template[]; error?: string };
      if (!response.ok) setError(result.error ?? "Não foi possível carregar os modelos.");
      else setTemplates(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!headerImage) return setHeaderPreview(null);
    const url = URL.createObjectURL(headerImage);
    setHeaderPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [headerImage]);

  useEffect(() => {
    if (!sendImage) return setSendPreview(null);
    const url = URL.createObjectURL(sendImage);
    setSendPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [sendImage]);

  const metrics = useMemo(() => {
    const count = (status: string) => templates.filter((template) => template.status === status).length;
    return [
      { label: "Modelos", filter: "Todos" as Filter, value: templates.length, detail: "cadastrados na conta", icon: FileText, color: "bg-[#051647]/10 text-[#051647] dark:bg-white/10 dark:text-white" },
      { label: "Aprovados", filter: "Aprovados" as Filter, value: count("APPROVED"), detail: "prontos para envio", icon: CheckCircle2, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
      { label: "Em análise", filter: "Em análise" as Filter, value: count("PENDING"), detail: "aguardando a Meta", icon: Clock3, color: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]" },
      { label: "Rejeitados", filter: "Rejeitados" as Filter, value: count("REJECTED"), detail: "precisam de ajustes", icon: XCircle, color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
    ];
  }, [templates]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (filter === "Aprovados" && template.status !== "APPROVED") return false;
      if (filter === "Em análise" && template.status !== "PENDING") return false;
      if (filter === "Rejeitados" && template.status !== "REJECTED") return false;
      return !term || template.name.toLowerCase().includes(term) || template.body.toLowerCase().includes(term);
    });
  }, [templates, search, filter]);

  const bodyVariables = variableCount(body);
  const sampleValues = Array.from({ length: maxVariable(body) }, (_, index) => examples[index]?.trim() || "Exemplo");

  const insertVariable = (preset: (typeof VARIABLE_PRESETS)[number]) => {
    const number = maxVariable(body) + 1;
    const token = `{{${number}}}`;
    const input = bodyRef.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
    setExamples((current) => {
      const next = [...current];
      next[number - 1] = preset.example;
      return next;
    });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const validateTemplateStep = (step: number) => {
    const fail = (message: string) => (setCreateError(message), false);
    if (step === 1 && !name.trim()) return fail("Informe o nome do modelo.");
    if (step === 2) {
      const text = body.trim();
      if (!text) return fail("Escreva o texto da mensagem.");
      if (maxVariable(text) !== variableCount(text)) return fail("As variáveis devem ser sequenciais ({{1}}, {{2}}, {{3}}...), sem pular números.");
      if (/^\{\{\d+\}\}/.test(text) || /\{\{\d+\}\}$/.test(text)) return fail("A Meta não aceita variável no início nem no fim do texto. Acrescente texto antes e depois.");
    }
    if (step === 3) {
      for (const button of buttons) {
        if (!button.text.trim()) return fail("Preencha o texto de todos os botões.");
        if (button.type === "URL" && !/^https?:\/\/\S+$/i.test(button.value.trim())) return fail(`Link inválido no botão "${button.text}". Use uma URL completa (https://...).`);
        if (button.type === "PHONE_NUMBER" && button.value.replace(/\D/g, "").length < 10) return fail(`Telefone inválido no botão "${button.text}". Inclua DDI e DDD.`);
      }
      if (buttons.filter((button) => button.type === "URL").length > 2) return fail("Use no máximo 2 botões de link.");
      if (buttons.filter((button) => button.type === "PHONE_NUMBER").length > 1) return fail("Use no máximo 1 botão de ligação.");
    }
    setCreateError("");
    return true;
  };
  const sendVariables = sendTarget ? variableCount(sendTarget.body) : 0;
  const needsImage = sendTarget?.headerFormat === "IMAGE";

  const openCreate = () => {
    setName("");
    setCategory("UTILITY");
    setBody("");
    setFooter("");
    setButtons([]);
    setHeaderImage(null);
    setCreateError("");
    setIsCreateOpen(true);
  };

  const openSend = (template: Template) => {
    setSendTarget(template);
    setPhone("");
    setParams([]);
    setSendImage(null);
    setSendError("");
  };

  const pickImage = (file: File | undefined, apply: (file: File | null) => void, setErr: (message: string) => void) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return setErr("Use uma imagem JPG ou PNG.");
    if (file.size > 5 * 1024 * 1024) return setErr("A imagem deve ter até 5 MB.");
    setErr("");
    apply(file);
  };

  const createTemplate = async () => {
    setCreating(true);
    setCreateError("");
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("category", category);
      form.set("language", "pt_BR");
      form.set("body", body);
      form.set("footer", footer);
      form.set("buttons", JSON.stringify(buttons.map((button) => ({ type: button.type, text: button.text, url: button.type === "URL" ? button.value : undefined, phone: button.type === "PHONE_NUMBER" ? button.value : undefined }))));
      form.set("examples", JSON.stringify(sampleValues));
      if (headerImage) form.set("headerImage", headerImage);
      const response = await fetch("/api/whatsapp/templates", { method: "POST", body: form });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível criar o modelo.");
      toast.success("Modelo enviado para análise", "A Meta avalia o modelo antes de liberar o uso.");
      setIsCreateOpen(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Tente novamente.");
    } finally {
      setCreating(false);
    }
  };

  const sendTemplate = async () => {
    if (!sendTarget) return;
    setSending(true);
    setSendError("");
    try {
      const form = new FormData();
      form.set("phone", phone);
      form.set("templateName", sendTarget.name);
      form.set("templateLanguage", sendTarget.language);
      form.set("templateParams", JSON.stringify(params.slice(0, sendVariables)));
      if (needsImage && sendImage) form.set("headerImage", sendImage);
      const response = await fetch("/api/whatsapp/send", { method: "POST", body: form });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar o modelo.");
      toast.success("Notificação enviada", `Modelo "${sendTarget.name}" aceito pelo WhatsApp.`);
      setSendTarget(null);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  const sendDisabled = sending || phone.replace(/\D/g, "").length < 10 || params.slice(0, sendVariables).filter((value) => value?.trim()).length < sendVariables || (needsImage && !sendImage && !sendTarget?.headerImageUrl);

  return (
    <div>
      <div>

        <main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Modelos de mensagem</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Crie modelos do WhatsApp, acompanhe a aprovação da Meta e envie notificações.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </button>
              <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#051647] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer">
                <Plus className="h-4 w-4" /> Novo modelo
              </button>
            </div>
          </div>

          <section aria-label="Resumo dos modelos" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              const active = filter === metric.filter;
              return (
                <button
                  key={metric.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(metric.filter)}
                  className={`rounded-xl border bg-white p-4 text-left shadow-xs transition-colors cursor-pointer hover:cursor-pointer dark:bg-[#07194f] ${active ? "border-[#002187] ring-1 ring-[#002187] dark:border-[#C4D600] dark:ring-[#C4D600]" : "border-slate-200 hover:border-[#002187]/40 dark:border-slate-800 dark:hover:border-[#C4D600]/40"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{metric.value}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{metric.detail}</p>
                    </div>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${metric.color}`}><Icon className="h-4 w-4" /></span>
                  </div>
                </button>
              );
            })}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Biblioteca de modelos</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filtered.length} de {templates.length} modelos</p>
                </div>
                <label className="relative block w-full lg:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar modelos" placeholder="Buscar por nome ou texto" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:focus:border-[#C4D600]" />
                </label>
              </div>
            </div>

            <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2 2xl:grid-cols-3">
              {loading && templates.length === 0 && <p className="col-span-full py-8 text-center text-xs text-slate-500">Carregando modelos...</p>}
              {!loading && filtered.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-2 py-10 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><FileText className="h-5 w-5" /></span>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum modelo encontrado</p>
                  <p className="text-xs text-slate-500">Crie um novo modelo ou ajuste a busca.</p>
                </div>
              )}
              {filtered.map((template) => (
                <article key={template.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-[#002187]/40 dark:border-slate-700 dark:hover:border-[#C4D600]/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-bold text-slate-900 dark:text-white">{template.name}</h3>
                      <p className="mt-0.5 text-[10px] text-slate-400">{CATEGORY_LABEL[template.category] ?? template.category} · {template.language}{template.headerFormat === "IMAGE" ? " · Imagem" : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[template.status] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{STATUS_LABEL[template.status] ?? template.status}</span>
                  </div>
                  <WhatsAppBubble image={template.headerFormat === "IMAGE" ? template.headerImageUrl || "" : null} body={template.body} footer={template.footer} buttons={template.buttons} />
                  {template.rejectedReason && <p className="text-[10px] text-[#9a3d12] dark:text-[#F7915E]">Motivo: {template.rejectedReason}</p>}
                  <div className="mt-auto flex justify-end">
                    <button type="button" onClick={() => openSend(template)} disabled={template.status !== "APPROVED"} className={primaryButton}>
                      <Send className="h-3.5 w-3.5" /> Enviar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      {isCreateOpen && (
        <EntityDialog titleId="create-template-title" title="Novo modelo" description="O modelo é enviado para análise da Meta antes de poder ser usado." onClose={() => setIsCreateOpen(false)} size="lg">
          <Stepper
            initialStep={1}
            onStepChange={() => setCreateError("")}
            onFinalStepCompleted={() => void createTemplate()}
            backButtonText="Voltar"
            nextButtonText="Continuar"
            completeButtonText={creating ? "Enviando..." : "Enviar para aprovação"}
            indicator="numbers"
            orientation="horizontal"
            transition="slide"
            linear={false}
            disableStepIndicators={false}
            showFooter
            theme={isDark ? "dark" : "light"}
            accentColor="#C4D600"
            frame={false}
            radius={16}
            width="100%"
            className="min-h-0 flex-1"
            validateStep={validateTemplateStep}
          >
            <Step title="Identificação" description="Nome e categoria">
              <div className="space-y-4">
                <StepHeading title="Identifique o modelo" text="O nome é usado só internamente e na Meta; o cliente nunca o vê." />
              <label className={labelClass}>
                Nome (minúsculas e underscore)
                <input value={name} onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="confirmacao_atendimento" className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Categoria
                  <select value={category} onChange={(event) => setCategory(event.target.value as "UTILITY" | "MARKETING")} className={`${inputClass} cursor-pointer`}>
                    <option value="UTILITY">Utilidade</option>
                    <option value="MARKETING">Marketing</option>
                  </select>
                </label>
                <label className={labelClass}>
                  Idioma
                  <input value="Português (BR)" disabled className={`${inputClass} opacity-70`} />
                </label>
              </div>
              {createError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{createError}</p>}
              </div>
            </Step>
            <Step title="Conteúdo" description="Texto, imagem e variáveis">
              <div className="space-y-4">
                <StepHeading title="Monte a mensagem" text="Escreva o texto e use as variáveis para personalizar com dados do cliente." />
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Imagem do cabeçalho (opcional)</span>
                <input ref={createImageRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { pickImage(event.target.files?.[0], setHeaderImage, setCreateError); event.target.value = ""; }} />
                {headerImage ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">
                    <ImageIcon className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{headerImage.name}</span>
                    <button type="button" aria-label="Remover imagem" onClick={() => setHeaderImage(null)} className="rounded p-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => createImageRef.current?.click()} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-[#002187] hover:text-[#002187] dark:border-slate-600 dark:text-slate-400 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer">
                    <ImageIcon className="h-4 w-4" /> Selecionar imagem (JPG ou PNG, até 5 MB)
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>
                  Texto da mensagem
                  <textarea ref={bodyRef} value={body} onChange={(event) => setBody(event.target.value)} maxLength={1024} placeholder="Olá, seu atendimento na Óticas Brasil foi concluído." className="h-28 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Inserir:</span>
                  {VARIABLE_PRESETS.map((preset) => (
                    <button key={preset.label} type="button" onClick={() => insertVariable(preset)} className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:border-[#002187] hover:text-[#002187] dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer">
                      <Plus className="h-3 w-3" /> {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">Cada botão adiciona uma variável ({"{{1}}"}, {"{{2}}"}...) no texto. No envio, você informa o valor real de cada uma.</p>
              </div>
              <label className={labelClass}>
                Rodapé (opcional)
                <input value={footer} onChange={(event) => setFooter(event.target.value)} maxLength={60} placeholder="Óticas Brasil" className={inputClass} />
              </label>
              {createError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{createError}</p>}
              </div>
            </Step>
            <Step title="Botões" description="Respostas e links">
              <div className="space-y-4">
                <StepHeading title="Adicione botões" text="Opcional. Permita que o cliente responda com um toque, abra um link ou ligue." />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Botões (opcional)</span>
                  <span className="text-[10px] text-slate-400">{buttons.length}/10</span>
                </div>
                {buttons.map((button, index) => (
                  <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <select value={button.type} onChange={(event) => setButtons((current) => current.map((item, i) => (i === index ? { ...item, type: event.target.value as ButtonDraft["type"], value: "" } : item)))} className={`${inputClass} cursor-pointer`} aria-label="Tipo do botão">
                        <option value="QUICK_REPLY">Resposta rápida</option>
                        <option value="URL">Abrir link</option>
                        <option value="PHONE_NUMBER">Ligar</option>
                      </select>
                      <button type="button" aria-label="Remover botão" onClick={() => setButtons((current) => current.filter((_, i) => i !== index))} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"><X className="h-4 w-4" /></button>
                    </div>
                    <input value={button.text} maxLength={25} onChange={(event) => setButtons((current) => current.map((item, i) => (i === index ? { ...item, text: event.target.value } : item)))} placeholder="Texto do botão" className={inputClass} />
                    {button.type !== "QUICK_REPLY" && (
                      <input value={button.value} onChange={(event) => setButtons((current) => current.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))} placeholder={button.type === "URL" ? "https://www.oticasbrasil.com.br" : "+5562999999999"} className={inputClass} />
                    )}
                  </div>
                ))}
                {buttons.length < 10 && (
                  <button type="button" onClick={() => setButtons((current) => [...current, { type: "QUICK_REPLY", text: "", value: "" }])} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-[#002187] hover:text-[#002187] dark:border-slate-600 dark:text-slate-400 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer">
                    <Plus className="h-3.5 w-3.5" /> Adicionar botão
                  </button>
                )}
                <p className="text-[10px] text-slate-400">Até 2 botões de link e 1 de ligação. Resposta rápida devolve o texto do botão como mensagem do cliente.</p>
              </div>
              {createError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{createError}</p>}
              </div>
            </Step>
            <Step title="Revisão" description="Confira antes de enviar">
              <div className="space-y-4">
                <StepHeading title="Revise o modelo" text="Ao enviar, a Meta analisa o modelo antes de liberar o uso." />
                <div className="grid gap-4 md:grid-cols-2">
                  <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Nome</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{name}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Categoria</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{category === "UTILITY" ? "Utilidade" : "Marketing"} · Português (BR)</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Conteúdo</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{headerImage ? "Imagem + " : ""}texto{bodyVariables > 0 ? ` com ${bodyVariables} variável(is)` : ""}{buttons.length > 0 ? ` · ${buttons.length} botão(ões)` : ""}</dd></div>
                  </dl>
                  <WhatsAppBubble image={headerPreview ?? (headerImage ? "" : null)} body={body} footer={footer} values={sampleValues} buttons={buttons} />
                </div>
                {createError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{createError}</p>}
              </div>
            </Step>
          </Stepper>
        </EntityDialog>
      )}

      {sendTarget && (
        <EntityDialog titleId="send-template-title" title="Enviar notificação" description={`Modelo ${sendTarget.name}`} onClose={() => setSendTarget(null)}>
          <div className="flex max-h-[68vh] flex-col gap-3 overflow-y-auto pr-1">
            <WhatsAppBubble image={needsImage ? sendPreview ?? sendTarget.headerImageUrl ?? "" : null} body={sendTarget.body} footer={sendTarget.footer} buttons={sendTarget.buttons} values={params} />
            <label className={labelClass}>
              Telefone de destino
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(62) 90000-0000" inputMode="tel" className={inputClass} />
            </label>
            {needsImage && (
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Imagem do cabeçalho{sendTarget?.headerImageUrl ? " (opcional: o modelo já tem uma)" : ""}</span>
                <input ref={sendImageRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { pickImage(event.target.files?.[0], setSendImage, setSendError); event.target.value = ""; }} />
                <button type="button" onClick={() => sendImageRef.current?.click()} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-[#002187] hover:text-[#002187] dark:border-slate-600 dark:text-slate-400 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer">
                  <ImageIcon className="h-4 w-4" /> {sendImage ? sendImage.name : "Selecionar imagem (JPG ou PNG)"}
                </button>
              </div>
            )}
            {Array.from({ length: sendVariables }, (_, index) => (
              <input key={index} value={params[index] ?? ""} onChange={(event) => setParams((current) => { const next = [...current]; next[index] = event.target.value; return next; })} placeholder={`Valor para {{${index + 1}}}`} className={inputClass} />
            ))}
            {sendError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{sendError}</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => setSendTarget(null)} className={ghostButton}>Cancelar</button>
            <button type="button" onClick={() => void sendTemplate()} disabled={sendDisabled} className={primaryButton}>
              <Send className="h-3.5 w-3.5" /> {sending ? "Enviando..." : "Enviar notificação"}
            </button>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
