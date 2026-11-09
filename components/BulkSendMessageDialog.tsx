"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, Image as ImageIcon, Loader2, MessageSquareText, Paperclip, Receipt, Send, Users, Video, X, XCircle } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ChatPreview, formatFileSize } from "@/components/WhatsAppPreview";
import { BULK_STARTED_EVENT, BulkJobProgress, BulkResultTabs, type BulkJobView, type BulkResultTab } from "@/components/BulkDispatchTracker";
import { CampaignMetricsPanel } from "@/components/CampaignMetricsPanel";

const MAX_FILE_SIZE = 16 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPT = "image/*,video/*,application/pdf";

type ApiTemplate = { id: string; name: string; status: string; language: string; category?: string; body: string; footer: string; headerFormat: string | null; headerImageUrl?: string | null; buttons?: { type: string; text: string }[] };
type Pricing = { marketing: number; utility: number; authentication: number };
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const CATEGORY_LABEL: Record<string, string> = { MARKETING: "marketing", UTILITY: "utilidade", AUTHENTICATION: "autenticação" };

export interface BulkRecipient { contactId: string; nome: string; telefone: string; }
export interface BulkSendResult { contactId: string; nome: string; telefone: string; status: "pending" | "sending" | "sent" | "failed"; error?: string; }

type Step = "recipients" | "message" | "progress";
const fieldClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";

// A conclusão é avisada pelo indicador global (BulkDispatchTracker); onComplete fica opcional.
interface Props { stageName: string; recipients: BulkRecipient[]; onClose: () => void; onComplete?: (results: BulkSendResult[]) => void; }

function isAllowed(file: File) { return file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf"; }
function formatSize(bytes: number) { return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
function FileIcon({ file }: { file: File }) { const c = "h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]"; if (file.type.startsWith("image/")) return <ImageIcon className={c} />; if (file.type.startsWith("video/")) return <Video className={c} />; return <FileText className={c} />; }
function variableCount(body: string) { return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size; }

type ParamSource = "primeiro_nome" | "nome" | "telefone" | "manual";
type TemplateParam = { source: ParamSource; value: string };
const PARAM_SOURCES: { value: ParamSource; label: string }[] = [
  { value: "primeiro_nome", label: "Primeiro nome" },
  { value: "nome", label: "Nome do contato" },
  { value: "telefone", label: "Telefone" },
  { value: "manual", label: "Valor fixo" },
];
function resolveParam(param: TemplateParam, recipient?: BulkRecipient) {
  if (param.source === "manual") return param.value;
  if (!recipient) return "";
  if (param.source === "primeiro_nome") return recipient.nome.trim().split(/\s+/)[0] ?? "";
  if (param.source === "nome") return recipient.nome.trim();
  return recipient.telefone;
}

export function BulkSendMessageDialog({ stageName, recipients, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>("recipients");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(recipients.map((r) => r.contactId)));
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  // Começa carregando: a lista só é buscada ao abrir a etapa de mensagem.
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<ApiTemplate | null>(null);
  const [templateParams, setTemplateParams] = useState<TemplateParam[]>([]);
  const [mode, setMode] = useState<"free" | "template">("free");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [pricing, setPricing] = useState<Pricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics/pricing", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: Pricing } | null) => { if (!cancelled && body?.data) setPricing(body.data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const [job, setJob] = useState<BulkJobView | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [pollWarning, setPollWarning] = useState("");
  const [resultTab, setResultTab] = useState<BulkResultTab>("destinatarios");

  // Acompanha o lote no servidor enquanto o modal está aberto: busca na hora e a cada 1,5s,
  // sem requisições sobrepostas, até o lote terminar; para tudo ao fechar o modal.
  const jobId = job?.id;
  const jobActive = job?.status === "running";
  useEffect(() => {
    if (!jobId || !jobActive) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/whatsapp/bulk-send/${jobId}?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => null) as { data?: BulkJobView; error?: string } | null;
        if (!response.ok || !body?.data) throw new Error(body?.error ?? `HTTP ${response.status}`);
        failures = 0;
        setPollWarning("");
        setJob(body.data);
        if (body.data.status !== "running") return;
      } catch (err) {
        if (controller.signal.aborted) return;
        failures += 1;
        if (failures >= 3) setPollWarning(`Não foi possível atualizar o andamento (${err instanceof Error ? err.message : "erro"}). Tentando de novo...`);
      }
      timer = setTimeout(() => void poll(), 1_500);
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId, jobActive]);

  useEffect(() => {
    if (step !== "message") return;
    let cancelled = false;
    fetch("/api/whatsapp/templates").then((res) => res.json()).then((data) => { if (!cancelled && Array.isArray(data.data)) setTemplates(data.data); }).catch(() => { if (!cancelled) setTemplates([]); }).finally(() => { if (!cancelled) setTemplatesLoading(false); });
    return () => { cancelled = true; };
  }, [step]);

  const validRecipients = useMemo(() => recipients.filter((r) => r.telefone.replace(/\D/g, "").length >= 10), [recipients]);
  const selectedRecipients = useMemo(() => validRecipients.filter((r) => selectedIds.has(r.contactId)), [validRecipients, selectedIds]);
  const toggleSelect = (id: string) => { setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const selectAll = () => setSelectedIds(new Set(validRecipients.map((r) => r.contactId)));
  const clearSelection = () => setSelectedIds(new Set());

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const allowed = Array.from(fileList).filter(isAllowed);
    if (allowed.length !== fileList.length) setError("Apenas imagens, vídeos e PDFs são aceitos.");
    const combined = [...files, ...allowed];
    if (combined.length > MAX_FILES) { setError(`Máximo de ${MAX_FILES} arquivos.`); return; }
    const oversized = combined.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) { setError(`"${oversized.name}" excede ${formatSize(MAX_FILE_SIZE)}.`); return; }
    setFiles(combined); setError("");
  };
  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const canProceedToMessage = selectedRecipients.length > 0;
  const canSend = mode === "free" ? (text.trim().length > 0 || files.length > 0) : (selectedTemplate !== null && templateParams.every((p) => p.source !== "manual" || p.value.trim() !== ""));

  const startSending = async () => {
    if (!canSend) return;
    setStarting(true); setError("");
    const formData = new FormData();
    formData.set("contactIds", JSON.stringify(selectedRecipients.map((r) => r.contactId)));
    formData.set("stageName", stageName);
    if (mode === "template" && selectedTemplate) { formData.set("templateName", selectedTemplate.name); formData.set("templateLanguage", selectedTemplate.language); formData.set("templateParams", JSON.stringify(templateParams)); }
    else { formData.set("text", text); files.forEach((f) => formData.append("files", f)); }
    try {
      const response = await fetch("/api/whatsapp/bulk-send", { method: "POST", body: formData });
      const data = await response.json().catch(() => null) as { data?: BulkJobView; error?: string } | null;
      if (!response.ok || !data?.data) throw new Error(data?.error ?? "Falha ao iniciar envio em massa.");
      setJob(data.data);
      setStep("progress");
      window.dispatchEvent(new Event(BULK_STARTED_EVENT));
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao iniciar envio em massa."); }
    finally { setStarting(false); }
  };

  const isComplete = job?.status === "completed" || job?.status === "cancelled";
  const handleClose = () => {
    if (isComplete && job && onComplete) {
      onComplete((job.items ?? []).map((item) => ({ contactId: item.contactId, nome: item.nome, telefone: item.telefone, status: item.status === "SENT" ? "sent" : item.status === "FAILED" || item.status === "CANCELLED" ? "failed" : item.status === "SENDING" ? "sending" : "pending", error: item.error })));
    }
    onClose();
  };
  const [cancelling, setCancelling] = useState(false);
  const cancelJob = async () => {
    if (!job || !window.confirm("Cancelar o envio para os contatos que ainda estão na fila?")) return;
    setCancelling(true);
    try {
      const response = await fetch(`/api/whatsapp/bulk-send/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) setPollWarning(body?.error ?? "Não foi possível cancelar o envio.");
    } finally {
      setCancelling(false);
    }
  };

  const stepsArr: { key: Step; label: string; icon: typeof Users }[] = [
    { key: "recipients", label: "Destinatários", icon: Users },
    { key: "message", label: "Mensagem", icon: MessageSquareText },
    { key: "progress", label: "Progresso", icon: Activity },
  ];
  const currentStepIndex = stepsArr.findIndex((s) => s.key === step);
  const ghostButton = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer";
  const outlineButton = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer";
  const primaryButton = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#051647] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#002187] hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer";

  return (
    <EntityDialog titleId="bulk-send-title" title="Envio em massa" description={step === "recipients" ? "Escolha quem recebe a mensagem." : step === "message" ? "Escreva a mensagem ou escolha um modelo aprovado." : "Acompanhe o envio em tempo real."} onClose={handleClose} size="lg">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#002187]/15 bg-[#002187]/5 px-3 py-1 text-xs font-semibold text-[#002187] dark:border-[#C4D600]/30 dark:bg-[#C4D600]/10 dark:text-[#C4D600]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />Etapa: {stageName}
          </span>
          <ol className="flex items-center gap-1.5" aria-label="Etapas do envio">
            {stepsArr.map((s, i) => {
              const StepIcon = s.icon;
              const active = step === s.key;
              const completed = currentStepIndex > i;
              return (
                <li key={s.key} className="flex items-center gap-1.5" aria-current={active ? "step" : undefined}>
                  <span className={`grid h-7 w-7 place-items-center rounded-full border transition-all duration-300 ${active ? "border-[#051647] bg-[#051647] text-white shadow-sm dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-transparent dark:text-slate-500"}`}>
                    {completed ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                  </span>
                  <span className={`hidden text-xs font-semibold transition-colors md:inline ${active ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"}`}>{s.label}</span>
                  {i < stepsArr.length - 1 && <span className={`mx-1 h-px w-5 transition-colors duration-300 sm:w-8 ${completed ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />}
                </li>
              );
            })}
          </ol>
        </div>

        <div key={step} className="soft-pop-in custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          {step === "recipients" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{selectedIds.size} de {validRecipients.length} selecionados</p>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAll} className="rounded-md px-2 py-1 text-[10px] font-semibold text-[#002187] hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-slate-800 cursor-pointer">Selecionar todos</button>
                  <button type="button" onClick={clearSelection} className="rounded-md px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer">Limpar</button>
                </div>
              </div>
              <div className="custom-scrollbar max-h-[340px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {validRecipients.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">Nenhum contato com telefone válido nesta etapa.</p> : validRecipients.map((r) => (
                  <label key={r.contactId} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selectedIds.has(r.contactId) ? "" : "opacity-60"}`}>
                    <input type="checkbox" checked={selectedIds.has(r.contactId)} onChange={() => toggleSelect(r.contactId)} className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-[#002187] dark:accent-[#C4D600]" />
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#002187]/10 text-[11px] font-bold text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">{r.nome.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "?"}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{r.nome}</p><p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{r.telefone}</p></div>
                  </label>
                ))}
              </div>
              {recipients.length > validRecipients.length && <p className="text-[10px] text-amber-600 dark:text-amber-400">⚠ {recipients.length - validRecipients.length} contato(s) sem telefone válido foram excluídos.</p>}
            </div>
          )}

          {step === "message" && (
            <div className="space-y-4">
              <div className="flex gap-2 rounded-lg border border-slate-200 p-1 dark:border-slate-700">
                <button type="button" onClick={() => { setMode("free"); setSelectedTemplate(null); }} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${mode === "free" ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>Mensagem livre</button>
                <button type="button" onClick={() => setMode("template")} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${mode === "template" ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>Usar modelo</button>
              </div>
              {mode === "template" && (
                <div className="space-y-3">
                  {templatesLoading ? <LoadingSpinner label="Carregando modelos..." className="w-full justify-center py-4" /> : templates.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">Nenhum modelo aprovado disponível.</p> : (<>
                    <select value={selectedTemplate?.name ?? ""} onChange={(e) => { const t = templates.find((tpl) => tpl.name === e.target.value) ?? null; setSelectedTemplate(t); setTemplateParams(Array.from({ length: variableCount(t?.body ?? "") }, (_, i) => ({ source: i === 0 ? "primeiro_nome" : "manual", value: "" }))); }} className={fieldClass}><option value="">Selecione um modelo...</option>{templates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
                    {selectedTemplate && templateParams.map((param, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">{`{{${i + 1}}}`}</span>
                        <select value={param.source} onChange={(e) => { const next = [...templateParams]; next[i] = { ...param, source: e.target.value as ParamSource }; setTemplateParams(next); }} className={`${fieldClass} cursor-pointer`}>{PARAM_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                        {param.source === "manual" && <input value={param.value} onChange={(e) => { const next = [...templateParams]; next[i] = { ...param, value: e.target.value }; setTemplateParams(next); }} placeholder="Texto fixo" className={fieldClass} />}
                      </div>
                    ))}
                    {selectedTemplate && <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"><p className="font-semibold">Prévia{selectedRecipients[0] ? ` (${selectedRecipients[0].nome})` : ""}:</p><p className="mt-1 whitespace-pre-wrap">{selectedTemplate.body.replace(/\{\{(\d+)\}\}/g, (_, n) => { const p = templateParams[Number(n) - 1]; return (p && resolveParam(p, selectedRecipients[0])) || `{{${n}}}`; })}</p></div>}
                  </>)}
                </div>
              )}
              {mode === "free" && (
                <>
                <label className="flex shrink-0 flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {files.length > 0 ? "Legenda" : "Mensagem"}
                  <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4096} placeholder={files.length > 0 ? "Adicione uma legenda..." : "Digite a mensagem..."} className="h-24 resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
                </label>
                <ChatPreview text={text} files={files} />
                </>
              )}
              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Anexos ({files.length}/{MAX_FILES})</p>
                  <div className="flex flex-wrap gap-2">{files.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="group relative flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <FileIcon file={file} /><span className="max-w-[120px] truncate font-medium">{file.name}</span><span className="text-[10px] text-slate-500">{formatSize(file.size)}</span>
                      <button type="button" onClick={() => removeFile(index)} className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-700 dark:hover:text-red-400 cursor-pointer"><X className="h-3 w-3" /></button>
                    </div>
                  ))}</div>
                </div>
              )}
              {(mode === "free" || selectedTemplate) && (() => {
                // Resumo antes de confirmar: contatos válidos, tipo de mensagem e custo estimado (contatos × preço da categoria).
                const category = (selectedTemplate?.category ?? "").toUpperCase();
                const unit = mode === "free" ? 0 : !pricing ? null : category === "MARKETING" ? pricing.marketing : category === "UTILITY" ? pricing.utility : category === "AUTHENTICATION" ? pricing.authentication : null;
                const typeLabel = mode === "free" ? "Mensagem livre" : `Modelo de ${CATEGORY_LABEL[category] ?? (category.toLowerCase() || "categoria desconhecida")}`;
                return (
                  <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40" aria-label="Resumo do envio">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-slate-500 shadow-xs dark:bg-slate-900 dark:text-slate-300"><Receipt className="h-3.5 w-3.5" /></span>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumo do envio</p>
                    </div>
                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div><dt className="text-[11px] text-slate-500 dark:text-slate-400">Contatos válidos</dt><dd className="text-base font-bold tabular-nums text-slate-900 dark:text-white">{selectedRecipients.length.toLocaleString("pt-BR")}</dd></div>
                      <div><dt className="text-[11px] text-slate-500 dark:text-slate-400">Tipo</dt><dd className="text-sm font-semibold text-slate-900 dark:text-white">{typeLabel}</dd></div>
                      <div><dt className="text-[11px] text-slate-500 dark:text-slate-400">Custo estimado</dt><dd className="text-base font-bold tabular-nums text-[#002187] dark:text-[#C4D600]">{unit === null ? "Indisponível" : unit === 0 ? "Sem custo" : brl(selectedRecipients.length * unit)}</dd></div>
                    </dl>
                    <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                      {mode === "free" ? "Mensagem livre não é cobrada pela Meta, mas só chega a quem falou com a loja nas últimas 24h." : unit === null ? "Não foi possível identificar o preço deste modelo." : `${selectedRecipients.length} × ${brl(unit)} por mensagem entregue.`}
                    </p>
                  </section>
                );
              })()}
              {error && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{error}</p>}
            </div>
          )}

          {step === "progress" && pollWarning && <p role="status" className="mb-3 rounded-lg bg-[#F7915E]/10 p-2 text-xs text-[#9a3d12] dark:text-[#F7915E]">{pollWarning}</p>}
          {step === "progress" && job && (
            <div className="space-y-4">
              <BulkResultTabs tab={resultTab} onChange={setResultTab} firstLabel="Progresso" />
              <div key={resultTab} className="soft-pop-in">
                {resultTab === "resultados" ? <CampaignMetricsPanel type="bulk" id={job.id} /> : <BulkJobProgress job={job} />}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          {step === "recipients" && (<>
            <button type="button" onClick={onClose} className={ghostButton}>Cancelar</button>
            <button type="button" disabled={!canProceedToMessage} onClick={() => setStep("message")} className={primaryButton}>Próximo<ArrowRight className="h-4 w-4" /></button>
          </>)}
          {step === "message" && (<>
            <button type="button" onClick={() => setStep("recipients")} className={ghostButton}><ArrowLeft className="h-4 w-4" />Voltar</button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(event) => addFiles(event.target.files)} />
              <button type="button" disabled={mode === "template"} onClick={() => inputRef.current?.click()} className={outlineButton}><Paperclip className="h-4 w-4" />Anexar</button>
              <button type="button" disabled={!canSend || starting} onClick={startSending} className={primaryButton}>{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{starting ? "Iniciando..." : `Enviar para ${selectedRecipients.length}`}</button>
            </div>
          </>)}
          {step === "progress" && (<>
            {isComplete ? <span /> : (
              <button type="button" disabled={cancelling || job?.status !== "running"} onClick={() => void cancelJob()} className={`${ghostButton} text-[#9a3d12] hover:bg-[#F7915E]/10 hover:text-[#9a3d12] dark:text-[#F7915E] dark:hover:bg-[#F7915E]/10 dark:hover:text-[#F7915E]`}><XCircle className="h-4 w-4" />{cancelling ? "Cancelando..." : "Cancelar envio"}</button>
            )}
            <button type="button" onClick={handleClose} className={primaryButton}>{isComplete ? <><CheckCircle2 className="h-4 w-4" />Concluir</> : "Continuar em segundo plano"}</button>
          </>)}
        </div>
      </div>
    </EntityDialog>
  );
}