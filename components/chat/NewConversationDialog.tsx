"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, FileText, Image as ImageIcon, LoaderCircle, MessageSquareText, Search, X } from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Stepper, { Step } from "@/components/Stepper";
import { WhatsAppBubble } from "@/components/WhatsAppBubble";
import { formatPhone } from "@/lib/chat/phone";
import { VARIABLE_SOURCES, suggestVariable, templateVariableCount, type TemplateContact } from "@/lib/chat/template-variables";

type Contact = { id: string; nome: string; telefone: string };
type SearchResult = { term: string; contacts: Contact[]; failed: boolean };
type Preview = {
  contact: TemplateContact & { id: string; cpf: string };
  windowOpen: boolean;
  phoneValid: boolean;
  blocked: boolean;
  open: { id: string; visible: boolean; assignee: string | null; queue: string | null } | null;
};
type Template = {
  name: string;
  language: string;
  status: string;
  body: string;
  footer: string;
  headerFormat: string | null;
  headerText: string;
  headerImageUrl: string | null;
  examples: string[];
  buttons: { type: string; text: string }[];
};
type Mode = "text" | "template";
type Upload = { file: File; url: string };

const CONTACT_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;
const MEDIA_ACCEPT: Record<string, string> = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
const MEDIA_LABEL: Record<string, string> = { IMAGE: "imagem", VIDEO: "vídeo", DOCUMENT: "documento" };

const field = "h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const scroller = "overflow-y-auto pr-1 [scrollbar-width:thin] dark:[color-scheme:dark]";
const notice = "rounded-lg bg-[#F7915E]/10 px-3 py-2 text-xs text-slate-700 dark:text-slate-200";
const errorText = "text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]";

const templateKey = (template: Template) => `${template.name}|${template.language}`;

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1.5">
      <dt className="text-[10px] font-bold uppercase text-slate-400">{label}</dt>
      <dd className="truncate text-xs text-slate-800 dark:text-slate-100">{value || "Não informado"}</dd>
    </div>
  );
}

function VariableField({ id, label, value, contact, onChange }: { id: string; label: string; value: string; contact: TemplateContact; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} className={field} />
      <div className="flex flex-wrap gap-1">
        {VARIABLE_SOURCES.map((source) => {
          const sourceValue = source.value(contact);
          return (
            <button key={source.id} type="button" disabled={!sourceValue} title={sourceValue || "Contato sem este dado"} onClick={() => onChange(sourceValue)} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sourceValue && sourceValue === value ? "border-[#002187] bg-[#002187]/5 text-[#002187] dark:border-[#C4D600] dark:bg-[#C4D600]/10 dark:text-[#C4D600]" : "cursor-pointer border-slate-200 text-slate-600 hover:border-[#002187] dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#C4D600]"}`}>{source.label}</button>
          );
        })}
      </div>
    </div>
  );
}

export function NewConversationDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const { isDark } = useCrmTheme();
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const defaultContacts = useRef<Contact[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRequest = useRef<AbortController | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [mode, setMode] = useState<Mode>("template");
  const [selectedKey, setSelectedKey] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [headerParams, setHeaderParams] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [upload, setUpload] = useState<Upload | null>(null);
  const uploadRef = useRef<Upload | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const term = search.trim();
  // O resultado guarda o termo que o originou: qualquer divergência com o input significa busca pendente.
  const isLoading = result?.term !== term;

  useEffect(() => {
    if (!term && defaultContacts.current) {
      setResult({ term, contacts: defaultContacts.current, failed: false });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ limit: String(CONTACT_LIMIT), withPhone: "1" });
      if (term) query.set("q", term);
      fetch(`/api/contacts/search?${query}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("search_failed");
          const { data } = (await response.json()) as { data: Contact[] };
          if (!term) defaultContacts.current = data;
          setResult({ term, contacts: data, failed: false });
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ term, contacts: [], failed: true });
        });
    }, term ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    let active = true;
    fetch("/api/whatsapp/templates")
      .then(async (response) => {
        const data = (await response.json()) as { data?: Template[]; error?: string };
        if (!active) return;
        if (!response.ok) setError(data.error ?? "Não foi possível carregar os modelos.");
        setTemplates((data.data ?? []).filter((item) => item.status === "APPROVED"));
      })
      .catch(() => {
        if (active) setTemplates([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    if (uploadRef.current) URL.revokeObjectURL(uploadRef.current.url);
  }, []);

  const template = useMemo(() => templates?.find((item) => templateKey(item) === selectedKey) ?? null, [templates, selectedKey]);
  const bodyCount = template ? templateVariableCount(template.body) : 0;
  const headerCount = template?.headerFormat === "TEXT" ? templateVariableCount(template.headerText) : 0;
  const mediaFormat = template?.headerFormat && MEDIA_ACCEPT[template.headerFormat] ? template.headerFormat : null;
  const contact = preview?.contact ?? null;
  const usingTemplate = !preview?.windowOpen || mode === "template";

  const replaceUpload = (next: Upload | null) => {
    if (uploadRef.current) URL.revokeObjectURL(uploadRef.current.url);
    uploadRef.current = next;
    setUpload(next);
  };

  const chooseTemplate = (item: Template | null, target = contact) => {
    setSelectedKey(item ? templateKey(item) : "");
    setParams(item && target ? Array.from({ length: templateVariableCount(item.body) }, (_, index) => suggestVariable(item.body, index, item.examples, target)) : []);
    setHeaderParams([]);
    replaceUpload(null);
    setError("");
  };

  const selectContact = async (id: string) => {
    if (id === selectedId) return;
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setSelectedId(id);
    setPreview(null);
    setError("");
    chooseTemplate(null);
    const response = await fetch(`/api/chat/conversations/preview?contactId=${encodeURIComponent(id)}`, { signal: controller.signal }).catch(() => null);
    if (controller.signal.aborted) return;
    if (!response?.ok) {
      setSelectedId(null);
      setError("Não foi possível carregar o contato.");
      return;
    }
    const data = (await response.json()) as Preview;
    setPreview(data);
    setMode(data.windowOpen ? "text" : "template");
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    replaceUpload({ file, url: URL.createObjectURL(file) });
  };

  const validateStep = (step: number) => {
    const fail = (message: string) => (setError(message), false);
    if (step === 1) {
      if (!preview) return fail(selectedId ? "Aguarde carregar o contato." : "Selecione um contato.");
      if (!preview.phoneValid) return fail("O telefone deste contato é inválido.");
      if (preview.blocked) return fail("Este número está bloqueado e não recebe mensagens.");
      if (preview.open && !preview.open.visible) return fail("Este contato já está em atendimento em outra fila.");
    }
    if (step === 2 && usingTemplate && !template) return fail("Selecione um modelo aprovado.");
    if (step === 3) {
      if (!usingTemplate && !text.trim()) return fail("Escreva a mensagem.");
      if (usingTemplate) {
        if (!template) return fail("Selecione um modelo aprovado.");
        const values = [...Array.from({ length: bodyCount }, (_, index) => params[index]), ...Array.from({ length: headerCount }, (_, index) => headerParams[index])];
        if (values.some((value) => !value?.trim())) return fail("Preencha todas as variáveis do modelo.");
        if (mediaFormat && mediaFormat !== "IMAGE" && !upload) return fail(`Anexe o ${MEDIA_LABEL[mediaFormat]} do cabeçalho.`);
      }
    }
    setError("");
    return true;
  };

  const uploadHeader = async () => {
    if (!upload || !mediaFormat) return undefined;
    const form = new FormData();
    form.set("file", upload.file);
    const response = await fetch("/api/chat/media", { method: "POST", body: form }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { name: string; mime: string; size: number; key: string; error?: string } | null;
    if (!response?.ok || !data) throw new Error(data?.error ?? "Não foi possível enviar o arquivo.");
    return { kind: mediaFormat.toLowerCase(), name: data.name, mime: data.mime, size: data.size, key: data.key };
  };

  const send = async () => {
    if (sending || !contact) return;
    setSending(true);
    setError("");
    try {
      const headerMedia = usingTemplate ? await uploadHeader() : undefined;
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usingTemplate && template
            ? { contactId: contact.id, template: { name: template.name, language: template.language, params: params.slice(0, bodyCount).map((value) => value.trim()), headerParams: headerParams.slice(0, headerCount).map((value) => value.trim()), headerMedia } }
            : { contactId: contact.id, text },
        ),
      });
      const data = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!response.ok || !data?.id) throw new Error(data?.error ?? "Não foi possível iniciar a conversa.");
      onOpened(data.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível iniciar a conversa.");
    } finally {
      setSending(false);
    }
  };

  const previewImage = mediaFormat === "IMAGE" ? upload?.url ?? template?.headerImageUrl ?? "" : null;
  const bubble = usingTemplate ? (
    <WhatsAppBubble
      image={template ? previewImage : null}
      mediaLabel={mediaFormat && mediaFormat !== "IMAGE" ? upload?.file.name ?? `Cabeçalho: ${MEDIA_LABEL[mediaFormat]}` : null}
      headerText={template?.headerFormat === "TEXT" ? template.headerText : undefined}
      headerValues={headerParams}
      body={template?.body ?? ""}
      footer={template?.footer}
      values={params}
      buttons={template?.buttons}
    />
  ) : (
    <WhatsAppBubble body={text} />
  );

  return (
    <EntityDialog titleId="new-conversation-title" title="Nova conversa" description="Escolha o contato, a mensagem e envie." size="wizard" onClose={onClose}>
      <Stepper
        initialStep={1}
        onStepChange={() => setError("")}
        onFinalStepCompleted={() => void send()}
        validateStep={validateStep}
        backButtonText="Voltar"
        nextButtonText="Continuar"
        completeButtonText={sending ? "Enviando..." : "Enviar e Iniciar Conversa"}
        indicator="numbers"
        orientation="horizontal"
        transition="slide"
        linear
        disableStepIndicators
        showFooter
        theme={isDark ? "dark" : "light"}
        accentColor="#C4D600"
        frame={false}
        radius={16}
        width="100%"
        className="min-h-0 flex-1"
      >
        <Step title="Destinatário" description="Quem vai receber">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="relative shrink-0">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone..." aria-label="Buscar contato" aria-busy={isLoading} className={`${field} pr-10`} />
                {isLoading ? (
                  <LoaderCircle aria-hidden="true" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#002187] dark:text-[#C4D600]" />
                ) : (
                  <Search aria-hidden="true" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                )}
              </div>
              <div className={`flex h-56 flex-col gap-1.5 ${scroller}`}>
                {isLoading ? (
                  <div className="flex flex-1 items-center justify-center"><LoadingSpinner label="Carregando contatos..." size={32} /></div>
                ) : result.failed ? (
                  <p role="alert" className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Não foi possível carregar os contatos.</p>
                ) : result.contacts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{term ? `Nenhum contato encontrado para '${term}'` : "Nenhum contato com telefone cadastrado."}</p>
                ) : (
                  result.contacts.map((item) => (
                    <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => void selectContact(item.id)} className={`shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 text-left transition-colors ${selectedId === item.id ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5"}`}>
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{item.nome}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{formatPhone(item.telefone)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="min-w-0 space-y-2">
              {contact ? (
                <>
                  <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 py-1 dark:divide-slate-800 dark:border-slate-700">
                    <Detail label="Nome" value={contact.nome} />
                    <Detail label="Telefone" value={contact.telefone ? formatPhone(contact.telefone) : ""} />
                    <Detail label="Documento" value={contact.cpf} />
                    <Detail label="Loja" value={contact.loja} />
                    {preview?.open && <Detail label="Responsável" value={preview.open.assignee ?? preview.open.queue ?? ""} />}
                  </dl>
                  {preview?.open?.visible && (
                    <button type="button" onClick={() => onOpened(preview.open!.id)} className="w-full cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5">Já tem conversa aberta: abrir agora</button>
                  )}
                </>
              ) : (
                <div className="grid h-full min-h-32 place-items-center rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {selectedId ? <LoadingSpinner label="Carregando contato..." size={28} /> : "Selecione um contato para ver os dados."}
                </div>
              )}
            </div>
          </div>
          {error && <p role="alert" className={`mt-2 ${errorText}`}>{error}</p>}
        </Step>

        <Step title="Mensagem" description="Texto ou modelo">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-2">
              {preview?.windowOpen ? (
                <div role="radiogroup" aria-label="Tipo de mensagem" className="grid shrink-0 grid-cols-2 gap-2">
                  {([{ id: "text", title: "Texto livre", hint: "Janela de 24h aberta.", icon: MessageSquareText }, { id: "template", title: "Modelo aprovado", hint: "Mensagem aprovada pela Meta.", icon: FileText }] as const).map(({ id, title, hint, icon: Icon }) => (
                    <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => { setMode(id); setError(""); }} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${mode === id ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5"}`}>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                      <span><span className="block text-xs font-semibold text-slate-900 dark:text-white">{title}</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span></span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={`flex shrink-0 items-center gap-2 ${notice}`}><Clock className="h-4 w-4 shrink-0" />Sem janela de 24h aberta: só é possível iniciar com um modelo aprovado.</p>
              )}
              {usingTemplate ? (
                <div className={`flex h-52 flex-col gap-1.5 ${scroller}`}>
                  {templates === null ? (
                    <div className="flex flex-1 items-center justify-center"><LoadingSpinner label="Carregando modelos..." size={32} /></div>
                  ) : templates.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum modelo aprovado disponível.</p>
                  ) : (
                    templates.map((item) => (
                      <button key={templateKey(item)} type="button" aria-pressed={selectedKey === templateKey(item)} onClick={() => chooseTemplate(item)} className={`shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 text-left transition-colors ${selectedKey === templateKey(item) ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5"}`}>
                        <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.body}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Na próxima etapa você escreve a mensagem.</p>
              )}
            </div>
            <div className="min-w-0">{bubble}</div>
          </div>
          {error && <p role="alert" className={`mt-2 ${errorText}`}>{error}</p>}
        </Step>

        <Step title="Personalizar" description="Revisar e enviar">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className={`max-h-64 min-w-0 space-y-3 ${scroller}`}>
              {!usingTemplate && (
                <div className="space-y-1.5">
                  <label htmlFor="new-conversation-text" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Mensagem</label>
                  <textarea id="new-conversation-text" value={text} maxLength={4096} rows={6} onChange={(event) => setText(event.target.value)} className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
                </div>
              )}
              {usingTemplate && mediaFormat && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Cabeçalho: {MEDIA_LABEL[mediaFormat]}{mediaFormat === "IMAGE" ? " (opcional: o modelo já tem uma)" : ""}</span>
                  {upload ? (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">
                      <ImageIcon className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                      <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{upload.file.name}</span>
                      <button type="button" aria-label="Remover arquivo" onClick={() => replaceUpload(null)} className="cursor-pointer rounded p-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <label className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-[#002187] hover:text-[#002187] dark:border-slate-600 dark:text-slate-400 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600]">
                      <ImageIcon className="h-4 w-4" />Selecionar arquivo
                      <input type="file" accept={MEDIA_ACCEPT[mediaFormat]} hidden onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = ""; }} />
                    </label>
                  )}
                </div>
              )}
              {usingTemplate && contact && Array.from({ length: headerCount }, (_, index) => (
                <VariableField key={`header-${index}`} id={`header-variable-${index}`} label={`Cabeçalho {{${index + 1}}}`} value={headerParams[index] ?? ""} contact={contact} onChange={(value) => { setError(""); setHeaderParams((current) => { const next = [...current]; next[index] = value; return next; }); }} />
              ))}
              {usingTemplate && contact && Array.from({ length: bodyCount }, (_, index) => (
                <VariableField key={`body-${index}`} id={`body-variable-${index}`} label={`Variável {{${index + 1}}}`} value={params[index] ?? ""} contact={contact} onChange={(value) => { setError(""); setParams((current) => { const next = [...current]; next[index] = value; return next; }); }} />
              ))}
              {usingTemplate && !mediaFormat && bodyCount === 0 && headerCount === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Este modelo não tem variáveis. Confira a prévia e envie.</p>}
            </div>
            <div className={`max-h-64 min-w-0 ${scroller}`}>{bubble}</div>
          </div>
          {error && <p role="alert" className={`mt-2 ${errorText}`}>{error}</p>}
        </Step>
      </Stepper>
    </EntityDialog>
  );
}
