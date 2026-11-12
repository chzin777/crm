"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Pagination } from "@/components/dashboard/DashboardKit";
import {
  AlertTriangle,
  CheckCheck,
  ChevronUp,
  ChevronsUpDown,
  Clock3,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  MessageCircleReply,
  Paperclip,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  SquareCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { CampaignTemplatePicker, type CampaignTemplate } from "@/components/CampaignTemplatePicker";
import { compareStoreNames, storeDisplayName } from "@/lib/stores";
import Stepper, { Step } from "@/components/Stepper";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { FormMultiSelect } from "@/components/FormMultiSelect";
import { useCrmData } from "@/hooks/useCrmData";
import { useToast } from "@/components/ToastProvider";
import { CampaignMetricsPanel } from "@/components/CampaignMetricsPanel";
import { CampaignRecipientsLog } from "@/components/CampaignRecipientsLog";
import { BULK_STARTED_EVENT, BulkJobDetailsDialog, type BulkJobView } from "@/components/BulkDispatchTracker";

type CampaignStatus = "Ativa" | "Pronta para envio" | "Agendada" | "Pausada" | "Rascunho" | "Enviando" | "Envio pausado" | "Enviada" | "Envio parcial" | "Falha no envio";
const isDispatchLocked = (status: CampaignStatus) => status === "Enviando" || status === "Envio pausado" || status === "Enviada" || status === "Envio parcial";

/** Status exibido na listagem unificada (campanhas e lotes do pipeline). */
type DisplayStatus = "Rascunho" | "Pronta" | "Agendado" | "Enviando" | "Pausado" | "Concluído" | "Parcial" | "Falha" | "Cancelado";
type DisplayFilter = "Todas" | "Enviando" | "Pausado" | "Agendado" | "Concluído" | "Falha" | "Rascunho";
const PAGE_SIZES = [10, 20, 50];

interface CampaignAudienceSegment {
  id: string;
  nome: string;
  modoPublico?: "criterios" | "contatos";
  criterios?: string[];
  contatosSelecionados?: string[];
}

interface AudienceCriterion {
  id: string;
  nome: string;
  tipo: "geral" | "loja";
  inativo?: boolean;
  regras?: { campo: string; operador: string; valor?: string; valor2?: string }[];
}

interface CampaignRecipient {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  segmento: string;
}

interface DispatchJobView {
  campaignId: string;
  campaignName: string;
  status: "running" | "paused" | "completed" | "cancelled";
  total: number;
  cursor: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
  pause?: { kind: string; code?: number; message: string };
}

interface Campaign {
  id: string;
  nome: string;
  publico: string;
  audienceSegmentIds?: string[];
  status: CampaignStatus;
  disparos: number;
  rotuloDisparos: string;
  taxaResposta: number;
  dataAtualizacao: string;
  mensagem: string;
  anexos?: { name: string; size: number; type: string; key?: string; url?: string }[];
  modelo?: CampaignTemplate | null;
}

interface QuickStats { total: number; sent: number; delivered: number; read: number; replied: number; failed: number }
const EMPTY_STATS: QuickStats = { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };

interface UnifiedRow {
  key: string;
  kind: "campaign" | "bulk";
  id: string;
  nome: string;
  origem: string;
  mensagem: string;
  publico: string;
  status: DisplayStatus;
  total: number;
  processed: number;
  stats: QuickStats;
  updatedAt: number;
  updatedLabel: string;
  campaign?: Campaign;
  bulk?: BulkJobView;
  job?: DispatchJobView;
}

const messageVariables = [
  { label: "Nome do cliente", value: "{{nome}}" },
  { label: "E-mail", value: "{{email}}" },
  { label: "Telefone", value: "{{telefone}}" },
  { label: "Segmento", value: "{{segmento}}" },
  { label: "Data de nascimento", value: "{{data_nascimento}}" },
];

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};
const int = (value: number) => value.toLocaleString("pt-BR");
const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

const displayStyles: Record<DisplayStatus, string> = {
  Rascunho: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
  Pronta: "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]",
  Agendado: "bg-blue-100 text-[#002187] dark:bg-blue-950/50 dark:text-blue-300",
  Enviando: "bg-[#002187]/10 text-[#002187] dark:bg-[#002187]/30 dark:text-[#C4D600]",
  Pausado: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Concluído: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  Parcial: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
  Falha: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Cancelado: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const campaignDisplayStatus = (campaign: Campaign): DisplayStatus => {
  switch (campaign.status) {
    case "Enviando": return "Enviando";
    case "Envio pausado": return "Pausado";
    case "Enviada": return "Concluído";
    case "Envio parcial": return "Parcial";
    case "Falha no envio": return "Falha";
    case "Agendada": return "Agendado";
    case "Pronta para envio": return "Pronta";
    default: return "Rascunho";
  }
};

const bulkDisplayStatus = (job: BulkJobView): DisplayStatus => {
  if (job.status === "running") return "Enviando";
  if (job.status === "paused") return "Pausado";
  if (job.status === "cancelled") return "Cancelado";
  if (job.sent === 0 && job.failed > 0) return "Falha";
  return "Concluído";
};

const filterMatches: Record<DisplayFilter, DisplayStatus[] | null> = {
  Todas: null,
  Enviando: ["Enviando"],
  Pausado: ["Pausado"],
  Agendado: ["Agendado"],
  Concluído: ["Concluído", "Parcial"],
  Falha: ["Falha"],
  Rascunho: ["Rascunho", "Pronta"],
};
const filters = Object.keys(filterMatches) as DisplayFilter[];

const presetAudienceCriteria: AudienceCriterion[] = [
  { id: "criteria-30d", nome: "Comprou nos últimos 30 dias", tipo: "geral" },
  { id: "criteria-90d", nome: "Comprou nos últimos 90 dias", tipo: "geral" },
  { id: "criteria-180d", nome: "Comprou nos últimos 180 dias", tipo: "geral" },
  { id: "criteria-inactive-180d", nome: "Sem compra há mais de 180 dias", tipo: "geral" },
  { id: "criteria-no-nps", nome: "Ainda não respondeu ao NPS", tipo: "geral" },
  { id: "criteria-low-nps", nome: "Recebeu NPS abaixo de 7", tipo: "geral" },
  { id: "criteria-valid-phone", nome: "Telefone válido", tipo: "geral" },
];

function sortIcon(sortConfig: { field: string; order: "asc" | "desc" }, field: string) {
  if (sortConfig.field !== field) return <ChevronsUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />;
  return <ChevronUp className={`h-3 w-3 transition-transform ${sortConfig.order === "desc" ? "rotate-180" : ""} text-[#002187] dark:text-[#C4D600]`} />;
}

function ProgressBar({ percent, tone = "default" }: { percent: number; tone?: "default" | "paused" }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all duration-500 ${tone === "paused" ? "bg-[#F7915E]" : "bg-[#002187] dark:bg-[#C4D600]"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Listagem única de campanhas/disparos, criação com disparo direto e detalhes com acompanhamento ao vivo. */
export function CampaignsView() {
  const { isDark } = useCrmTheme();
  const toast = useToast();
  const { data: campaigns, setData: setCampaigns, saveData: saveCampaigns, isLoading: campaignsLoading, error: campaignsError, reloadData: reloadCampaigns } = useCrmData<Campaign[]>("campaigns", []);
  const { data: segments, isLoading: segmentsLoading } = useCrmData<CampaignAudienceSegment[]>("segments", []);
  const { data: savedAudienceCriteria, isLoading: criteriaLoading } = useCrmData<AudienceCriterion[]>("criteria", []);
  const segmentOptions = segments.map((segment) => segment.nome);
  const segmentOptionSet = new Set(segmentOptions);
  const [stores, setStores] = useState<{ number: number; name?: string; active: boolean }[]>([]);
  const [storesError, setStoresError] = useState("");
  const [dispatchError, setDispatchError] = useState("");
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTermState] = useState("");
  const [activeFilter, setActiveFilterState] = useState<DisplayFilter>("Todas");
  // Página na URL (?page=2&limit=20, página começando em 1) para recarregar ou compartilhar no mesmo ponto.
  const [page, setPageState] = useState(() => Math.max(0, (Number(searchParams.get("page")) || 1) - 1));
  const [pageSize, setPageSizeState] = useState(() => {
    const limit = Number(searchParams.get("limit"));
    return PAGE_SIZES.includes(limit) ? limit : PAGE_SIZES[0];
  });
  const syncPageUrl = (nextPage: number, nextSize: number) => {
    const params = new URLSearchParams(window.location.search);
    if (nextPage > 0) params.set("page", String(nextPage + 1));
    else params.delete("page");
    if (nextSize !== PAGE_SIZES[0]) params.set("limit", String(nextSize));
    else params.delete("limit");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  };
  const setPage = (nextPage: number) => {
    setPageState(nextPage);
    syncPageUrl(nextPage, pageSize);
  };
  const setPageSize = (nextSize: number) => {
    setPageSizeState(nextSize);
    setPageState(0);
    syncPageUrl(0, nextSize);
  };
  // Busca ou filtro novos voltam para a primeira página.
  const setSearchTerm = (value: string) => {
    setSearchTermState(value);
    if (page !== 0) setPage(0);
  };
  const setActiveFilter = (value: DisplayFilter) => {
    setActiveFilterState(value);
    if (page !== 0) setPage(0);
  };
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [bulkDetailsId, setBulkDetailsId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedAudienceSegments, setSelectedAudienceSegments] = useState<string[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Map<File, string>>(new Map());
  const attachmentPreviewUrlsRef = useRef(new Map<File, string>());
  const [form, setForm] = useState({ nome: "", publico: "", mensagem: "" });
  const [campaignTemplate, setCampaignTemplate] = useState<CampaignTemplate | null>(null);
  const changeCampaignTemplate = (template: CampaignTemplate | null) => {
    setForm((current) => ({ ...current, mensagem: template ? template.body : campaignTemplate ? "" : current.mensagem }));
    setCampaignTemplate(template);
    setFormError("");
  };
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatchEstimate, setDispatchEstimate] = useState<{ loading: boolean; contacts: number; cost: number | null; error?: string } | null>(null);
  const [dispatchTarget, setDispatchTarget] = useState<{ mode: "single" | "batch"; ids: string[] } | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [ignoreCooldown, setIgnoreCooldown] = useState(false);
  const [cooldownDays, setCooldownDays] = useState(7);
  const [dispatchJobs, setDispatchJobs] = useState<DispatchJobView[]>([]);
  const [bulkJobs, setBulkJobs] = useState<BulkJobView[]>([]);
  const [stats, setStats] = useState<Record<string, QuickStats>>({});
  const [jobBusy, setJobBusy] = useState<string | null>(null);
  const jobStatusRef = useRef<Map<string, string> | null>(null);
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });

  const loadDispatchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/campaigns/dispatch", { cache: "no-store" });
      if (!response.ok) return;
      const { jobs, cooldownDays: days } = await response.json() as { jobs: DispatchJobView[]; cooldownDays?: number };
      if (typeof days === "number") setCooldownDays(days);
      const previous = jobStatusRef.current;
      const next = new Map(jobs.map((job) => [job.campaignId, job.status]));
      jobStatusRef.current = next;
      setDispatchJobs(jobs);
      if (!previous) return;
      let changed = false;
      for (const job of jobs) {
        const before = previous.get(job.campaignId);
        if (before === job.status || (before === undefined && job.status === "completed")) continue;
        changed = true;
        if (job.status === "paused" && job.pause?.kind !== "manual") toastRef.current.error(`Disparo pausado: ${job.campaignName}`, job.pause?.message ?? "O disparo foi pausado.");
        if (job.status === "completed") toastRef.current.success(`Disparo concluído: ${job.campaignName}`, `${job.sent} enviadas, ${job.failed} falhas.`);
      }
      if (changed) {
        const refreshed = await reloadCampaigns().catch(() => null);
        if (refreshed) setSelectedCampaign((current) => current ? refreshed.find((item) => item.id === current.id) ?? current : current);
      }
    } catch {
      // A próxima consulta tenta de novo.
    }
  }, [reloadCampaigns]);

  /** Métricas rápidas por disparo e lotes enviados pelo pipeline (entram na mesma listagem). */
  const loadListExtras = useCallback(async () => {
    const [statsBody, bulkBody] = await Promise.all([
      fetch("/api/campaigns/stats", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).catch(() => null) as Promise<{ data?: Record<string, QuickStats> } | null>,
      fetch("/api/whatsapp/bulk-send", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).catch(() => null) as Promise<{ data?: BulkJobView[] } | null>,
    ]);
    if (statsBody?.data) setStats(statsBody.data);
    if (bulkBody?.data) setBulkJobs(bulkBody.data);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadDispatchJobs(), loadListExtras()]);
  }, [loadDispatchJobs, loadListExtras]);

  const hasActiveJob = dispatchJobs.some((job) => job.status === "running") || bulkJobs.some((job) => job.status === "running");
  useEffect(() => {
    if (campaignsLoading) return;
    const first = window.setTimeout(() => void refreshAll(), 0);
    const timer = window.setInterval(() => void refreshAll(), hasActiveJob ? 3000 : 15000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [campaignsLoading, hasActiveJob, refreshAll]);

  const controlDispatch = async (campaignId: string, action: "pause" | "resume" | "cancel") => {
    setJobBusy(campaignId);
    try {
      const response = await fetch("/api/campaigns/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, campaignId }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível executar a ação.");
      await loadDispatchJobs();
      const refreshed = await reloadCampaigns().catch(() => null);
      if (refreshed) setSelectedCampaign((current) => current ? refreshed.find((item) => item.id === current.id) ?? current : current);
    } catch (error) {
      toast.error("Ação não concluída", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setJobBusy(null);
    }
  };

  /** Pausar, retomar, cancelar ou reenviar falhas de um lote enviado pelo pipeline. */
  const controlBulk = async (job: BulkJobView, action: "pause" | "resume" | "cancel" | "retry") => {
    if (action === "cancel" && !window.confirm("Cancelar o envio para os contatos que ainda estão na fila?")) return;
    if (action === "retry" && !window.confirm(`Reenviar a mensagem para os ${job.failed} contato(s) que falharam?`)) return;
    setJobBusy(job.id);
    try {
      const response = action === "retry"
        ? await fetch(`/api/whatsapp/bulk-send/${job.id}/retry`, { method: "POST" })
        : await fetch(`/api/whatsapp/bulk-send/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível concluir a ação.");
      const messages = { pause: "Pausa solicitada: o envio para antes do próximo contato.", resume: "Envio retomado.", cancel: "Envio cancelado para os contatos restantes.", retry: "Novo lote criado com os contatos que falharam." };
      toast.success("Disparo", messages[action]);
      if (action === "resume" || action === "retry") window.dispatchEvent(new Event(BULK_STARTED_EVENT));
      await loadListExtras();
    } catch (err) {
      toast.error("Disparo", err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setJobBusy(null);
    }
  };

  const [sortConfig, setSortConfig] = useState<{ field: string; order: "asc" | "desc" }>({ field: "atualizacao", order: "desc" });
  const handleSort = (field: string) => {
    if (page !== 0) setPage(0);
    setSortConfig((prev) => {
      const nextOrder = prev.field === field && prev.order === "desc" ? "asc" : "desc";
      return { field, order: nextOrder };
    });
  };

  useEffect(() => {
    let active = true;
    fetch("/api/segments/audience")
      .then(async (response) => {
        const result = await response.json() as { data?: { number: number; name?: string; active: boolean }[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar as lojas.");
        if (active) setStores(result.data ?? []);
      })
      .catch((error: unknown) => {
        if (active) setStoresError(error instanceof Error ? error.message : "Não foi possível carregar as lojas.");
      });
    return () => { active = false; };
  }, []);

  const clearSelectedAttachments = useCallback(() => {
    attachmentPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    attachmentPreviewUrlsRef.current.clear();
    setAttachmentPreviewUrls(new Map());
    setSelectedAttachments([]);
  }, []);

  const audienceCriteria: AudienceCriterion[] = [
    ...presetAudienceCriteria.map((preset) => ({
      ...preset,
      inativo: savedAudienceCriteria.find((saved) => saved.id === preset.id)?.inativo === true,
    })),
    // Nome cadastrado da loja (já traz o código "LJ 12"), sem o sequencial interno.
    ...stores.map((store) => ({
      id: `store-${store.number}`,
      nome: storeDisplayName(store),
      tipo: "loja" as const,
      inativo: !store.active,
    })).sort((a, b) => compareStoreNames(a.nome, b.nome)),
    ...savedAudienceCriteria.filter((criterion) =>
      !presetAudienceCriteria.some((preset) => preset.id === criterion.id) && !criterion.id.startsWith("store-")),
  ];

  useEffect(() => () => {
    attachmentPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    attachmentPreviewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!selectedCampaign && !isCreateOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedCampaign(null);
        setIsCreateOpen(false);
        clearSelectedAttachments();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCampaign, isCreateOpen, clearSelectedAttachments]);

  // Listagem unificada: cada campanha e cada lote do pipeline é um disparo.
  const jobByCampaign = new Map(dispatchJobs.map((job) => [job.campaignId, job]));
  const rows: UnifiedRow[] = [
    ...campaigns.map((campaign): UnifiedRow => {
      const job = jobByCampaign.get(campaign.id);
      const rowStats = stats[campaign.id] ?? EMPTY_STATS;
      const total = job?.total ?? rowStats.total;
      const parsed = new Date(campaign.dataAtualizacao ?? 0).getTime();
      return {
        key: `c:${campaign.id}`,
        kind: "campaign",
        id: campaign.id,
        nome: campaign.nome,
        origem: "Campanha",
        mensagem: campaign.modelo ? `Modelo: ${campaign.modelo.name}` : "Mensagem livre",
        publico: campaign.publico,
        status: campaignDisplayStatus(campaign),
        total,
        processed: job ? job.cursor : rowStats.sent + rowStats.failed,
        stats: rowStats,
        updatedAt: Number.isNaN(parsed) ? 0 : parsed,
        updatedLabel: campaign.dataAtualizacao,
        campaign,
        job,
      };
    }),
    ...bulkJobs.map((job): UnifiedRow => ({
      key: `b:${job.id}`,
      kind: "bulk",
      id: job.id,
      nome: `Pipeline · Etapa ${job.stageName}${job.retryOf ? " (reenvio)" : ""}`,
      origem: job.userName ? `Pipeline · ${job.userName}` : "Pipeline",
      mensagem: job.templateName ? `Modelo: ${job.templateName}` : "Mensagem livre",
      publico: `Etapa ${job.stageName}`,
      status: bulkDisplayStatus(job),
      total: job.total,
      processed: job.sent + job.failed,
      stats: stats[`bulk:${job.id}`] ?? { ...EMPTY_STATS, total: job.total, sent: job.sent, failed: job.failed },
      updatedAt: new Date(job.finishedAt ?? job.createdAt).getTime(),
      updatedLabel: formatDateTime(job.finishedAt ?? job.createdAt),
      bulk: job,
    })),
  ];

  const sortedRows = [...rows].sort((a, b) => {
    const dir = sortConfig.order === "asc" ? 1 : -1;
    switch (sortConfig.field) {
      case "nome": return dir * a.nome.localeCompare(b.nome, "pt-BR");
      case "mensagem": return dir * a.mensagem.localeCompare(b.mensagem, "pt-BR");
      case "publico": return dir * a.publico.localeCompare(b.publico, "pt-BR");
      case "status": return dir * a.status.localeCompare(b.status, "pt-BR");
      case "total": return dir * (a.total - b.total);
      case "enviados": return dir * (a.stats.sent - b.stats.sent);
      case "respostas": return dir * (a.stats.replied - b.stats.replied);
      case "atualizacao": return dir * (a.updatedAt - b.updatedAt);
      default: return 0;
    }
  });

  const filteredRows = sortedRows.filter((row) => {
    const matchesSearch = `${row.nome} ${row.publico} ${row.mensagem} ${row.status}`.toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR"));
    const allowed = filterMatches[activeFilter];
    return matchesSearch && (!allowed || allowed.includes(row.status));
  });
  // Paginação na tela: a lista junta campanhas e envios do pipeline, já carregados juntos.
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selectableRows = pageRows.filter((row) => row.kind === "campaign" && row.campaign && !isDispatchLocked(row.campaign.status));

  const resetCreateForm = () => {
    setForm({ nome: "", publico: "", mensagem: "" });
    setCampaignTemplate(null);
    setSelectedAudienceSegments([]);
    clearSelectedAttachments();
    setUploadedAttachments([]);
    setFormError("");
  };

  /** Monta a campanha a partir do formulário de criação (ou devolve null com o erro na tela). */
  const buildNewCampaign = (): Campaign | null => {
    const nome = form.nome.trim();
    const publico = selectedAudienceSegments.join(", ").trim();
    const mensagem = form.mensagem.trim();
    if (!nome || !publico || !mensagem) {
      setFormError(!nome ? "Informe o nome da campanha." : !publico ? "Selecione pelo menos um segmento para o público-alvo." : "Escreva a mensagem da campanha.");
      return null;
    }
    if (isUploading) {
      setFormError("Aguarde o envio dos arquivos anexados terminar.");
      return null;
    }
    return {
      // eslint-disable-next-line react-hooks/purity -- chamado só em handlers de clique, não durante a renderização
      id: `camp-${Date.now()}`,
      nome,
      modelo: campaignTemplate,
      publico: selectedAudienceSegments.join(", "),
      audienceSegmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id),
      status: "Rascunho",
      disparos: 0,
      rotuloDisparos: "contatos no público",
      taxaResposta: 0,
      dataAtualizacao: new Date().toISOString(),
      mensagem,
      anexos: uploadedAttachments.length > 0 ? uploadedAttachments : selectedAttachments.map(({ name, size, type }) => ({ name, size, type })),
    };
  };

  /** Botão secundário: guarda a campanha pausada para editar depois. */
  const saveDraft = () => {
    const campaign = buildNewCampaign();
    if (!campaign) return;
    setCampaigns((current) => [campaign, ...current]);
    setActiveFilter("Todas");
    setSearchTerm("");
    resetCreateForm();
    setIsCreateOpen(false);
    toast.success("Rascunho salvo", `"${campaign.nome}" ficou salva para disparar depois.`);
  };

  const startEditingCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    clearSelectedAttachments();
    setSelectedAudienceSegments(campaign.publico.split(", ").filter((segment) => segmentOptionSet.has(segment)));
    setForm({ nome: campaign.nome, publico: campaign.publico, mensagem: campaign.mensagem });
    setCampaignTemplate(campaign.modelo ?? null);
    setFormError("");
  };

  const insertMessageVariable = (variable: string) => {
    const textarea = messageInputRef.current;
    const start = textarea?.selectionStart ?? form.mensagem.length;
    const end = textarea?.selectionEnd ?? form.mensagem.length;
    const mensagem = `${form.mensagem.slice(0, start)}${variable}${form.mensagem.slice(end)}`;
    setForm((current) => ({ ...current, mensagem }));
    setFormError("");
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  const [isUploading, setIsUploading] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<{ name: string; size: number; type: string; key: string; url: string }[]>([]);

  const [imageLink, setImageLink] = useState("");
  const [imageLinkLoading, setImageLinkLoading] = useState(false);

  /** Baixa a imagem de um link no navegador e anexa como arquivo (o envio para a Meta segue o mesmo caminho do upload). */
  const addImageFromLink = async () => {
    const link = imageLink.trim();
    if (!/^https?:\/\//i.test(link)) {
      setFormError("Informe o link completo da imagem, começando com https://.");
      return;
    }
    setImageLinkLoading(true);
    try {
      const response = await fetch(link, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!["image/jpeg", "image/png"].includes(blob.type)) {
        setFormError("O link precisa apontar para uma imagem JPG ou PNG.");
        return;
      }
      if (blob.size > 5 * 1024 * 1024) {
        setFormError("A imagem do link tem mais de 5 MB, o limite do WhatsApp.");
        return;
      }
      const name = decodeURIComponent(new URL(link).pathname.split("/").pop() || "") || `imagem.${blob.type === "image/png" ? "png" : "jpg"}`;
      await addAttachments([new File([blob], name, { type: blob.type })]);
      setImageLink("");
    } catch {
      setFormError("Não foi possível baixar a imagem desse link (o site pode bloquear). Salve a imagem e anexe o arquivo.");
    } finally {
      setImageLinkLoading(false);
    }
  };

  const addAttachments = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const allowedFiles = selectedFiles.filter((file) =>
      file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf");
    if (allowedFiles.length !== selectedFiles.length) {
      setFormError("Adicione apenas imagens, vídeos ou arquivos PDF.");
    } else {
      setFormError("");
    }
    if (!allowedFiles.length) return;

    const newPreviewUrls = new Map<File, string>();
    allowedFiles.forEach((file) => {
      if ((file.type.startsWith("image/") || file.type.startsWith("video/")) && !attachmentPreviewUrlsRef.current.has(file)) {
        const url = URL.createObjectURL(file);
        attachmentPreviewUrlsRef.current.set(file, url);
        newPreviewUrls.set(file, url);
      }
    });
    if (newPreviewUrls.size > 0) {
      setAttachmentPreviewUrls((current) => new Map([...current, ...newPreviewUrls]));
    }
    setSelectedAttachments((current) => [...current, ...allowedFiles]);

    setIsUploading(true);
    try {
      const formData = new FormData();
      allowedFiles.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setFormError(data.error || "Falha ao enviar arquivos.");
        return;
      }
      setUploadedAttachments((current) => [...current, ...data.files]);
    } catch {
      setFormError("Erro de conexão ao enviar arquivos.");
    } finally {
      setIsUploading(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  };

  const saveCampaign = () => {
    if (!selectedCampaign) return;
    const nome = form.nome.trim();
    const publico = selectedAudienceSegments.join(", ").trim();
    const mensagem = form.mensagem.trim();
    if (!nome || !publico || !mensagem) {
      setFormError(!nome ? "Informe o nome da campanha." : !publico ? "Selecione pelo menos um segmento para o público-alvo." : "Escreva a mensagem da campanha.");
      return;
    }
    const updatedCampaign = {
      ...selectedCampaign,
      nome,
      modelo: campaignTemplate,
      publico,
      audienceSegmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id),
      mensagem,
      dataAtualizacao: new Date().toISOString(),
    };
    setCampaigns((current) => current.map((campaign) => campaign.id === updatedCampaign.id ? updatedCampaign : campaign));
    setSelectedCampaign(updatedCampaign);
    setSelectedAudienceSegments(publico.split(", "));
    setFormError("");
    toast.success("Campanha atualizada", `"${nome}" foi salva.`);
  };

  const openCreateCampaign = () => {
    resetCreateForm();
    setDispatchEstimate(null);
    setIgnoreCooldown(false);
    setIsCreateOpen(true);
  };

  /** Abre a criação com o segmento já escolhido como público (atalho vindo de /segmentos). */
  const openCreateFromSegment = (segment: CampaignAudienceSegment | undefined) => {
    openCreateCampaign();
    if (!segment) return;
    setSelectedAudienceSegments([segment.nome]);
    setForm((current) => ({ ...current, nome: `Campanha · ${segment.nome}` }));
  };

  // Vindo de /campanhas/nova?segmentoId=…: abre a criação uma vez e depois limpa a URL.
  const newFromSegmentHandled = useRef(false);
  useEffect(() => {
    if (newFromSegmentHandled.current || segmentsLoading || searchParams.get("nova") !== "1") return;
    newFromSegmentHandled.current = true;
    openCreateFromSegment(segments.find((item) => item.id === searchParams.get("segmentoId")));
    const params = new URLSearchParams(window.location.search);
    params.delete("nova");
    params.delete("segmentoId");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez, quando os segmentos terminam de carregar
  }, [segmentsLoading, segments, searchParams]);

  /** Calcula os destinatários de cada campanha a partir dos segmentos (usado no disparo e na estimativa de custo). */
  const buildCampaignRecipients = async (readyCampaigns: Campaign[]) => {
    const groups: Record<string, AudienceCriterion[]> = {};
    const contactGroups: Record<string, string[]> = {};
    const contactCriteria: Record<string, AudienceCriterion[]> = {};
    const groupKeysByCampaign = new Map<string, string[]>();
    for (const campaign of readyCampaigns) {
      const campaignSegments = campaign.audienceSegmentIds?.length
        ? campaign.audienceSegmentIds.map((id) => segments.find((segment) => segment.id === id))
        : campaign.publico.split(", ").map((name) => segments.find((segment) => segment.nome === name));
      if (campaignSegments.length === 0 || campaignSegments.some((segment) => !segment)) {
        throw new Error(`Não foi possível localizar todos os segmentos de "${campaign.nome}". Revise o público antes de disparar.`);
      }

      const keys: string[] = [];
      for (const segment of campaignSegments as CampaignAudienceSegment[]) {
        const key = `${campaign.id}:${segment.id}`;
        keys.push(key);
        const criteria = (segment.criterios ?? []).map((name) => {
          const legacyName = name.replace(/^Loja:\s*/i, "Loja ");
          const criterion = audienceCriteria.find((candidate) => candidate.nome === name || candidate.nome === legacyName);
          if (criterion) return criterion;
          const deletedStore = /^Loja (\d+)$/i.exec(legacyName);
          return deletedStore
            ? { id: `store-${deletedStore[1]}`, nome: legacyName, tipo: "loja" as const }
            : undefined;
        });
        if (criteria.some((criterion) => !criterion)) {
          throw new Error(`Um critério usado no público de "${campaign.nome}" não existe mais. Revise o segmento antes de disparar.`);
        }
        if (segment.modoPublico === "contatos") {
          // Contatos da planilha, refinados pelos critérios do segmento (interseção) quando houver.
          contactGroups[key] = segment.contatosSelecionados ?? [];
          if (criteria.length > 0) contactCriteria[key] = criteria as AudienceCriterion[];
          continue;
        }
        groups[key] = criteria as AudienceCriterion[];
      }
      groupKeysByCampaign.set(campaign.id, keys);
    }

    const audienceResponse = await fetch("/api/segments/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups, contactGroups, contactCriteria, includeRecipients: true }),
    });
    const audienceCt = audienceResponse.headers.get("content-type") ?? "";
    if (!audienceCt.includes("application/json")) {
      throw new Error(`Resposta inválida da API (${audienceResponse.status}). Verifique se o servidor está rodando.`);
    }
    const audience = await audienceResponse.json() as {
      recipients?: Record<string, CampaignRecipient[]>;
      error?: string;
    };
    if (!audienceResponse.ok) throw new Error(audience.error || "Não foi possível calcular o público da campanha.");
    if (!audience.recipients) throw new Error("O servidor não retornou os contatos do público.");

    const recipientsByCampaign = new Map<string, CampaignRecipient[]>();
    for (const campaign of readyCampaigns) {
      const recipients = new Map<string, CampaignRecipient>();
      for (const key of groupKeysByCampaign.get(campaign.id) ?? []) {
        for (const recipient of audience.recipients[key] ?? []) recipients.set(recipient.id, recipient);
      }
      if (recipients.size === 0) throw new Error(`O público de "${campaign.nome}" não contém contatos para envio.`);
      recipientsByCampaign.set(campaign.id, [...recipients.values()]);
    }
    return recipientsByCampaign;
  };

  // Custo estimado do disparo: contatos com telefone × preço da categoria do modelo.
  const estimateDispatchCost = async (readyCampaigns: Campaign[]) => {
    setDispatchEstimate({ loading: true, contacts: 0, cost: null });
    try {
      const [recipientsByCampaign, pricingBody, templatesBody] = await Promise.all([
        buildCampaignRecipients(readyCampaigns),
        fetch("/api/metrics/pricing", { cache: "no-store" }).then((response) => response.json()) as Promise<{ data?: { marketing: number; utility: number; authentication: number } }>,
        fetch("/api/whatsapp/templates", { cache: "no-store" }).then((response) => response.json()).catch(() => ({})) as Promise<{ data?: { name: string; language: string; category?: string }[] }>,
      ]);
      const pricing = pricingBody.data;
      let contacts = 0;
      let cost: number | null = 0;
      for (const campaign of readyCampaigns) {
        const withPhone = (recipientsByCampaign.get(campaign.id) ?? []).filter((recipient) => recipient.telefone.replace(/\D/g, "").length >= 10).length;
        contacts += withPhone;
        if (!campaign.modelo) continue;
        const category = (templatesBody.data ?? []).find((item) => item.name === campaign.modelo?.name && item.language === campaign.modelo?.language)?.category?.toUpperCase();
        const unit = !pricing ? null : category === "MARKETING" ? pricing.marketing : category === "UTILITY" ? pricing.utility : category === "AUTHENTICATION" ? pricing.authentication : null;
        cost = unit === null || cost === null ? null : cost + withPhone * unit;
      }
      setDispatchEstimate({ loading: false, contacts, cost });
    } catch (error) {
      setDispatchEstimate({ loading: false, contacts: 0, cost: null, error: error instanceof Error ? error.message : "Não foi possível estimar o custo." });
    }
  };
  const estimateByIds = (ids: string[]) => estimateDispatchCost(ids.map((id) => campaigns.find((campaign) => campaign.id === id)).filter((campaign): campaign is Campaign => Boolean(campaign)));

  /** Confere carregamento dos públicos e conexão do WhatsApp antes de qualquer disparo. */
  const ensureReadyToDispatch = async () => {
    if (campaignsLoading || segmentsLoading || criteriaLoading) {
      throw new Error("Aguarde o carregamento das campanhas e dos públicos antes de disparar.");
    }
    if (storesError) throw new Error(`Não foi possível carregar as lojas usadas nos públicos: ${storesError}`);
    const connectionResponse = await fetch("/api/whatsapp/connection", { cache: "no-store" });
    const connectionCt = connectionResponse.headers.get("content-type") ?? "";
    if (!connectionCt.includes("application/json")) {
      throw new Error(`Resposta inválida da API (${connectionResponse.status}). Verifique se o servidor está rodando.`);
    }
    const connection = await connectionResponse.json() as { state?: string; error?: string };
    if (!connectionResponse.ok) throw new Error(connection.error || "Não foi possível verificar a conexão do WhatsApp.");
    if (connection.state !== "open") throw new Error("WhatsApp desconectado. Conecte a conta em Configurações antes de disparar a campanha.");
  };

  const startCampaignDispatch = async (campaign: Campaign, recipients: CampaignRecipient[]) => {
    const startResponse = await fetch("/api/campaigns/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", campaignId: campaign.id, recipients, ignoreCooldown }),
    });
    const startResult = await startResponse.json().catch(() => ({})) as { error?: string };
    if (!startResponse.ok) throw new Error(startResult.error || `Não foi possível iniciar o disparo de "${campaign.nome}".`);
  };

  /** Botão primário do assistente: cria a campanha, inicia o lote em segundo plano e abre o acompanhamento ao vivo. */
  const launchNewCampaign = async () => {
    if (isLaunching) return;
    const campaign = buildNewCampaign();
    if (!campaign) return;
    setIsLaunching(true);
    setFormError("");
    let saved = false;
    try {
      await ensureReadyToDispatch();
      const recipients = (await buildCampaignRecipients([campaign])).get(campaign.id) ?? [];
      // Persiste antes de iniciar: o servidor lê a campanha salva para montar o envio.
      await saveCampaigns([campaign, ...campaigns]);
      saved = true;
      await startCampaignDispatch(campaign, recipients);
      const refreshed = await reloadCampaigns().catch(() => null);
      resetCreateForm();
      setIsCreateOpen(false);
      setActiveFilter("Todas");
      setSearchTerm("");
      startEditingCampaign(refreshed?.find((item) => item.id === campaign.id) ?? campaign);
      void refreshAll();
      toast.success("Disparo iniciado", `"${campaign.nome}" está sendo enviada em segundo plano.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível disparar a campanha.";
      if (saved) {
        await reloadCampaigns().catch(() => null);
        resetCreateForm();
        setIsCreateOpen(false);
        toast.error("Campanha salva como rascunho", `${message} Abra a campanha na lista para tentar de novo.`);
      } else {
        setFormError(message);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  const dispatchCampaigns = async () => {
    if (!dispatchTarget || isDispatching) return;
    setIsDispatching(true);
    setDispatchError("");
    try {
      const currentCampaigns = campaigns;
      const targetCampaigns = dispatchTarget.ids.map((id) => currentCampaigns.find((campaign) => campaign.id === id));
      if (targetCampaigns.some((campaign) => !campaign)) throw new Error("Uma das campanhas selecionadas não foi encontrada. Atualize a página e tente novamente.");
      const readyCampaigns = targetCampaigns as Campaign[];
      const blocked = readyCampaigns.find((campaign) => isDispatchLocked(campaign.status));
      if (blocked) throw new Error(`"${blocked.nome}" está em envio ou já teve mensagens enviadas. Não é possível dispará-la novamente para evitar duplicidades.`);

      await ensureReadyToDispatch();
      const recipientsByCampaign = await buildCampaignRecipients(readyCampaigns);

      const started: string[] = [];
      try {
        for (const campaign of readyCampaigns) {
          await startCampaignDispatch(campaign, recipientsByCampaign.get(campaign.id) ?? []);
          started.push(campaign.nome);
        }
      } finally {
        // O servidor altera o status das campanhas; recarrega para não salvar uma versão antiga.
        const refreshed = await reloadCampaigns().catch(() => null);
        if (refreshed) setSelectedCampaign((current) => current ? refreshed.find((item) => item.id === current.id) ?? current : current);
      }

      setDispatchConfirmOpen(false);
      void refreshAll();
      toast.success(
        started.length === 1 ? "Disparo iniciado" : "Disparos iniciados",
        "O envio continua em segundo plano no servidor. Acompanhe o andamento nos detalhes da campanha.",
      );
      if (dispatchTarget.mode === "batch") setSelectedCampaignIds(new Set());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível disparar a campanha.";
      setDispatchError(message);
      toast.error("Disparo não concluído", message);
    } finally {
      setIsDispatching(false);
    }
  };

  const openDispatchConfirm = (ids: string[], mode: "single" | "batch") => {
    setDispatchTarget({ mode, ids });
    setDispatchError("");
    setIgnoreCooldown(false);
    setDispatchConfirmOpen(true);
    void estimateByIds(ids);
  };

  const openRow = (row: UnifiedRow) => {
    if (row.kind === "bulk") setBulkDetailsId(row.id);
    else if (row.campaign) startEditingCampaign(row.campaign);
  };

  if (campaignsLoading) {
    return <div className="flex h-64 items-center justify-center"><LoadingSpinner label="Carregando campanhas..." /></div>;
  }

  const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
  const ghostButton = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer";
  const primaryButton = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer";
  const iconAction = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-[#002187] transition-colors hover:border-[#002187] hover:bg-[#002187]/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer";

  // Opção por lote para enviar também a quem recebeu campanha dentro da janela de descanso (ex.: após disparos de teste).
  const cooldownToggle = cooldownDays > 0 ? (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-xs transition-colors ${ignoreCooldown ? "border-[#F7915E]/50 bg-[#F7915E]/10" : "border-slate-200 dark:border-slate-700"}`}>
      <input type="checkbox" checked={ignoreCooldown} disabled={isLaunching || isDispatching} onChange={(event) => setIgnoreCooldown(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#002187] dark:accent-[#C4D600]" />
      <span>
        <span className="block font-semibold text-slate-800 dark:text-slate-100">Ignorar intervalo mínimo de envio</span>
        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">Enviar mesmo para quem recebeu campanha nos últimos {cooldownDays} dias (ex.: contatos dos disparos de teste).</span>
      </span>
    </label>
  ) : null;

  const selectedJob = selectedCampaign ? jobByCampaign.get(selectedCampaign.id) : undefined;
  const selectedStats = selectedCampaign ? stats[selectedCampaign.id] ?? EMPTY_STATS : EMPTY_STATS;
  const selectedLocked = selectedCampaign ? isDispatchLocked(selectedCampaign.status) : false;
  const selectedDisplay = selectedCampaign ? campaignDisplayStatus(selectedCampaign) : "Rascunho";

  return (
    <div>
      <div className="space-y-4 pb-10">
        {campaignsError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{campaignsError}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block w-full sm:w-72 md:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} aria-label="Buscar campanhas" placeholder="Buscar campanha, modelo ou público" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
          </label>
          <div role="tablist" aria-label="Filtrar campanhas" className="flex flex-wrap gap-1.5">
            {filters.map((filter) => {
              const allowed = filterMatches[filter];
              const count = allowed ? rows.filter((row) => allowed.includes(row.status)).length : rows.length;
              return (
                <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} onClick={() => setActiveFilter(filter)} className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer ${activeFilter === filter ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"}`}>
                  {filter}<span className={`text-[10px] ${activeFilter === filter ? "opacity-75" : "text-slate-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => { void reloadCampaigns(); void refreshAll(); }} aria-label="Atualizar lista" title="Atualizar lista" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button type="button" onClick={openCreateCampaign} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#051647] px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer">
              <Plus className="h-4 w-4" />
              Nova campanha
            </button>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left">
              <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800/40">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <button
                      type="button"
                      aria-label={selectableRows.length > 0 && selectableRows.every((row) => selectedCampaignIds.has(row.id)) ? "Desmarcar todas as campanhas" : "Selecionar todas as campanhas"}
                      onClick={() => {
                        const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedCampaignIds.has(row.id));
                        setSelectedCampaignIds((prev) => {
                          const next = new Set(prev);
                          if (allSelected) selectableRows.forEach((row) => next.delete(row.id));
                          else selectableRows.forEach((row) => next.add(row.id));
                          return next;
                        });
                      }}
                      className="grid h-4 w-4 place-items-center rounded border border-slate-300 text-[#051647] transition-colors hover:border-[#002187] dark:border-slate-600 dark:text-[#C4D600] dark:hover:border-[#C4D600] cursor-pointer"
                    >
                      {selectableRows.length > 0 && selectableRows.every((row) => selectedCampaignIds.has(row.id)) && <SquareCheck className="h-3.5 w-3.5 fill-current" />}
                    </button>
                  </th>
                  <th className="px-4 py-3"><button type="button" onClick={() => handleSort("nome")} className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Campanha{sortIcon(sortConfig, "nome")}</button></th>
                  <th className="px-4 py-3"><button type="button" onClick={() => handleSort("mensagem")} className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Modelo / mensagem{sortIcon(sortConfig, "mensagem")}</button></th>
                  <th className="px-4 py-3"><button type="button" onClick={() => handleSort("publico")} className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Segmento{sortIcon(sortConfig, "publico")}</button></th>
                  <th className="px-4 py-3"><button type="button" onClick={() => handleSort("status")} className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Status{sortIcon(sortConfig, "status")}</button></th>
                  <th className="w-44 px-4 py-3"><button type="button" onClick={() => handleSort("total")} className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Progresso / total{sortIcon(sortConfig, "total")}</button></th>
                  <th className="px-4 py-3"><button type="button" onClick={() => handleSort("enviados")} className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Enviados · Entregues · Lidos · Respostas{sortIcon(sortConfig, "enviados")}</button></th>
                  <th className="px-4 py-3"><button type="button" onClick={() => handleSort("atualizacao")} className="inline-flex items-center gap-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Atualização{sortIcon(sortConfig, "atualizacao")}</button></th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((row) => {
                  const selectable = row.kind === "campaign" && row.campaign !== undefined && !isDispatchLocked(row.campaign.status);
                  const isSelected = selectable && selectedCampaignIds.has(row.id);
                  const percent = row.total > 0 ? Math.min(100, Math.round((row.processed / row.total) * 100)) : 0;
                  const busy = jobBusy === row.id;
                  const bulk = row.bulk;
                  return (
                    <tr
                      key={row.key}
                      tabIndex={0}
                      aria-label={`Abrir detalhes de ${row.nome}`}
                      onClick={() => openRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRow(row);
                        }
                      }}
                      className={`group cursor-pointer transition-colors hover:bg-slate-50/80 focus-visible:outline-2 focus-visible:outline-[#002187] dark:hover:bg-slate-800/30 dark:focus-visible:outline-[#C4D600] ${isSelected ? "bg-[#C4D600]/10 dark:bg-[#C4D600]/10" : ""}`}
                    >
                      <td className="px-3 py-2 xl:py-3.5" onClick={(event) => event.stopPropagation()}>
                        {selectable && (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={`Selecionar campanha ${row.nome}`}
                            onClick={() => {
                              setSelectedCampaignIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              });
                            }}
                            className={`grid h-4 w-4 place-items-center rounded border transition-colors cursor-pointer ${isSelected ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-300 text-transparent hover:border-[#002187] dark:border-slate-600 dark:text-transparent dark:hover:border-[#C4D600]"}`}
                          >
                            <SquareCheck className="h-3.5 w-3.5 fill-current" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 xl:py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><WhatsAppIcon className="h-4 w-4 fill-current" /></span>
                          <span className="min-w-0"><span className="block max-w-56 truncate text-xs font-semibold text-slate-900 group-hover:text-[#002187] dark:text-white dark:group-hover:text-[#C4D600]">{row.nome}</span><span className="mt-0.5 block text-[10px] text-slate-400">{row.origem}</span></span>
                        </div>
                      </td>
                      <td className="max-w-48 truncate px-4 py-2 xl:py-3.5 text-xs text-slate-600 dark:text-slate-300" title={row.mensagem}>{row.mensagem}</td>
                      <td className="max-w-48 truncate px-4 py-2 xl:py-3.5 text-xs text-slate-600 dark:text-slate-300" title={row.publico}>{row.publico || "—"}</td>
                      <td className="px-4 py-2 xl:py-3.5"><span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${displayStyles[row.status]}`}>{row.status === "Enviando" && <RefreshCw className="h-3 w-3 animate-spin" />}{row.status}</span></td>
                      <td className="px-4 py-2 xl:py-3.5">
                        {row.total > 0 ? (
                          <div className="space-y-1">
                            <ProgressBar percent={percent} tone={row.status === "Pausado" ? "paused" : "default"} />
                            <p className="text-[10px] text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-700 dark:text-slate-200">{percent}%</span> · {int(row.processed)} de {int(row.total)} contatos</p>
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2 xl:py-3.5">
                        <div className="flex items-center gap-3 text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1" title="Enviados"><Send className="h-3 w-3 text-slate-400" />{int(row.stats.sent)}</span>
                          <span className="inline-flex items-center gap-1" title="Entregues"><CheckCheck className="h-3 w-3 text-slate-400" />{int(row.stats.delivered)}</span>
                          <span className="inline-flex items-center gap-1" title="Lidos"><Eye className="h-3 w-3 text-slate-400" />{int(row.stats.read)}</span>
                          <span className="inline-flex items-center gap-1" title="Respostas"><MessageCircleReply className="h-3 w-3 text-slate-400" />{int(row.stats.replied)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 xl:py-3.5 text-xs text-slate-500 dark:text-slate-400">{row.kind === "campaign" && row.updatedAt > 0 ? formatDateTime(new Date(row.updatedAt).toISOString()) : row.updatedLabel}</td>
                      <td className="px-4 py-2 xl:py-3.5 text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          {row.kind === "campaign" && row.campaign && (
                            row.job?.status === "running" ? (
                              <button type="button" disabled={busy} onClick={() => void controlDispatch(row.id, "pause")} aria-label={`Pausar ${row.nome}`} title="Pausar disparo" className={iconAction}><Pause className="h-3.5 w-3.5" /></button>
                            ) : row.job?.status === "paused" ? (
                              <button type="button" disabled={busy} onClick={() => void controlDispatch(row.id, "resume")} aria-label={`Retomar ${row.nome}`} title="Retomar disparo" className={iconAction}><Play className="h-3.5 w-3.5" /></button>
                            ) : !isDispatchLocked(row.campaign.status) ? (
                              <button type="button" disabled={isDispatching} onClick={() => openDispatchConfirm([row.id], "single")} aria-label={`Disparar ${row.nome}`} title="Disparar agora" className={iconAction}><Send className="h-3.5 w-3.5" /></button>
                            ) : null
                          )}
                          {bulk && bulk.status === "running" && <button type="button" disabled={busy} onClick={() => void controlBulk(bulk, "pause")} aria-label="Pausar lote" title="Pausar" className={iconAction}><Pause className="h-3.5 w-3.5" /></button>}
                          {bulk && bulk.status === "paused" && <button type="button" disabled={busy} onClick={() => void controlBulk(bulk, "resume")} aria-label="Retomar lote" title="Retomar" className={iconAction}><Play className="h-3.5 w-3.5" /></button>}
                          {bulk && (bulk.status === "running" || bulk.status === "paused") && <button type="button" disabled={busy} onClick={() => void controlBulk(bulk, "cancel")} aria-label="Cancelar lote" title="Cancelar" className={`${iconAction} text-red-600! dark:text-red-400!`}><XCircle className="h-3.5 w-3.5" /></button>}
                          {bulk && (bulk.status === "completed" || bulk.status === "cancelled") && bulk.failed > 0 && <button type="button" disabled={busy} onClick={() => void controlBulk(bulk, "retry")} aria-label="Reenviar falhas" title="Reenviar falhas" className={iconAction}><RotateCcw className="h-3.5 w-3.5" /></button>}
                          <button type="button" onClick={() => openRow(row)} aria-label={`Ver detalhes de ${row.nome}`} title="Ver detalhes" className={iconAction}><Eye className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={9} className="px-5 py-14 text-center">
                    <Search className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{rows.length === 0 ? "Nenhuma campanha ainda" : "Nenhuma campanha encontrada"}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{rows.length === 0 ? "Clique em Nova campanha para criar e disparar o primeiro envio." : "Tente mudar a busca ou o filtro."}</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={filteredRows.length}
              noun={filteredRows.length === 1 ? "campanha" : "campanhas"}
              onChange={setPage}
              pageSizes={PAGE_SIZES}
              onPageSizeChange={setPageSize}
              edges
              className=""
            />
            {(hasActiveJob || filteredRows.length !== rows.length) && (
              <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                {filteredRows.length !== rows.length && <span>{rows.length} no total, sem filtros</span>}
                {hasActiveJob && <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Atualizando ao vivo</span>}
              </p>
            )}
          </footer>
        </section>
      </div>

      {isCreateOpen && (
        <EntityDialog
          titleId="campaign-create-title"
          title="Nova campanha"
          description="Configure, revise e dispare. O envio roda em segundo plano no servidor."
          size="wizard"
          onClose={() => { if (isLaunching) return; setIsCreateOpen(false); resetCreateForm(); }}
        >
          <Stepper
            initialStep={1}
            onStepChange={(step) => {
              setFormError("");
              if (step === 4) {
                const draft = buildNewCampaign();
                if (draft) void estimateDispatchCost([draft]);
              }
            }}
            onFinalStepCompleted={() => void launchNewCampaign()}
            validateStep={(step) => {
              if (step === 1 && !form.nome.trim()) {
                setFormError("Informe o nome da campanha.");
                return false;
              }
              if (step === 2 && selectedAudienceSegments.length === 0) {
                setFormError("Selecione pelo menos um segmento para o público-alvo.");
                return false;
              }
              if (step === 3 && !form.mensagem.trim()) {
                setFormError("Escreva a mensagem da campanha.");
                return false;
              }
              if (step === 3 && isUploading) {
                setFormError("Aguarde o envio dos arquivos anexados terminar.");
                return false;
              }
              setFormError("");
              return true;
            }}
            backButtonText="Voltar"
            nextButtonText="Continuar"
            completeButtonText={isLaunching ? "Disparando..." : "Disparar agora"}
            nextButtonProps={{ disabled: isLaunching }}
            backButtonProps={{ disabled: isLaunching }}
            lastStepSecondaryAction={(
              <button type="button" disabled={isLaunching} onClick={saveDraft} className="inline-flex h-[38px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer">
                Salvar como rascunho
              </button>
            )}
            indicator="numbers"
            orientation="horizontal"
            transition="slide"
            linear
            showFooter
            theme={isDark ? "dark" : "light"}
            accentColor="#C4D600"
            frame={false}
            radius={16}
            width="100%"
            className="min-h-0 flex-1"
          >
            <Step title="Identificação" description="Nome da campanha">
              <div className="space-y-4">
                <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Identifique sua campanha</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Escolha um nome para encontrá-la depois.</p></div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome da campanha <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className={inputClass} /></label>
                {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
              </div>
            </Step>
            <Step title="Público" description="Quem receberá">
              <div className="space-y-4">
                <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Defina o público</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Selecione um ou mais segmentos salvos para receber a campanha.</p></div>
                <FormMultiSelect
                  label="Público-alvo"
                  selected={selectedAudienceSegments}
                  options={segmentOptions}
                  onChange={(segmentNames) => { setSelectedAudienceSegments(segmentNames); setFormError(""); }}
                  placeholder="Selecione os segmentos"
                  required
                />
                {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
              </div>
            </Step>
            <Step title="Mensagem" description="Modelo e mídia">
              <div className="space-y-3">
                <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Escolha o modelo ou escreva a mensagem</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Modelos aprovados pela Meta podem ter imagem no cabeçalho.</p></div>
                <CampaignTemplatePicker value={campaignTemplate} onChange={changeCampaignTemplate} />
                {!campaignTemplate && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Variáveis de personalização</p>
                  <div className="flex flex-wrap gap-1.5">
                    {messageVariables.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertMessageVariable(item.value)}
                        className="rounded-lg border border-[#002187]/20 bg-[#002187]/5 px-2.5 py-1.5 text-[10px] font-semibold text-[#002187] transition-colors hover:bg-[#C4D600]/30 dark:border-[#C4D600]/30 dark:bg-[#C4D600]/10 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/20 cursor-pointer"
                        title={`Inserir ${item.value}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400">Clique em uma variável para inseri-la no ponto selecionado da mensagem.</p>
                </div>
                )}
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Mensagem <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span>
                  <textarea ref={messageInputRef} rows={4} value={form.mensagem} readOnly={Boolean(campaignTemplate)} onChange={(event) => { setForm({ ...form, mensagem: event.target.value }); setFormError(""); }} className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
                </label>
                <div className="space-y-2">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/*,video/*,application/pdf"
                    multiple
                    className="hidden"
                    aria-label="Adicionar imagens, vídeos ou PDFs"
                    onChange={(event) => addAttachments(event.currentTarget.files)}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Imagem ou mídia {isUploading && <span className="font-normal text-slate-400">(enviando...)</span>}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Imagens, vídeos ou PDFs</p>
                    </div>
                    <button type="button" onClick={() => attachmentInputRef.current?.click()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer">
                      <Paperclip className="h-3.5 w-3.5" />Adicionar arquivo
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={imageLink}
                      onChange={(event) => setImageLink(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addImageFromLink(); } }}
                      placeholder="Ou cole o link de uma imagem (JPG ou PNG)"
                      aria-label="Link da imagem"
                      className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                    />
                    <button type="button" disabled={!imageLink.trim() || imageLinkLoading} onClick={() => void addImageFromLink()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-[#002187] hover:bg-[#002187]/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer">
                      <ImageIcon className="h-3.5 w-3.5" />{imageLinkLoading ? "Baixando..." : "Usar link"}
                    </button>
                  </div>
                  {selectedAttachments.length > 0 && (
                    <ul aria-label="Arquivos selecionados" className="max-h-16 space-y-1 overflow-y-auto">
                      {selectedAttachments.map((file, index) => {
                        const FileIcon = file.type.startsWith("image/") ? ImageIcon : file.type.startsWith("video/") ? Film : FileText;
                        return (
                          <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                            <FileIcon className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                            <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-700 dark:text-slate-200" title={file.name}>{file.name}</span>
                            <span className="shrink-0 text-[10px] text-slate-400">{formatFileSize(file.size)}</span>
                            <button type="button" aria-label={`Remover arquivo ${file.name}`} onClick={() => {
                              const previewUrl = attachmentPreviewUrlsRef.current.get(file);
                              if (previewUrl) {
                                URL.revokeObjectURL(previewUrl);
                                attachmentPreviewUrlsRef.current.delete(file);
                                setAttachmentPreviewUrls((current) => {
                                  const next = new Map(current);
                                  next.delete(file);
                                  return next;
                                });
                              }
                              setSelectedAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index));
                            }} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <section aria-label="Prévia para o destinatário" className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Prévia para o destinatário</p>
                  <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-900/60">
                    {selectedAttachments.length > 0 || form.mensagem.trim() ? (
                      <div className="flex justify-end">
                        <div className="w-fit max-w-[90%] space-y-2 rounded-xl rounded-br-sm bg-[#C4D600]/20 p-2.5 text-sm text-[#051647] shadow-sm dark:bg-[#C4D600]/15 dark:text-slate-100">
                          {campaignTemplate?.hasImage && campaignTemplate.headerImageUrl && !selectedAttachments.some((file) => ["image/jpeg", "image/png"].includes(file.type)) && (
                            <div className="overflow-hidden rounded-lg bg-white/80 dark:bg-[#051647]/70">
                              {/* eslint-disable-next-line @next/next/no-img-element -- imagem hospedada pela Meta */}
                              <img src={campaignTemplate.headerImageUrl} alt="Imagem do cabeçalho do modelo" className="aspect-[1.91/1] w-72 max-w-full object-cover" />
                            </div>
                          )}
                          {selectedAttachments.map((file, index) => {
                            const previewUrl = attachmentPreviewUrls.get(file);
                            return (
                              <div key={`${file.name}-${file.lastModified}-${index}`} className="overflow-hidden rounded-lg bg-white/80 dark:bg-[#051647]/70">
                                {file.type.startsWith("image/") && previewUrl ? (
                                  <Image
                                    src={previewUrl}
                                    alt={file.name}
                                    width={480}
                                    height={320}
                                    unoptimized
                                    className="max-h-48 w-full object-contain"
                                  />
                                ) : file.type.startsWith("video/") && previewUrl ? (
                                  <video src={previewUrl} controls className="max-h-48 w-full" aria-label={file.name}>
                                    Seu navegador não oferece suporte à reprodução de vídeo.
                                  </video>
                                ) : (
                                  <div className="flex max-w-72 items-center gap-2.5 p-3">
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#002187]/10 text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">
                                      {file.type.startsWith("video/") ? <Film className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block truncate text-xs font-semibold" title={file.name}>{file.name}</span>
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Documento · {formatFileSize(file.size)}</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {form.mensagem.trim() && <p className="whitespace-pre-wrap break-words">{form.mensagem.trim()}</p>}
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-400 dark:bg-slate-800/80 dark:text-slate-500">
                        A mensagem e os arquivos aparecerão aqui.
                      </p>
                    )}
                  </div>
                </section>
                {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
              </div>
            </Step>
            <Step title="Disparo" description="Revise e envie">
              <div className="space-y-4">
                <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Revise e dispare</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ao disparar, o envio começa em segundo plano e você acompanha o progresso ao vivo.</p></div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"><dt className="text-[10px] font-semibold uppercase text-slate-400">Campanha</dt><dd className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{form.nome || "—"}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"><dt className="text-[10px] font-semibold uppercase text-slate-400">Segmento</dt><dd className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{selectedAudienceSegments.join(", ") || "—"}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"><dt className="text-[10px] font-semibold uppercase text-slate-400">Modelo / mensagem</dt><dd className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{campaignTemplate ? campaignTemplate.name : "Mensagem livre"}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"><dt className="text-[10px] font-semibold uppercase text-slate-400">Mídia</dt><dd className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{selectedAttachments.length > 0 ? `${selectedAttachments.length} arquivo(s)` : campaignTemplate?.hasImage ? "Imagem do modelo" : "Sem mídia"}</dd></div>
                </dl>
                <div className="rounded-xl border border-[#C4D600]/40 bg-[#C4D600]/10 p-3 text-xs text-slate-700 dark:text-slate-200">
                  {!dispatchEstimate || dispatchEstimate.loading ? (
                    <span className="inline-flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Calculando público e custo estimado...</span>
                  ) : dispatchEstimate.error ? (
                    <span className="text-[#9a3d12] dark:text-[#F7915E]">{dispatchEstimate.error}</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                      <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /><b>{int(dispatchEstimate.contacts)}</b> contato(s) com telefone</span>
                      <span>Custo estimado: <b>{dispatchEstimate.cost === null ? "indisponível" : dispatchEstimate.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></span>
                      {cooldownDays > 0 && !ignoreCooldown && <span className="w-full text-[10px] text-slate-500 dark:text-slate-400">Quem recebeu campanha nos últimos {cooldownDays} dias é pulado, então o valor real tende a ser menor.</span>}
                    </div>
                  )}
                </div>
                {cooldownToggle}
                {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{formError}</p>}
              </div>
            </Step>
          </Stepper>
        </EntityDialog>
      )}

      {selectedCampaign && (
        <EntityDialog
          titleId="campaign-dialog-title"
          title={selectedCampaign.nome}
          description={selectedLocked ? "Acompanhe o envio, o funil de conversão e o status de cada contato." : "Edite e dispare quando estiver pronta."}
          size="2xl"
          onClose={() => { setSelectedCampaign(null); clearSelectedAttachments(); setUploadedAttachments([]); setFormError(""); }}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
                <section aria-label="Andamento do disparo" className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${displayStyles[selectedDisplay]}`}>{selectedDisplay === "Enviando" && <RefreshCw className="h-3 w-3 animate-spin" />}{selectedDisplay}</span>
                    {selectedJob && (selectedJob.status === "running" || selectedJob.status === "paused") && (
                      <div className="flex items-center gap-2">
                        {selectedJob.status === "paused" ? (
                          <button type="button" disabled={jobBusy === selectedCampaign.id} onClick={() => void controlDispatch(selectedCampaign.id, "resume")} className={primaryButton}><Play className="h-3.5 w-3.5" />Retomar</button>
                        ) : (
                          <button type="button" disabled={jobBusy === selectedCampaign.id} onClick={() => void controlDispatch(selectedCampaign.id, "pause")} className={ghostButton}><Pause className="h-3.5 w-3.5" />Pausar</button>
                        )}
                        <button type="button" disabled={jobBusy === selectedCampaign.id} onClick={() => { if (window.confirm("Cancelar este disparo? Os contatos restantes não receberão a mensagem.")) void controlDispatch(selectedCampaign.id, "cancel"); }} className={`${ghostButton} text-red-600 dark:text-red-400`}><XCircle className="h-3.5 w-3.5" />Cancelar</button>
                      </div>
                    )}
                  </div>
                  {selectedJob ? (
                    <div className="mt-3 space-y-1.5">
                      <ProgressBar percent={selectedJob.total > 0 ? Math.round((selectedJob.cursor / selectedJob.total) * 100) : 0} tone={selectedJob.status === "paused" ? "paused" : "default"} />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {int(selectedJob.cursor)} de {int(selectedJob.total)} contatos processados · {int(selectedJob.sent)} enviadas · {int(selectedJob.failed)} falhas
                        {selectedJob.skipped > 0 && ` · ${int(selectedJob.skipped)} pulados (receberam campanha nos últimos ${cooldownDays} dias)`}
                      </p>
                      {selectedJob.status === "paused" && selectedJob.pause && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{selectedJob.pause.message}</p>}
                      {selectedJob.errors.length > 0 && (
                        <details className="text-[11px] text-slate-500 dark:text-slate-400">
                          <summary className="cursor-pointer">Ver últimas falhas ({selectedJob.failed})</summary>
                          <ul className="mt-1 list-inside list-disc space-y-0.5">{selectedJob.errors.slice(0, 5).map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>
                        </details>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">{selectedLocked ? "Disparo registrado." : "Esta campanha ainda não foi disparada."}</p>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: "Enviados", value: selectedStats.sent, icon: Send, base: selectedStats.sent },
                      { label: "Entregues", value: selectedStats.delivered, icon: CheckCheck, base: selectedStats.sent },
                      { label: "Lidos", value: selectedStats.read, icon: Eye, base: selectedStats.delivered },
                      { label: "Respostas", value: selectedStats.replied, icon: MessageCircleReply, base: selectedStats.delivered },
                    ].map((step) => {
                      const Icon = step.icon;
                      return (
                        <div key={step.label} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                          <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400"><Icon className="h-3 w-3" />{step.label}</p>
                          <p className="mt-1 text-base font-bold tabular-nums text-slate-900 dark:text-white">{int(step.value)}</p>
                          <p className="text-[10px] text-slate-400">{step.label !== "Enviados" && step.base > 0 ? `${Math.round((step.value / step.base) * 100)}%` : " "}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {selectedLocked ? (
                  <section aria-label="Conteúdo enviado" className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Conteúdo enviado</p>
                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div><dt className="text-[10px] font-semibold uppercase text-slate-400">Segmento</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{selectedCampaign.publico || "—"}</dd></div>
                      <div><dt className="text-[10px] font-semibold uppercase text-slate-400">Modelo</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{selectedCampaign.modelo ? `${selectedCampaign.modelo.name} (${selectedCampaign.modelo.language})` : "Mensagem livre"}</dd></div>
                    </dl>
                    <div className="flex justify-end rounded-xl bg-slate-100 p-3 dark:bg-slate-900/60">
                      <div className="w-fit max-w-[90%] space-y-2 rounded-xl rounded-br-sm bg-[#C4D600]/20 p-2.5 text-sm text-[#051647] shadow-sm dark:bg-[#C4D600]/15 dark:text-slate-100">
                        {(selectedCampaign.anexos ?? []).filter((file) => file.type.startsWith("image/") && file.url).slice(0, 1).map((file) => (
                          // eslint-disable-next-line @next/next/no-img-element -- arquivo enviado pelo CRM
                          <img key={file.url} src={file.url} alt={file.name} className="max-h-48 w-72 max-w-full rounded-lg object-cover" />
                        ))}
                        {!(selectedCampaign.anexos ?? []).some((file) => file.type.startsWith("image/") && file.url) && selectedCampaign.modelo?.hasImage && selectedCampaign.modelo.headerImageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem hospedada pela Meta
                          <img src={selectedCampaign.modelo.headerImageUrl} alt="Imagem do cabeçalho do modelo" className="aspect-[1.91/1] w-72 max-w-full rounded-lg object-cover" />
                        )}
                        <p className="whitespace-pre-wrap break-words">{selectedCampaign.mensagem}</p>
                      </div>
                    </div>
                    {selectedCampaign.anexos && selectedCampaign.anexos.length > 0 && (
                      <ul className="space-y-0.5">
                        {selectedCampaign.anexos.map((file, index) => (
                          <li key={`${file.name}-${index}`} className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={file.name}><Paperclip className="mr-1 inline h-3 w-3" />{file.name} · {formatFileSize(file.size)}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : (
                  <section aria-label="Configuração da campanha" className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Configuração</p>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome da campanha <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className={inputClass} /></label>
                    <FormMultiSelect
                      label="Público-alvo"
                      selected={selectedAudienceSegments}
                      options={segmentOptions}
                      onChange={(segmentNames) => { setSelectedAudienceSegments(segmentNames); setFormError(""); }}
                      placeholder="Selecione os segmentos"
                      required
                    />
                    <CampaignTemplatePicker value={campaignTemplate} onChange={changeCampaignTemplate} />
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Mensagem <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><textarea rows={5} value={form.mensagem} readOnly={Boolean(campaignTemplate)} onChange={(event) => { setForm({ ...form, mensagem: event.target.value }); setFormError(""); }} className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                    {selectedCampaign.anexos && selectedCampaign.anexos.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Arquivos da campanha</p>
                        {selectedCampaign.anexos.map((file, index) => (
                          <p key={`${file.name}-${index}`} className="truncate text-xs text-slate-500 dark:text-slate-400" title={file.name}>{file.name} · {formatFileSize(file.size)}</p>
                        ))}
                      </div>
                    )}
                    {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                  </section>
                )}

                {(selectedCampaign.disparos > 0 || selectedStats.total > 0) && (
                  <section aria-label="Custos, funil e vendas" className="space-y-2">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Custos, conversão e vendas no ERP</p>
                    <CampaignMetricsPanel type="campaign" id={selectedCampaign.id} />
                  </section>
                )}
              </div>

              <div className="min-h-[360px] lg:min-h-0">
                <CampaignRecipientsLog campaignId={selectedCampaign.id} live={selectedJob?.status === "running"} />
              </div>
            </div>

            <footer className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><Clock3 className="h-3.5 w-3.5" />Atualizada em {(() => { const time = new Date(selectedCampaign.dataAtualizacao).getTime(); return Number.isNaN(time) ? selectedCampaign.dataAtualizacao : formatDateTime(selectedCampaign.dataAtualizacao); })()}</span>
              {!selectedLocked && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={saveCampaign} className={ghostButton}>Salvar alterações</button>
                  <button type="button" disabled={isDispatching} onClick={() => openDispatchConfirm([selectedCampaign.id], "single")} className={primaryButton}><Send className="h-3.5 w-3.5" />Disparar agora</button>
                </div>
              )}
            </footer>
          </div>
        </EntityDialog>
      )}

      {bulkDetailsId && <BulkJobDetailsDialog jobId={bulkDetailsId} onClose={() => setBulkDetailsId(null)} />}

      {/* Barra de ações em lote */}
      {selectedCampaignIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {selectedCampaignIds.size} campanha{selectedCampaignIds.size === 1 ? "" : "s"} selecionada{selectedCampaignIds.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setSelectedCampaignIds(new Set())}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />Limpar
          </button>
          <button
            type="button"
            disabled={isDispatching}
            onClick={() => openDispatchConfirm(Array.from(selectedCampaignIds), "batch")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#051647] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />Disparar selecionadas
          </button>
        </div>
      )}

      {/* Confirmação de disparo de campanhas já salvas (rascunhos) */}
      {dispatchConfirmOpen && dispatchTarget && (
        <EntityDialog
          titleId="campaign-dispatch-confirm"
          title={dispatchTarget.mode === "single" ? "Disparar campanha" : `Disparar ${dispatchTarget.ids.length} campanhas`}
          description="O envio roda no servidor: você pode fechar a página e acompanhar depois."
          size="sm"
          onClose={() => { if (!isDispatching) setDispatchConfirmOpen(false); }}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F7915E]/15 text-[#F7915E]">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dispatchTarget.mode === "single"
                  ? "A campanha será enviada imediatamente para o público configurado."
                  : "As campanhas selecionadas serão enviadas imediatamente para seus respectivos públicos."}
              </p>
            </div>
            {dispatchEstimate && (
              <p className="rounded-lg border border-[#C4D600]/40 bg-[#C4D600]/10 p-3 text-xs text-slate-700 dark:text-slate-200">
                {dispatchEstimate.loading
                  ? "Calculando o custo estimado do envio..."
                  : dispatchEstimate.error
                    ? `Custo estimado indisponível: ${dispatchEstimate.error}`
                    : <><span className="font-semibold">Custo estimado do envio: {dispatchEstimate.cost === null ? "indisponível (categoria do modelo não encontrada)" : dispatchEstimate.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span> · {int(dispatchEstimate.contacts)} contato(s) com telefone.{cooldownDays > 0 && !ignoreCooldown && ` Contatos que receberam campanha nos últimos ${cooldownDays} dias são pulados, então o valor real tende a ser menor.`}</>}
              </p>
            )}
            {cooldownToggle}
            {dispatchError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{dispatchError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button type="button" disabled={isDispatching} onClick={() => setDispatchConfirmOpen(false)} className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer">
                {dispatchError ? "Fechar" : "Cancelar"}
              </button>
              {!dispatchError && (
                <button type="button" disabled={isDispatching} onClick={() => void dispatchCampaigns()} className={primaryButton}>
                  {isDispatching ? <><Clock3 className="h-3.5 w-3.5 animate-spin" />Disparando...</> : <><Send className="h-3.5 w-3.5" />Confirmar disparo</>}
                </button>
              )}
            </div>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
