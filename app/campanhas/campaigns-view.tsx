"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pagination } from "@/components/dashboard/DashboardKit";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  Repeat,
  ChevronUp,
  ChevronsUpDown,
  Clock3,
  Eye,
  FileText,
  Headset,
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
  Sparkles,
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
import { AudienceOverlapNotice } from "@/components/AudienceOverlapNotice";
import { Calculator, Pencil } from "lucide-react";
import { DispatchCostCalculator } from "@/components/DispatchCostCalculator";
import { useMetaPricing } from "@/hooks/useMetaPricing";
import { dedupeRecipients, summarizeSegmentOverlap, type SegmentOverlapSummary } from "@/lib/campaign-audience";
import type { CampaignCadence, CampaignFollowUp, CampaignSendWindow } from "@/lib/campaign-schedule";
import { sortCampaignRows, type CampaignSortField } from "@/lib/campaign-sort";
import { MAX_SCHEDULE_DAYS, PARAM_FIELDS, fieldLabel, fixedText, isFixedParam, outsideSendWindow, parseSchedule, renderPreview, validateWizardStep, type AudienceSummary, type WizardState } from "@/lib/campaign-wizard";
import { addDays, brDay } from "@/lib/br-time";
import { AiPopover, AudienceSummaryCard, ChannelCard, ReviewItem, WhatsAppPreview, WizardSection, type PreviewMedia } from "@/components/campaigns/CampaignWizardParts";

type CampaignStatus = "Ativa" | "Pronta para envio" | "Agendada" | "Pausada" | "Rascunho" | "Enviando" | "Envio pausado" | "Enviada" | "Envio parcial" | "Falha no envio" | "Aguardando aprovação Meta" | "Rejeitada pela Meta" | "Falha na submissão" | "Modelo indisponível na Meta";
// "Agendada": já tem disparo criado esperando a hora (cancelar devolve para "Pronta para envio").
const isDispatchLocked = (status: CampaignStatus) => status === "Enviando" || status === "Envio pausado" || status === "Enviada" || status === "Envio parcial" || status === "Agendada";
const isDispatchBlocked = (campaign: Campaign) => isDispatchLocked(campaign.status) || Boolean(campaign.metaApprovalStatus && campaign.metaApprovalStatus !== "APPROVED");

/** Status exibido na listagem unificada (campanhas e lotes do pipeline). */
type DisplayStatus = "Rascunho" | "Pronta" | "Agendado" | "Aguardando Meta" | "Rejeitada pela Meta" | "Enviando" | "Pausado" | "Concluído" | "Parcial" | "Falha" | "Cancelado";
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
  combinar?: "all" | "any";
}

interface CampaignTemplateDraft {
  category: "MARKETING" | "UTILITY";
  headerFormat: "NONE" | "TEXT";
  headerText: string;
  body: string;
  footer: string;
  params: string[];
  examples: string[];
  buttons: { type: "QUICK_REPLY"; text: string }[];
}

interface CampaignRecipient {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  segmento: string;
  /** Segmentos da campanha em que o contato aparece (ele recebe uma única mensagem). */
  origens?: string[];
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
  duplicatesRemoved?: number;
  coldRemoved?: number;
  errors: string[];
  pause?: { kind: string; code?: number; message: string };
  scheduledAt?: string;
  startedAt?: string;
}

interface Campaign {
  id: string;
  nome: string;
  publico: string;
  audienceSegmentIds?: string[];
  criteriaFilters?: AudienceCriterion[];
  objective?: string;
  audienceDescription?: string;
  metaCategory?: "MARKETING" | "UTILITY";
  metaApprovalStatus?: string;
  metaApprovalReason?: string;
  metaTemplateId?: string;
  metaTemplateDraft?: CampaignTemplateDraft;
  status: CampaignStatus;
  disparos: number;
  rotuloDisparos: string;
  taxaResposta: number;
  dataAtualizacao: string;
  mensagem: string;
  anexos?: { name: string; size: number; type: string; key?: string; url?: string }[];
  modelo?: CampaignTemplate | null;
  /** Atendimento ao responder: false = direto para a fila humana (IA não responde). Ausente = IA atende. */
  aiAutoReplyEnabled?: boolean;
  /** Ritmo, janela de horário, follow-up e janela de atribuição de vendas (opcionais). */
  cadence?: CampaignCadence | null;
  sendWindow?: CampaignSendWindow | null;
  followUp?: CampaignFollowUp | null;
  attributionWindowDays?: number | null;
  /** Exclui do disparo quem não leu nem respondeu as últimas X campanhas (leads frios). */
  excludeColdLeads?: number | null;
  /** Campanha de reenvio para não engajados: id da campanha original. */
  resendOf?: string;
}

type DeliverySettings = Pick<Campaign, "cadence" | "sendWindow" | "followUp" | "attributionWindowDays" | "excludeColdLeads">;
const EMPTY_DELIVERY: DeliverySettings = { cadence: null, sendWindow: null, followUp: null, attributionWindowDays: null, excludeColdLeads: null };
const deliveryOf = (campaign: Campaign): DeliverySettings => ({
  cadence: campaign.cadence ?? null,
  sendWindow: campaign.sendWindow ?? null,
  followUp: campaign.followUp ?? null,
  attributionWindowDays: campaign.attributionWindowDays ?? null,
  excludeColdLeads: campaign.excludeColdLeads ?? null,
});

/** Ritmo do disparo, janela de horário, follow-up para quem não respondeu e janela de atribuição de vendas. */
function CampaignDeliverySettings({ value, onChange }: { value: DeliverySettings; onChange: (value: DeliverySettings) => void }) {
  const field = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-[#C4D600]";
  const toggle = "h-4 w-4 shrink-0 cursor-pointer accent-[#002187] dark:accent-[#C4D600]";
  const label = "block space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300";
  const box = "space-y-2.5 rounded-lg border border-slate-200 p-3 dark:border-slate-700";
  const head = "flex cursor-pointer items-start gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100";
  const hint = "block text-[11px] font-normal text-slate-500 dark:text-slate-400";
  const windowValid = !value.sendWindow || value.sendWindow.start < value.sendWindow.end;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><CalendarClock className="h-3.5 w-3.5" />Ritmo, horário e follow-up (opcional)</legend>

      <div className={box}>
        <label className={head}>
          <input type="checkbox" className={toggle} checked={Boolean(value.cadence)} onChange={(event) => onChange({ ...value, cadence: event.target.checked ? { batchSize: 50, intervalSeconds: 60, randomDelay: true } : null })} />
          <span className="min-w-0 break-words">Cadência por lotes<span className={hint}>Protege a qualidade do número na Meta enviando aos poucos.</span></span>
        </label>
        {value.cadence && (
          <div className="grid gap-2 sm:grid-cols-3">
            <label className={label}><span>Mensagens por lote</span><input type="number" min={1} max={5000} value={value.cadence.batchSize} onChange={(event) => onChange({ ...value, cadence: { ...value.cadence!, batchSize: Number(event.target.value) } })} className={field} /></label>
            <label className={label}><span>Pausa entre lotes (s)</span><input type="number" min={5} max={3600} value={value.cadence.intervalSeconds} onChange={(event) => onChange({ ...value, cadence: { ...value.cadence!, intervalSeconds: Number(event.target.value) } })} className={field} /></label>
            <label className="flex cursor-pointer items-center gap-2 pt-4 text-[11px] font-semibold text-slate-600 dark:text-slate-300"><input type="checkbox" className={toggle} checked={value.cadence.randomDelay === true} onChange={(event) => onChange({ ...value, cadence: { ...value.cadence!, randomDelay: event.target.checked } })} />Intervalo aleatório (1 a 4 s) entre envios</label>
          </div>
        )}
      </div>

      <div className={box}>
        <label className={head}>
          <input type="checkbox" className={toggle} checked={Boolean(value.sendWindow)} onChange={(event) => onChange({ ...value, sendWindow: event.target.checked ? { start: "08:30", end: "18:30", skipSundays: true } : null })} />
          <span className="min-w-0 break-words">Janela de horário permitido<span className={hint}>Fora do horário o envio pausa sozinho e retoma no próximo período permitido.</span></span>
        </label>
        {value.sendWindow && (
          <div className="grid gap-2 sm:grid-cols-3">
            <label className={label}><span>Início</span><input type="time" value={value.sendWindow.start} onChange={(event) => onChange({ ...value, sendWindow: { ...value.sendWindow!, start: event.target.value } })} className={field} /></label>
            <label className={label}><span>Fim</span><input type="time" value={value.sendWindow.end} onChange={(event) => onChange({ ...value, sendWindow: { ...value.sendWindow!, end: event.target.value } })} className={field} /></label>
            <label className="flex cursor-pointer items-center gap-2 pt-4 text-[11px] font-semibold text-slate-600 dark:text-slate-300"><input type="checkbox" className={toggle} checked={value.sendWindow.skipSundays === true} onChange={(event) => onChange({ ...value, sendWindow: { ...value.sendWindow!, skipSundays: event.target.checked } })} />Não enviar aos domingos</label>
            {!windowValid && <p role="alert" className="text-[11px] font-medium text-[#9a3d12] sm:col-span-3 dark:text-[#F7915E]">O início precisa ser antes do fim.</p>}
          </div>
        )}
      </div>

      <div className={box}>
        <label className={head}>
          <input type="checkbox" className={toggle} checked={Boolean(value.followUp?.enabled)} onChange={(event) => onChange({ ...value, followUp: event.target.checked ? { enabled: true, afterHours: 24, modelo: value.followUp?.modelo ?? null } : null })} />
          <span className="min-w-0 break-words">Follow-up para quem não respondeu<span className={hint}>Segundo modelo aprovado enviado depois do prazo. Cancelado sozinho se o cliente responder no chat ou comprar no VMSet.</span></span>
        </label>
        {value.followUp?.enabled && (
          <div className="space-y-2">
            <label className={label}><span>Enviar depois de (horas sem resposta)</span><input type="number" min={1} max={168} value={value.followUp.afterHours} onChange={(event) => onChange({ ...value, followUp: { ...value.followUp!, afterHours: Number(event.target.value) } })} className={field} /></label>
            <CampaignTemplatePicker value={(value.followUp.modelo as CampaignTemplate | null) ?? null} onChange={(modelo) => onChange({ ...value, followUp: { ...value.followUp!, modelo } })} />
            {!value.followUp.modelo && <p className="text-[11px] font-medium text-[#9a3d12] dark:text-[#F7915E]">Escolha o modelo do follow-up; sem ele nada é enviado.</p>}
          </div>
        )}
      </div>

      <div className={box}>
        <label className={head}>
          <input type="checkbox" className={toggle} checked={Boolean(value.excludeColdLeads)} onChange={(event) => onChange({ ...value, excludeColdLeads: event.target.checked ? 3 : null })} />
          <span className="min-w-0 break-words">Excluir leads frios<span className={hint}>Não envia para quem não leu nem respondeu nenhuma das últimas campanhas recebidas. Descadastrados e números sem WhatsApp já ficam sempre de fora.</span></span>
        </label>
        {value.excludeColdLeads ? (
          <label className={label}><span>Sem leitura nas últimas (campanhas)</span><input type="number" min={1} max={20} value={value.excludeColdLeads} onChange={(event) => onChange({ ...value, excludeColdLeads: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} className={`${field} max-w-32`} /></label>
        ) : null}
      </div>

      <label className={`${box} block`}>
        <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">Janela de atribuição de vendas (dias)</span>
        <span className={hint}>Venda no VMSet até esse prazo após o envio conta para a campanha. Em branco: padrão geral (7 dias).</span>
        <input type="number" min={1} max={90} placeholder="7" value={value.attributionWindowDays ?? ""} onChange={(event) => onChange({ ...value, attributionWindowDays: event.target.value ? Number(event.target.value) : null })} className={`${field} mt-1.5 max-w-32`} />
      </label>
    </fieldset>
  );
}

/** Atendimento ao responder a campanha: IA qualifica o lead ou a resposta vai direto para a fila humana. */
function CampaignAiReplyChoice({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const options = [
    { enabled: true, icon: Bot, title: "IA responde e qualifica o lead", description: "A IA inicia o atendimento comercial e passa para a fila quando necessário." },
    { enabled: false, icon: Headset, title: "Apenas fila humana (IA não responde)", description: "Robôs e auto-respostas continuam filtrados em silêncio; resposta de pessoa vai direto para os operadores." },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Atendimento ao responder a campanha</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = value === option.enabled;
          const Icon = option.icon;
          return (
            <button
              key={option.title}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.enabled)}
              className={`flex min-w-0 items-start gap-2.5 rounded-lg border p-3 text-left transition-colors cursor-pointer ${active ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-[#002187] dark:text-[#C4D600]" : "text-slate-400"}`} />
              <span className="min-w-0 break-words">
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{option.title}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-slate-500 dark:text-slate-400">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
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
  { label: "Nome do atendente", value: "{{nome_atendente}}" },
  { label: "Primeiro nome do atendente", value: "{{primeiro_nome_atendente}}" },
];

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};
const int = (value: number) => value.toLocaleString("pt-BR");
const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—");

const displayStyles: Record<DisplayStatus, string> = {
  Rascunho: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
  Pronta: "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]",
  Agendado: "bg-blue-100 text-[#002187] dark:bg-blue-950/50 dark:text-blue-300",
  "Aguardando Meta": "bg-blue-100 text-[#002187] dark:bg-blue-950/50 dark:text-blue-300",
  "Rejeitada pela Meta": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
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
    case "Aguardando aprovação Meta": return "Aguardando Meta";
    case "Rejeitada pela Meta": return "Rejeitada pela Meta";
    case "Falha na submissão":
    case "Modelo indisponível na Meta": return "Falha";
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
  Rascunho: ["Rascunho", "Pronta", "Aguardando Meta", "Rejeitada pela Meta"],
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
  const [campaignCriteriaFilters, setCampaignCriteriaFilters] = useState<AudienceCriterion[]>([]);
  const [campaignObjective, setCampaignObjective] = useState("");
  const [campaignAudienceDescription, setCampaignAudienceDescription] = useState("");
  const [campaignCategory, setCampaignCategory] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [campaignAiReply, setCampaignAiReply] = useState(true);
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>(EMPTY_DELIVERY);
  // Assistente de nova campanha: etapa atual (controlada, para os atalhos "Editar" da revisão), agendamento e IA sob demanda.
  const [createStep, setCreateStep] = useState(1);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleDay, setScheduleDay] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [campaignAiOpen, setCampaignAiOpen] = useState(false);
  const [templateAiOpen, setTemplateAiOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Público válido do assistente: únicos sem descadastrados e com celular (conferido no servidor).
  const [audienceValid, setAudienceValid] = useState<{ signature: string; loading: boolean; summary?: AudienceSummary; error?: string } | null>(null);
  const [campaignPrompt, setCampaignPrompt] = useState("");
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);
  const [campaignAiError, setCampaignAiError] = useState("");
  const [templatePrompt, setTemplatePrompt] = useState("");
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false);
  const [templateAiError, setTemplateAiError] = useState("");
  const [aiTemplateDraft, setAiTemplateDraft] = useState<CampaignTemplateDraft | null>(null);
  const [metaStatusError, setMetaStatusError] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Map<File, string>>(new Map());
  const attachmentPreviewUrlsRef = useRef(new Map<File, string>());
  const newCampaignIdRef = useRef<string | null>(null);
  const [form, setForm] = useState({ nome: "", publico: "", mensagem: "" });
  const [campaignTemplate, setCampaignTemplate] = useState<CampaignTemplate | null>(null);
  const changeCampaignTemplate = (template: CampaignTemplate | null) => {
    setForm((current) => ({ ...current, mensagem: template ? template.body : campaignTemplate ? "" : current.mensagem }));
    setCampaignTemplate(template);
    setAiTemplateDraft(null);
    setTemplateAiError("");
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

  const hasPendingMetaCampaign = campaigns.some((campaign) => ["PENDING", "PENDING_REVIEW", "IN_APPEAL"].includes(campaign.metaApprovalStatus ?? ""));
  useEffect(() => {
    if (campaignsLoading || !hasPendingMetaCampaign) return;
    let active = true;
    const syncMetaStatus = async () => {
      try {
        const response = await fetch("/api/campaigns/templates/status", { cache: "no-store" });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível consultar a análise da Meta.");
        const refreshed = await reloadCampaigns();
        if (!active) return;
        setMetaStatusError("");
        setSelectedCampaign((current) => current ? refreshed.find((item) => item.id === current.id) ?? current : current);
      } catch (error) {
        if (active) setMetaStatusError(error instanceof Error ? error.message : "Não foi possível consultar a análise da Meta.");
      }
    };
    const first = window.setTimeout(() => void syncMetaStatus(), 0);
    const timer = window.setInterval(() => void syncMetaStatus(), 30_000);
    return () => { active = false; window.clearTimeout(first); window.clearInterval(timer); };
  }, [campaignsLoading, hasPendingMetaCampaign, reloadCampaigns]);

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
      nome: job.single ? job.stageName : `Pipeline · Etapa ${job.stageName}${job.retryOf ? " (reenvio)" : ""}`,
      origem: job.single ? (job.userName ? `Individual · ${job.userName}` : "Individual") : job.userName ? `Pipeline · ${job.userName}` : "Pipeline",
      mensagem: job.templateName ? `Modelo: ${job.templateName}` : "Mensagem livre",
      publico: job.single ? "1 contato" : `Etapa ${job.stageName}`,
      status: bulkDisplayStatus(job),
      total: job.total,
      processed: job.sent + job.failed,
      stats: stats[`bulk:${job.id}`] ?? { ...EMPTY_STATS, total: job.total, sent: job.sent, failed: job.failed },
      updatedAt: new Date(job.finishedAt ?? job.createdAt).getTime(),
      updatedLabel: formatDateTime(job.finishedAt ?? job.createdAt),
      bulk: job,
    })),
  ];

  // Disparos "Enviando" ficam sempre no topo, do início mais recente para o mais antigo; o resto segue a ordenação escolhida.
  const sortedRows = sortCampaignRows(rows, sortConfig.field as CampaignSortField, sortConfig.order);

  const filteredRows = sortedRows.filter((row) => {
    const matchesSearch = `${row.nome} ${row.publico} ${row.mensagem} ${row.status}`.toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR"));
    const allowed = filterMatches[activeFilter];
    return matchesSearch && (!allowed || allowed.includes(row.status));
  });
  // Paginação na tela: a lista junta campanhas e envios do pipeline, já carregados juntos.
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selectableRows = pageRows.filter((row) => row.kind === "campaign" && row.campaign && !isDispatchBlocked(row.campaign));

  const resetCreateForm = () => {
    newCampaignIdRef.current = null;
    setForm({ nome: "", publico: "", mensagem: "" });
    setCampaignTemplate(null);
    setSelectedAudienceSegments([]);
    setCampaignCriteriaFilters([]);
    setCampaignObjective("");
    setCampaignAudienceDescription("");
    setCampaignCategory("MARKETING");
    setCampaignAiReply(true);
    setDeliverySettings(EMPTY_DELIVERY);
    setCreateStep(1);
    setScheduleMode("now");
    setScheduleDay("");
    setScheduleTime("09:00");
    setCampaignAiOpen(false);
    setTemplateAiOpen(false);
    setShowAdvanced(false);
    setAudienceValid(null);
    setCampaignPrompt("");
    setIsGeneratingCampaign(false);
    setCampaignAiError("");
    setTemplatePrompt("");
    setIsGeneratingTemplate(false);
    setIsSubmittingTemplate(false);
    setTemplateAiError("");
    setAiTemplateDraft(null);
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
      id: newCampaignIdRef.current ?? (newCampaignIdRef.current = `camp-${Date.now()}`),
      nome,
      modelo: campaignTemplate,
      publico: selectedAudienceSegments.join(", "),
      audienceSegmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id),
      criteriaFilters: campaignCriteriaFilters,
      objective: campaignObjective,
      audienceDescription: campaignAudienceDescription,
      metaCategory: campaignCategory,
      aiAutoReplyEnabled: campaignAiReply,
      ...deliverySettings,
      ...(aiTemplateDraft ? { metaTemplateDraft: { ...aiTemplateDraft, body: mensagem, category: campaignCategory }, metaApprovalStatus: "TEMPLATE_DRAFT" } : {}),
      status: "Rascunho",
      disparos: 0,
      rotuloDisparos: "contatos no público",
      taxaResposta: 0,
      dataAtualizacao: new Date().toISOString(),
      mensagem,
      anexos: uploadedAttachments.length > 0 ? uploadedAttachments : selectedAttachments.map(({ name, size, type }) => ({ name, size, type })),
    };
  };

  const generateCampaignWithAi = async () => {
    const prompt = campaignPrompt.trim();
    if (prompt.length < 10) {
      setCampaignAiError("Descreva o objetivo e o público da campanha com um pouco mais de detalhe.");
      return;
    }
    setIsGeneratingCampaign(true);
    setCampaignAiError("");
    try {
      const response = await fetch("/api/campaigns/gerar-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "campaign", prompt }),
      });
      const result = await response.json() as { campaign?: { name: string; objective: string; audienceDescription: string; category: "MARKETING" | "UTILITY"; segmentIds: string[]; audienceFilters: AudienceCriterion[]; body: string; headerFormat: "NONE" | "TEXT"; headerText: string; footer: string; params: string[]; examples: string[]; buttons: CampaignTemplateDraft["buttons"] }; error?: string };
      if (!response.ok || !result.campaign) throw new Error(result.error || "Não foi possível gerar a campanha.");
      const generated = result.campaign;
      setForm({ nome: generated.name, publico: segments.filter((segment) => generated.segmentIds.includes(segment.id)).map((segment) => segment.nome).join(", "), mensagem: generated.body });
      setSelectedAudienceSegments(segments.filter((segment) => generated.segmentIds.includes(segment.id)).map((segment) => segment.nome));
      setCampaignCriteriaFilters(generated.audienceFilters);
      setCampaignObjective(generated.objective);
      setCampaignAudienceDescription(generated.audienceDescription);
      setCampaignCategory(generated.category);
      setAiTemplateDraft({
        category: generated.category,
        headerFormat: generated.headerFormat,
        headerText: generated.headerText,
        body: generated.body,
        footer: generated.footer,
        params: generated.params,
        examples: generated.examples,
        buttons: generated.buttons,
      });
      setCampaignTemplate(null);
      setCampaignAiError("");
      setFormError("");
      toast.success("Campanha gerada", "Revise o nome, o público, os filtros e a mensagem antes de salvar ou enviar.");
      return true;
    } catch (error) {
      setCampaignAiError(error instanceof Error ? error.message : "Não foi possível gerar a campanha.");
    } finally {
      setIsGeneratingCampaign(false);
    }
    return false;
  };

  const generateMessageTemplateWithAi = async () => {
    if (!form.nome.trim() || selectedAudienceSegments.length === 0) {
      setTemplateAiError("Informe o nome da campanha e selecione o público antes de gerar o modelo.");
      return;
    }
    const prompt = templatePrompt.trim() || `Crie uma mensagem para a campanha "${form.nome.trim()}"`;
    setIsGeneratingTemplate(true);
    setTemplateAiError("");
    try {
      const response = await fetch("/api/campaigns/gerar-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "template",
          prompt,
          campaignName: form.nome.trim(),
          segmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id),
          campaignObjective,
          audienceDescription: campaignAudienceDescription,
          audienceFilters: campaignCriteriaFilters,
        }),
      });
      const result = await response.json() as { template?: CampaignTemplateDraft; error?: string };
      if (!response.ok || !result.template) throw new Error(result.error || "Não foi possível gerar o modelo.");
      setAiTemplateDraft(result.template);
      setCampaignCategory(result.template.category);
      setCampaignTemplate(null);
      setForm((current) => ({ ...current, mensagem: result.template?.body ?? "" }));
      setTemplateAiError("");
      setFormError("");
      return true;
    } catch (error) {
      setTemplateAiError(error instanceof Error ? error.message : "Não foi possível gerar a mensagem.");
    } finally {
      setIsGeneratingTemplate(false);
    }
    return false;
  };

  const updateGeneratedTemplateBody = (body: string) => {
    setForm((current) => ({ ...current, mensagem: body }));
    setAiTemplateDraft((current) => {
      if (!current) return current;
      const indices = [...new Set(body.match(/\{\{\d+\}\}/g) ?? [])].map((item) => Number(item.slice(2, -2))).sort((a, b) => a - b);
      const params = indices.map((_, index) => current.params[index] ?? "nome");
      const examplesByField: Record<string, string> = { nome: "Maria", email: "maria@example.com", telefone: "+5511999999999", segmento: "Clientes especiais", data_nascimento: "15/05/1990", nome_atendente: "Ana Souza", primeiro_nome_atendente: "Ana" };
      return { ...current, body, params, examples: params.map((field) => examplesByField[field] ?? "Exemplo") };
    });
    setFormError("");
  };

  const updateGeneratedTemplateParam = (index: number, field: string) => {
    const examplesByField: Record<string, string> = { nome: "Maria", email: "maria@example.com", telefone: "+5511999999999", segmento: "Clientes especiais", data_nascimento: "15/05/1990", nome_atendente: "Ana Souza", primeiro_nome_atendente: "Ana" };
    setAiTemplateDraft((current) => current ? {
      ...current,
      params: current.params.map((item, i) => i === index ? field : item),
      examples: current.params.map((item, i) => examplesByField[i === index ? field : item] ?? "Exemplo"),
    } : current);
  };

  const submitTemplateForMeta = async (campaign: Campaign, draft: CampaignTemplateDraft, closeAfterSubmit = true) => {
    if (isSubmittingTemplate) return;
    setIsSubmittingTemplate(true);
    setTemplateAiError("");
    setFormError("");
    try {
      const response = await fetch("/api/campaigns/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign, template: { ...draft, body: form.mensagem.trim(), category: campaignCategory } }),
      });
      const result = await response.json() as { id?: string; name?: string; status?: string; campaignStatus?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o modelo para análise da Meta.");
      const refreshed = await reloadCampaigns().catch(() => null);
      const submittedCampaign: Campaign = {
        ...campaign,
        status: (result.campaignStatus ?? "Aguardando aprovação Meta") as CampaignStatus,
        metaApprovalStatus: result.status ?? "PENDING",
        metaApprovalReason: "",
        metaTemplateId: result.id ?? "",
        metaTemplateDraft: draft,
        modelo: { name: result.name ?? campaign.modelo?.name ?? "template_pendente", language: "pt_BR", body: form.mensagem.trim(), hasImage: false, params: draft.params },
      };
      setSelectedCampaign((current) => current?.id === campaign.id ? refreshed?.find((item) => item.id === current.id) ?? submittedCampaign : current);
      if (closeAfterSubmit) {
        resetCreateForm();
        setIsCreateOpen(false);
        setActiveFilter("Todas");
        setSearchTerm("");
      } else {
        setAiTemplateDraft(null);
        setTemplateAiError("");
      }
      if (!refreshed) setMetaStatusError("O modelo foi submetido, mas a lista não atualizou. Atualize a página para confirmar o status.");
      toast.success(result.status === "APPROVED" ? "Modelo aprovado pela Meta" : "Modelo enviado para análise", result.status === "APPROVED"
        ? `"${campaign.nome}" está pronta para disparo.`
        : `A campanha "${campaign.nome}" ficará bloqueada até a aprovação da Meta.`);
    } catch (error) {
      setTemplateAiError(error instanceof Error ? error.message : "Não foi possível enviar o modelo para análise.");
    } finally {
      setIsSubmittingTemplate(false);
    }
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

  /**
   * Troca o atendimento pós-campanha (IA x fila humana) em qualquer status, inclusive enviando, pausada ou concluída.
   * Grava só esse campo no servidor (o disparo segue atualizando o progresso em paralelo) e vale para a próxima resposta.
   */
  const changeCampaignAiMode = async (campaign: Campaign, enabled: boolean) => {
    const previous = campaign.aiAutoReplyEnabled !== false;
    if (selectedCampaign?.id === campaign.id) {
      setCampaignAiReply(enabled);
      setSelectedCampaign((current) => (current && current.id === campaign.id ? { ...current, aiAutoReplyEnabled: enabled } : current));
    }
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiAutoReplyEnabled: enabled }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Tente novamente.");
      await reloadCampaigns().catch(() => null);
      toast.success("Atendimento atualizado", enabled ? `A IA responde e qualifica as respostas de "${campaign.nome}".` : `Respostas de "${campaign.nome}" vão direto para a fila humana.`);
    } catch (cause) {
      if (selectedCampaign?.id === campaign.id) {
        setCampaignAiReply(previous);
        setSelectedCampaign((current) => (current && current.id === campaign.id ? { ...current, aiAutoReplyEnabled: previous } : current));
      }
      toast.error("Não foi possível alterar o atendimento", cause instanceof Error ? cause.message : "Tente novamente.");
    }
  };

  const startEditingCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    clearSelectedAttachments();
    setSelectedAudienceSegments(campaign.publico.split(", ").filter((segment) => segmentOptionSet.has(segment)));
    setCampaignCriteriaFilters(campaign.criteriaFilters ?? []);
    setCampaignObjective(campaign.objective ?? "");
    setCampaignAudienceDescription(campaign.audienceDescription ?? "");
    setCampaignCategory(campaign.metaCategory ?? "MARKETING");
    setCampaignAiReply(campaign.aiAutoReplyEnabled !== false);
    setDeliverySettings(deliveryOf(campaign));
    setForm({ nome: campaign.nome, publico: campaign.publico, mensagem: campaign.mensagem });
    setCampaignTemplate(campaign.metaApprovalStatus === "REJECTED" || campaign.metaApprovalStatus === "SUBMISSION_FAILED" ? null : campaign.modelo ?? null);
    setAiTemplateDraft(campaign.metaTemplateDraft ?? null);
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
    const metaTemplateChanged = Boolean(selectedCampaign.metaApprovalStatus && !aiTemplateDraft && campaignTemplate?.name !== selectedCampaign.modelo?.name);
    const updatedCampaign = {
      ...selectedCampaign,
      nome,
      modelo: aiTemplateDraft ? selectedCampaign.modelo : campaignTemplate,
      publico,
      audienceSegmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id),
      criteriaFilters: campaignCriteriaFilters,
      objective: campaignObjective,
      audienceDescription: campaignAudienceDescription,
      metaCategory: campaignCategory,
      aiAutoReplyEnabled: campaignAiReply,
      ...deliverySettings,
      mensagem,
      ...(metaTemplateChanged ? { status: "Rascunho" as const, metaApprovalStatus: undefined, metaApprovalReason: "", metaTemplateId: "" } : {}),
      ...(aiTemplateDraft ? { metaTemplateDraft: { ...aiTemplateDraft, body: mensagem, category: campaignCategory } } : {}),
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

  /** Busca no servidor os contatos de cada segmento das campanhas (sem unir); base do disparo e do resumo de interseção. */
  const fetchCampaignAudience = async (readyCampaigns: Campaign[]) => {
    const groups: Record<string, AudienceCriterion[]> = {};
    const contactGroups: Record<string, string[]> = {};
    const contactCriteria: Record<string, AudienceCriterion[]> = {};
    const campaignCriteria: Record<string, { groupKeys: string[]; criteria: AudienceCriterion[] }> = {};
    const groupKeysByCampaign = new Map<string, { key: string; label: string }[]>();
    for (const campaign of readyCampaigns) {
      const campaignSegments = campaign.audienceSegmentIds?.length
        ? campaign.audienceSegmentIds.map((id) => segments.find((segment) => segment.id === id))
        : campaign.publico.split(", ").map((name) => segments.find((segment) => segment.nome === name));
      if (campaignSegments.length === 0 || campaignSegments.some((segment) => !segment)) {
        throw new Error(`Não foi possível localizar todos os segmentos de "${campaign.nome}". Revise o público antes de disparar.`);
      }

      const keys: { key: string; label: string }[] = [];
      for (const segment of campaignSegments as CampaignAudienceSegment[]) {
        const key = `${campaign.id}:${segment.id}`;
        keys.push({ key, label: segment.nome });
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
      if (campaign.criteriaFilters?.length) campaignCriteria[campaign.id] = { groupKeys: keys.map((item) => item.key), criteria: campaign.criteriaFilters };
    }

    const audienceResponse = await fetch("/api/segments/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups, contactGroups, contactCriteria, campaignCriteria, includeRecipients: true }),
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
    return { recipients: audience.recipients, groupKeysByCampaign };
  };

  /**
   * Destinatários únicos de uma campanha: união dos segmentos sem repetir pessoa (mesmo contato ou mesmo celular),
   * guardando em `origens` os segmentos em que cada um aparece. Com filtros da IA, só quem passou neles.
   */
  const uniqueCampaignRecipients = (campaign: Campaign, audience: Awaited<ReturnType<typeof fetchCampaignAudience>>) => {
    const keys = audience.groupKeysByCampaign.get(campaign.id) ?? [];
    const tagged = keys.flatMap(({ key, label }) => (audience.recipients[key] ?? []).map((recipient) => ({ ...recipient, origens: [label] })));
    const { unique } = dedupeRecipients(tagged);
    if (!campaign.criteriaFilters?.length) return unique;
    const allowed = new Set((audience.recipients[campaign.id] ?? []).map((recipient) => recipient.id));
    return unique.filter((recipient) => allowed.has(recipient.id));
  };

  /** Calcula os destinatários de cada campanha a partir dos segmentos (usado no disparo e na estimativa de custo). */
  const buildCampaignRecipients = async (readyCampaigns: Campaign[]) => {
    const audience = await fetchCampaignAudience(readyCampaigns);
    const recipientsByCampaign = new Map<string, CampaignRecipient[]>();
    for (const campaign of readyCampaigns) {
      const recipients = uniqueCampaignRecipients(campaign, audience);
      if (recipients.length === 0) throw new Error(`O público de "${campaign.nome}" não contém contatos para envio.`);
      recipientsByCampaign.set(campaign.id, recipients);
    }
    return recipientsByCampaign;
  };

  // Resumo de interseção do público em edição (2+ segmentos): soma bruta × únicos, unificados e segmentos sem novos.
  const [audienceOverlap, setAudienceOverlap] = useState<{ signature: string; loading: boolean; summary?: SegmentOverlapSummary; finalUnique?: number; error?: string } | null>(null);  const overlapEditorOpen = isCreateOpen || Boolean(selectedCampaign);
  const overlapSignature = JSON.stringify([selectedAudienceSegments, campaignCriteriaFilters]);
  useEffect(() => {
    if (!overlapEditorOpen || selectedAudienceSegments.length < 1 || segmentsLoading || criteriaLoading) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setAudienceOverlap({ signature: overlapSignature, loading: true });
      const preview: Campaign = {
        id: "preview",
        nome: form.nome || "Nova campanha",
        publico: selectedAudienceSegments.join(", "),
        audienceSegmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id),
        criteriaFilters: campaignCriteriaFilters,
      } as Campaign;
      fetchCampaignAudience([preview])
        .then((audience) => {
          if (!active) return;
          const keys = audience.groupKeysByCampaign.get(preview.id) ?? [];
          const summary = summarizeSegmentOverlap(keys.map(({ key, label }) => ({ label, recipients: audience.recipients[key] ?? [] })));
          const unique = uniqueCampaignRecipients(preview, audience);
          setAudienceOverlap({ signature: overlapSignature, loading: false, summary, finalUnique: unique.length });
          if (!isCreateOpen) return;
          setAudienceValid({ signature: overlapSignature, loading: true });
          // Os repetidos entre segmentos já saíram na união; o servidor desconta descadastrados e celulares inválidos.
          fetch("/api/campaigns/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", recipients: unique }) })
            .then(async (response) => {
              const body = (await response.json().catch(() => ({}))) as { summary?: AudienceSummary; error?: string };
              if (!response.ok || !body.summary) throw new Error(body.error ?? "Não foi possível conferir o público.");
              if (active) setAudienceValid({ signature: overlapSignature, loading: false, summary: { ...body.summary, total: summary.rawTotal, duplicates: summary.removed + body.summary.duplicates } });
            })
            .catch((error: unknown) => {
              if (active) setAudienceValid({ signature: overlapSignature, loading: false, error: error instanceof Error ? error.message : "Não foi possível conferir o público." });
            });
        })
        .catch((error: unknown) => {
          if (!active) return;
          const message = error instanceof Error ? error.message : "Não foi possível calcular o público.";
          setAudienceOverlap({ signature: overlapSignature, loading: false, error: message });
          setAudienceValid({ signature: overlapSignature, loading: false, error: message });
        });
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só quando os segmentos/filtros escolhidos mudam
  }, [overlapEditorOpen, overlapSignature, segmentsLoading, criteriaLoading]);

  const { pricing: metaPricing } = useMetaPricing();
  const [isCostCalculatorOpen, setIsCostCalculatorOpen] = useState(false);

  // Resultado de outra seleção (ou ainda não calculado) aparece como "calculando".
  const audienceOverlapNotice = selectedAudienceSegments.length >= 1 ? (
    <AudienceOverlapNotice
      state={audienceOverlap?.signature === overlapSignature ? audienceOverlap : { loading: true }}
      hasFilters={campaignCriteriaFilters.length > 0}
      cost={{ unitBrl: campaignCategory === "UTILITY" ? metaPricing.utility : metaPricing.marketing, label: campaignCategory === "UTILITY" ? "Utilidade" : "Marketing" }}
    />
  ) : null;

  // Calculadora de custo: une os segmentos escolhidos sem repetir pessoa, como no disparo.
  const resolveUniqueAudience = async (segmentIds: string[]) => {
    const preview = { id: "calculadora", nome: "Calculadora", publico: "", audienceSegmentIds: segmentIds, criteriaFilters: [] } as unknown as Campaign;
    const audience = await fetchCampaignAudience([preview]);
    const keys = audience.groupKeysByCampaign.get(preview.id) ?? [];
    const summary = summarizeSegmentOverlap(keys.map(({ key, label }) => ({ label, recipients: audience.recipients[key] ?? [] })));
    return { unique: summary.unique, raw: summary.rawTotal };
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

  const startCampaignDispatch = async (campaign: Campaign, recipients: CampaignRecipient[], scheduledAt?: string) => {
    const startResponse = await fetch("/api/campaigns/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", campaignId: campaign.id, recipients, ignoreCooldown, ...(scheduledAt ? { scheduledAt } : {}) }),
    });
    const startResult = await startResponse.json().catch(() => ({})) as { error?: string };
    if (!startResponse.ok) throw new Error(startResult.error || `Não foi possível iniciar o disparo de "${campaign.nome}".`);
  };

  /** Botão primário do assistente: cria a campanha, inicia o lote em segundo plano e abre o acompanhamento ao vivo. */
  const launchNewCampaign = async () => {
    if (isLaunching) return;
    if (aiTemplateDraft) {
      setFormError("Envie o modelo gerado para análise da Meta antes de liberar o disparo.");
      return;
    }
    const campaign = buildNewCampaign();
    if (!campaign) return;
    // Agendado: horário de Brasília validado de novo na hora de confirmar (pode ter passado com a tela aberta).
    let scheduledAt: string | undefined;
    if (scheduleMode === "later") {
      const parsed = parseSchedule(scheduleDay, scheduleTime);
      if ("error" in parsed) {
        setFormError(parsed.error);
        return;
      }
      scheduledAt = parsed.at.toISOString();
    }
    setIsLaunching(true);
    setFormError("");
    let saved = false;
    try {
      await ensureReadyToDispatch();
      const recipients = (await buildCampaignRecipients([campaign])).get(campaign.id) ?? [];
      // Persiste antes de iniciar: o servidor lê a campanha salva para montar o envio.
      await saveCampaigns([campaign, ...campaigns]);
      saved = true;
      await startCampaignDispatch(campaign, recipients, scheduledAt);
      const refreshed = await reloadCampaigns().catch(() => null);
      resetCreateForm();
      setIsCreateOpen(false);
      setActiveFilter("Todas");
      setSearchTerm("");
      startEditingCampaign(refreshed?.find((item) => item.id === campaign.id) ?? campaign);
      void refreshAll();
      if (scheduledAt) toast.success("Campanha agendada", `"${campaign.nome}" será enviada em ${formatDateTime(scheduledAt)}.`);
      else toast.success("Disparo iniciado", `"${campaign.nome}" está sendo enviada em segundo plano.`);
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
      const blocked = readyCampaigns.find(isDispatchBlocked);
      if (blocked) throw new Error(blocked.metaApprovalStatus && blocked.metaApprovalStatus !== "APPROVED"
        ? `"${blocked.nome}" aguarda aprovação do template pela Meta e não pode ser disparada.`
        : `"${blocked.nome}" está em envio ou já teve mensagens enviadas. Não é possível dispará-la novamente para evitar duplicidades.`);

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
    // Reenvio para não engajados vai justamente para quem acabou de receber: a trava de descanso já vem ignorada.
    setIgnoreCooldown(ids.length > 0 && ids.every((id) => Boolean(campaigns.find((campaign) => campaign.id === id)?.resendOf)));
    setDispatchConfirmOpen(true);
    void estimateByIds(ids);
  };

  /** Novo rascunho editável com toda a configuração da original (template, IA, público, ritmo, follow-up). */
  const cloneCampaign = (source: Campaign, overrides: Partial<Campaign>) => {
    const clone: Campaign = {
      ...source,
      // eslint-disable-next-line react-hooks/purity -- chamado só em handlers de clique
      id: `camp-${Date.now()}`,
      nome: `${source.nome} (cópia)`,
      status: "Rascunho",
      disparos: 0,
      rotuloDisparos: "contatos no público",
      taxaResposta: 0,
      dataAtualizacao: new Date().toISOString(),
      resendOf: undefined,
      ...overrides,
    };
    setCampaigns((current) => [clone, ...current]);
    setActiveFilter("Todas");
    setSearchTerm("");
    startEditingCampaign(clone);
    return clone;
  };

  const duplicateCampaign = (source: Campaign) => {
    cloneCampaign(source, {});
    toast.success("Campanha duplicada", `"${source.nome} (cópia)" foi criada como rascunho.`);
  };

  /** Reenvio só para quem recebeu a original e não leu / não respondeu (falhas e descadastrados ficam de fora). */
  const createResendCampaign = (source: Campaign, mode: "not_read" | "not_replied") => {
    const label = mode === "not_read" ? "não lidos" : "não respondidos";
    cloneCampaign(source, {
      nome: `${source.nome} · reenvio (${label})`,
      resendOf: source.id,
      audienceDescription: `Quem recebeu "${source.nome}" e ${mode === "not_read" ? "não leu" : "não respondeu"}.`,
      criteriaFilters: [
        ...(source.criteriaFilters ?? []),
        {
          id: `resend-${source.id}-${mode}`,
          nome: `${mode === "not_read" ? "Não leram" : "Não responderam"} "${source.nome}"`,
          tipo: "geral",
          regras: [{ campo: "campaignConversion", operador: mode, valor: source.id, valor2: source.nome }],
        },
      ],
    });
    toast.success("Reenvio criado", `Rascunho para os ${label} de "${source.nome}". Revise e dispare.`);
  };
  /** Reenvio só faz sentido depois que a original enviou algo. */
  const canResend = (campaign: Campaign) => campaign.status !== "Enviando" && (["Enviada", "Envio parcial"].includes(campaign.status) || (campaign.disparos ?? 0) > 0);

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

  // Assistente de nova campanha: público válido, validação por etapa, agendamento e prévia do WhatsApp.
  const validSummary = audienceValid?.signature === overlapSignature ? audienceValid.summary : undefined;
  const wizardState: WizardState = {
    name: form.nome,
    segments: selectedAudienceSegments.length,
    audienceValid: validSummary ? validSummary.valid : null,
    message: form.mensagem,
    hasTemplate: Boolean(campaignTemplate),
    params: campaignTemplate?.params ?? [],
    uploading: isUploading,
    schedule: { mode: scheduleMode, day: scheduleDay, time: scheduleTime },
  };
  const parsedSchedule = scheduleMode === "later" ? parseSchedule(scheduleDay, scheduleTime) : null;
  const scheduleError = parsedSchedule && "error" in parsedSchedule ? parsedSchedule.error : "";
  const scheduleLabel = /^\d{4}-\d{2}-\d{2}$/.test(scheduleDay) ? `${scheduleDay.slice(8, 10)}/${scheduleDay.slice(5, 7)}/${scheduleDay.slice(0, 4)} às ${scheduleTime}` : "";
  const safetySummary = [
    deliverySettings.cadence ? `lotes de ${deliverySettings.cadence.batchSize}` : "",
    deliverySettings.sendWindow ? `das ${deliverySettings.sendWindow.start} às ${deliverySettings.sendWindow.end}` : "",
    deliverySettings.followUp?.enabled ? "com follow-up" : "",
    deliverySettings.excludeColdLeads ? "sem leads frios" : "",
  ].filter(Boolean).join(" · ") || "Sem regras extras";
  const previewMedia: PreviewMedia[] = selectedAttachments.length
    ? selectedAttachments.map((file) => ({ kind: file.type.startsWith("image/") ? "image" as const : file.type.startsWith("video/") ? "video" as const : "document" as const, url: attachmentPreviewUrls.get(file), name: file.name, size: formatFileSize(file.size) }))
    : campaignTemplate?.hasImage && campaignTemplate.headerImageUrl ? [{ kind: "image", url: campaignTemplate.headerImageUrl, name: "Imagem do modelo" }] : [];
  const previewBody = campaignTemplate
    ? renderPreview(form.mensagem, campaignTemplate.params)
    : aiTemplateDraft
      ? form.mensagem.replace(/\{\{(\d+)\}\}/g, (match, number: string) => aiTemplateDraft.examples[Number(number) - 1] ?? match)
      : form.mensagem.replace(/\{\{(\w+)\}\}/g, (match, key: string) => PARAM_FIELDS.find((field) => field.value === key)?.example ?? match);
  const messagePreview = (
    <WhatsAppPreview
      businessName="Óticas Brasil"
      media={previewMedia}
      headerText={aiTemplateDraft?.headerText || campaignTemplate?.headerText}
      body={previewBody}
      footer={aiTemplateDraft?.footer || campaignTemplate?.footer}
      buttons={(aiTemplateDraft?.buttons ?? campaignTemplate?.buttons ?? []).map((button) => button.text)}
    />
  );
  const templateAiButton = (
    <AiPopover label="Sugerir com IA" title="Sugerir mensagem com IA" hint="Cria um modelo novo (para análise da Meta) a partir do nome, do objetivo e do público." open={templateAiOpen} onOpenChange={setTemplateAiOpen}>
      <input value={templatePrompt} onChange={(event) => { setTemplatePrompt(event.target.value); setTemplateAiError(""); }} placeholder="Opcional: tom, oferta ou chamada para ação" aria-label="Orientação para a IA" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#C4D600]" />
      {(!form.nome.trim() || selectedAudienceSegments.length === 0) && <p className="text-[11px] text-slate-500 dark:text-slate-400">Informe o nome e o público na etapa 1 para liberar.</p>}
      {templateAiError && <p role="alert" className="text-[11px] font-medium text-[#9a3d12] dark:text-[#F7915E]">{templateAiError}</p>}
      <button type="button" disabled={isGeneratingTemplate || !form.nome.trim() || selectedAudienceSegments.length === 0} onClick={() => void generateMessageTemplateWithAi().then((ok) => { if (ok) setTemplateAiOpen(false); })} className={`${primaryButton} w-full justify-center`}>
        {isGeneratingTemplate ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{isGeneratingTemplate ? "Gerando..." : "Gerar sugestão"}
      </button>
    </AiPopover>
  );

  const selectedJob = selectedCampaign ? jobByCampaign.get(selectedCampaign.id) : undefined;
  const selectedStats = selectedCampaign ? stats[selectedCampaign.id] ?? EMPTY_STATS : EMPTY_STATS;
  const selectedLocked = selectedCampaign ? isDispatchLocked(selectedCampaign.status) : false;
  const selectedMetaPending = Boolean(selectedCampaign && ["PENDING", "PENDING_REVIEW", "IN_APPEAL"].includes(selectedCampaign.metaApprovalStatus ?? ""));
  const selectedDisplay = selectedCampaign ? campaignDisplayStatus(selectedCampaign) : "Rascunho";

  return (
    <div>
      <div className="space-y-4 pb-10">
        {campaignsError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{campaignsError}</p>}
        {metaStatusError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">{metaStatusError}</p>}

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
            <button type="button" onClick={() => setIsCostCalculatorOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Calculadora de custo</span>
            </button>
            {isCostCalculatorOpen && (
              <DispatchCostCalculator
                segments={segments.map((segment) => ({ id: segment.id, nome: segment.nome }))}
                resolveUnique={resolveUniqueAudience}
                onClose={() => setIsCostCalculatorOpen(false)}
              />
            )}
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
            <table className="w-full min-w-[960px] border-collapse text-left">
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
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((row) => {
                  const selectable = row.kind === "campaign" && row.campaign !== undefined && !isDispatchBlocked(row.campaign);
                  const isSelected = selectable && selectedCampaignIds.has(row.id);
                  const rowCampaign = row.kind === "campaign" ? row.campaign : undefined;
                  const percent =row.total > 0 ? Math.min(100, Math.round((row.processed / row.total) * 100)) : 0;
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
                          <span className="min-w-0"><span className="block max-w-56 truncate text-xs font-semibold text-slate-900 group-hover:text-[#002187] dark:text-white dark:group-hover:text-[#C4D600]">{row.nome}</span><span className="mt-0.5 block text-[10px] text-slate-400">{row.origem}</span>{row.kind === "campaign" && row.campaign && (() => {
                            const campaign = row.campaign;
                            const aiOn = campaign.aiAutoReplyEnabled !== false;
                            const BadgeIcon = aiOn ? Bot : Headset;
                            return (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void changeCampaignAiMode(campaign, !aiOn);
                                }}
                                title={aiOn ? "IA responde e qualifica o lead. Clique para mandar as respostas direto para a fila humana." : "Apenas fila humana. Clique para a IA responder e qualificar o lead."}
                                className={`mt-1 inline-flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold hover:opacity-80 ${aiOn ? "bg-[#002187]/10 text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" : "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]"}`}
                              >
                                <BadgeIcon className="h-3 w-3" />{aiOn ? "IA Ativa" : "Direto p/ Fila Humana"}
                              </button>
                            );
                          })()}</span>
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
                      <td className="px-4 py-2 xl:py-3.5 text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          {row.kind === "campaign" && row.campaign && (
                            row.job?.status === "running" ? (
                              <button type="button" disabled={busy} onClick={() => void controlDispatch(row.id, "pause")} aria-label={`Pausar ${row.nome}`} title="Pausar disparo" className={iconAction}><Pause className="h-3.5 w-3.5" /></button>
                            ) : row.job?.status === "paused" ? (
                              <button type="button" disabled={busy} onClick={() => void controlDispatch(row.id, "resume")} aria-label={`Retomar ${row.nome}`} title="Retomar disparo" className={iconAction}><Play className="h-3.5 w-3.5" /></button>
                            ) : !isDispatchBlocked(row.campaign) ? (
                              <button type="button" disabled={isDispatching} onClick={() => openDispatchConfirm([row.id], "single")} aria-label={`Disparar ${row.nome}`} title="Disparar agora" className={iconAction}><Send className="h-3.5 w-3.5" /></button>
                            ) : null
                          )}
                          {bulk && bulk.status === "running" && <button type="button" disabled={busy} onClick={() => void controlBulk(bulk, "pause")} aria-label="Pausar lote" title="Pausar" className={iconAction}><Pause className="h-3.5 w-3.5" /></button>}
                          {bulk && bulk.status === "paused" && <button type="button" disabled={busy} onClick={() => void controlBulk(bulk, "resume")} aria-label="Retomar lote" title="Retomar" className={iconAction}><Play className="h-3.5 w-3.5" /></button>}
                          {bulk && (bulk.status === "running" || bulk.status === "paused") && <button type="button" disabled={busy} onClick={() => void controlBulk(bulk, "cancel")} aria-label="Cancelar lote" title="Cancelar" className={`${iconAction} text-red-600! dark:text-red-400!`}><XCircle className="h-3.5 w-3.5" /></button>}
                          {bulk && (bulk.status === "completed" || bulk.status === "cancelled") && bulk.failed > 0 && <button type="button" disabled={busy} onClick={() => void controlBulk(bulk, "retry")} aria-label="Reenviar falhas" title="Reenviar falhas" className={iconAction}><RotateCcw className="h-3.5 w-3.5" /></button>}
                          {rowCampaign && <button type="button" onClick={() => duplicateCampaign(rowCampaign)} aria-label={`Duplicar ${row.nome}`} title="Duplicar campanha" className={iconAction}><Copy className="h-3.5 w-3.5" /></button>}
                          {rowCampaign && canResend(rowCampaign) && <button type="button" onClick={() => createResendCampaign(rowCampaign, "not_replied")} aria-label={`Reenviar para não engajados de ${row.nome}`} title="Criar reenvio para quem não respondeu" className={iconAction}><Repeat className="h-3.5 w-3.5" /></button>}
                          <button type="button" onClick={() => openRow(row)} aria-label={`Ver detalhes de ${row.nome}`} title="Ver detalhes" className={iconAction}><Eye className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-14 text-center">
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
          description="Público, mensagem e horário em 3 etapas. O envio roda em segundo plano no servidor."
          size="campaign-wizard"
          onClose={() => { if (isLaunching || isSubmittingTemplate) return; setIsCreateOpen(false); resetCreateForm(); }}
        >
          <Stepper
            step={createStep}
            onStepChange={(step) => {
              setFormError("");
              setCampaignAiOpen(false);
              setTemplateAiOpen(false);
              setCreateStep(step);
              if (step === 3) {
                const draft = buildNewCampaign();
                if (draft) void estimateDispatchCost([draft]);
              }
            }}
            onFinalStepCompleted={() => void launchNewCampaign()}
            validateStep={(step) => {
              const error = validateWizardStep(step, wizardState);
              setFormError(error);
              return !error;
            }}
            backButtonText="Voltar"
            nextButtonText="Continuar"
            completeButtonText={aiTemplateDraft ? "Envie o modelo à Meta" : isLaunching ? (scheduleMode === "later" ? "Agendando..." : "Disparando...") : scheduleMode === "later" ? "Agendar campanha" : "Criar e disparar agora"}
            nextButtonProps={{ disabled: isLaunching || isSubmittingTemplate || (createStep === 3 && Boolean(aiTemplateDraft)) }}
            backButtonProps={{ disabled: isLaunching || isSubmittingTemplate }}
            lastStepSecondaryAction={(
              <button type="button" disabled={isLaunching || isSubmittingTemplate} onClick={saveDraft} className="inline-flex h-[38px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer">
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
            <Step title="Configuração e público" description="Nome, canal e quem recebe">
              <div className="space-y-4">
                <WizardSection
                  icon={Megaphone}
                  title="Campanha"
                  hint="Nome para encontrar depois e o objetivo comercial."
                  action={(
                    <AiPopover label="Criar com IA" title="Montar a campanha com IA" hint="Descreva a ação; a IA escolhe segmentos e filtros reais e escreve a mensagem." open={campaignAiOpen} onOpenChange={setCampaignAiOpen}>
                      <textarea
                        value={campaignPrompt}
                        onChange={(event) => { setCampaignPrompt(event.target.value); setCampaignAiError(""); }}
                        rows={3}
                        maxLength={2000}
                        placeholder="Ex.: Reativar clientes Ouro e Diamante sem comprar há mais de 90 dias com cupom de 15%"
                        aria-label="Descreva a campanha para a IA"
                        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#C4D600]"
                      />
                      <div className="flex flex-wrap gap-1">
                        {["Reativação de clientes Ouro e Diamante sem comprar há mais de 90 dias com cupom de 15%", "Novidades de armações para clientes fiéis que compraram nos últimos 180 dias"].map((suggestion) => (
                          <button key={suggestion} type="button" onClick={() => { setCampaignPrompt(suggestion); setCampaignAiError(""); }} className="max-w-full truncate rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:border-[#002187] hover:text-[#002187] dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600] cursor-pointer" title={suggestion}>{suggestion}</button>
                        ))}
                      </div>
                      {campaignAiError && <p role="alert" className="text-[11px] font-medium text-[#9a3d12] dark:text-[#F7915E]">{campaignAiError}</p>}
                      <button type="button" disabled={isGeneratingCampaign || !campaignPrompt.trim()} onClick={() => void generateCampaignWithAi().then((ok) => { if (ok) setCampaignAiOpen(false); })} className={`${primaryButton} w-full justify-center`}>
                        {isGeneratingCampaign ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{isGeneratingCampaign ? "Gerando..." : "Gerar campanha"}
                      </button>
                    </AiPopover>
                  )}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome da campanha <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} placeholder="Ex.: Black Friday Ouro e Diamante" aria-required="true" className={inputClass} /></label>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Objetivo <span className="font-normal text-slate-400">(opcional)</span></span><input value={campaignObjective} onChange={(event) => setCampaignObjective(event.target.value)} placeholder="Ex.: Recuperar clientes inativos" className={inputClass} /></label>
                    <div className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Canal de envio</span><ChannelCard /></div>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Categoria na Meta</span><select value={campaignCategory} onChange={(event) => setCampaignCategory(event.target.value as "MARKETING" | "UTILITY")} className={`${inputClass} cursor-pointer`}><option value="MARKETING">Marketing: promoções e ofertas</option><option value="UTILITY">Utilidade: avisos e transações</option></select></label>
                  </div>
                </WizardSection>

                <WizardSection icon={Users} title="Público" hint="Um ou mais segmentos salvos. Cada pessoa recebe uma única mensagem.">
                  {campaignAudienceDescription && <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{campaignAudienceDescription}</p>}
                  <div className="grid items-start gap-3 md:grid-cols-2">
                    <FormMultiSelect
                      label="Segmentos"
                      selected={selectedAudienceSegments}
                      options={segmentOptions}
                      onChange={(segmentNames) => { setSelectedAudienceSegments(segmentNames); setFormError(""); }}
                      placeholder="Selecione os segmentos"
                      required
                    />
                    <AudienceSummaryCard state={audienceValid?.signature === overlapSignature ? audienceValid : selectedAudienceSegments.length ? { loading: true } : null} segments={selectedAudienceSegments.length} />
                  </div>
                  {campaignCriteriaFilters.length > 0 && (
                    <div className="space-y-1.5 rounded-xl border border-[#C4D600]/40 bg-[#C4D600]/10 p-3">
                      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Filtros da IA (todos precisam bater)</p><button type="button" onClick={() => setCampaignCriteriaFilters([])} className="text-[11px] font-semibold text-[#002187] hover:underline dark:text-[#C4D600] cursor-pointer">Remover filtros</button></div>
                      <ul className="flex flex-wrap gap-1.5">
                        {campaignCriteriaFilters.flatMap((criterion) => criterion.regras ?? []).map((rule, index) => (
                          <li key={`${rule.campo}-${index}`} className="rounded-lg bg-white/80 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">{rule.campo === "lastPurchase" ? "Última compra" : rule.campo === "rfvpSegment" ? "Segmento RFV-P" : rule.campo === "pipelineStage" ? "Etapa do pipeline" : rule.campo === "tier" ? "Nível VIP" : rule.campo === "tag" ? "Tag" : rule.campo} {rule.operador === "older_days" ? "há mais de" : rule.operador === "in" ? "em" : "é"} {rule.valor}{rule.campo === "lastPurchase" ? " dias" : ""}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {audienceOverlapNotice && (
                    <details className="group rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                      <summary className="cursor-pointer list-none text-[11px] font-semibold text-slate-600 marker:hidden dark:text-slate-300"><span className="inline-flex items-center gap-1"><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />Sobreposição entre segmentos e custo estimado</span></summary>
                      <div className="mt-2">{audienceOverlapNotice}</div>
                    </details>
                  )}
                </WizardSection>

                <WizardSection icon={Bot} title="Quando o cliente responder" hint="Pode ser trocado depois, mesmo com a campanha em andamento.">
                  <CampaignAiReplyChoice value={campaignAiReply} onChange={setCampaignAiReply} />
                </WizardSection>
                {formError && <p role="alert" className="rounded-lg border border-[#F7915E]/40 bg-[#F7915E]/10 px-3 py-2 text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
              </div>
            </Step>
            <Step title="Mensagem" description="Modelo, variáveis e prévia">
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0 space-y-4">
                <WizardSection
                  icon={FileText}
                  title="Modelo oficial aprovado pela Meta"
                  hint="Fora da janela de 24 h a Meta só entrega modelos aprovados."
                  action={!campaignTemplate ? templateAiButton : undefined}
                >
                  <CampaignTemplatePicker value={campaignTemplate} onChange={changeCampaignTemplate} showPreview={false} paramsAction={templateAiButton} label="Modelo" emptyLabel={aiTemplateDraft ? "Novo modelo gerado pela IA (abaixo)" : "Sem modelo: mensagem livre"} />
                </WizardSection>
                {aiTemplateDraft && (
                  <section aria-label="Revisar modelo da Meta" className="space-y-3 rounded-2xl border border-[#C4D600]/50 bg-[#C4D600]/5 p-4 dark:bg-[#C4D600]/[0.04]">
                    <div className="flex items-start justify-between gap-2"><div><p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"><Sparkles className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Novo modelo gerado pela IA</p><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Revise e envie para análise. O disparo fica bloqueado até a Meta aprovar.</p></div><button type="button" onClick={() => setAiTemplateDraft(null)} className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer">Descartar</button></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span>Categoria</span><select value={campaignCategory} onChange={(event) => { const category = event.target.value as "MARKETING" | "UTILITY"; setCampaignCategory(category); setAiTemplateDraft((current) => current ? { ...current, category } : current); }} className={`${inputClass} cursor-pointer`}><option value="MARKETING">Marketing</option><option value="UTILITY">Utilidade</option></select></label>
                      <label className="block space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span>Rodapé (opcional, até 60)</span><input maxLength={60} value={aiTemplateDraft.footer} onChange={(event) => setAiTemplateDraft((current) => current ? { ...current, footer: event.target.value } : current)} className={inputClass} /></label>
                      {aiTemplateDraft.headerFormat === "TEXT" && <label className="block space-y-1 text-[11px] font-semibold text-slate-600 sm:col-span-2 dark:text-slate-300"><span>Cabeçalho de texto (opcional)</span><input maxLength={60} value={aiTemplateDraft.headerText} onChange={(event) => setAiTemplateDraft((current) => current ? { ...current, headerText: event.target.value } : current)} className={inputClass} /></label>}
                    </div>
                    {aiTemplateDraft.params.map((field, index) => (
                      <label key={`template-param-${index}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span className="rounded-md bg-[#002187]/10 px-1.5 py-0.5 text-center font-mono font-bold text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">{`{{${index + 1}}}`}</span><select value={field} onChange={(event) => updateGeneratedTemplateParam(index, event.target.value)} aria-label={`Conteúdo da variável ${index + 1}`} className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-normal dark:border-slate-700 dark:bg-slate-900 cursor-pointer">{messageVariables.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    ))}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Respostas rápidas (opcional)</p><button type="button" disabled={aiTemplateDraft.buttons.length >= 3} onClick={() => setAiTemplateDraft((current) => current ? { ...current, buttons: [...current.buttons, { type: "QUICK_REPLY", text: "" }] } : current)} className="text-[10px] font-semibold text-[#002187] hover:underline disabled:opacity-50 dark:text-[#C4D600] cursor-pointer">Adicionar botão</button></div>
                      {aiTemplateDraft.buttons.map((button, index) => <div key={`template-button-${index}`} className="flex gap-2"><input maxLength={25} value={button.text} onChange={(event) => setAiTemplateDraft((current) => current ? { ...current, buttons: current.buttons.map((item, i) => i === index ? { ...item, text: event.target.value } : item) } : current)} placeholder="Texto do botão" className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-normal dark:border-slate-700 dark:bg-slate-900" /><button type="button" aria-label="Remover botão" onClick={() => setAiTemplateDraft((current) => current ? { ...current, buttons: current.buttons.filter((_, i) => i !== index) } : current)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><X className="h-3.5 w-3.5" /></button></div>)}
                    </div>
                    <div className="flex justify-end border-t border-slate-200 pt-2 dark:border-slate-700">
                      <button type="button" disabled={isSubmittingTemplate || isUploading || !form.mensagem.trim()} onClick={() => { const campaign = buildNewCampaign(); if (campaign) void submitTemplateForMeta(campaign, { ...aiTemplateDraft, body: form.mensagem.trim(), category: campaignCategory }); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer"><Send className="h-3.5 w-3.5" />{isSubmittingTemplate ? "Enviando..." : "Aprovar e enviar para análise da Meta"}</button>
                    </div>
                  </section>
                )}
                {!campaignTemplate && (
                  <WizardSection icon={MessageSquareText} title={aiTemplateDraft ? "Texto do novo modelo" : "Mensagem livre"} hint={aiTemplateDraft ? "Use {{1}}, {{2}}... para as variáveis." : "Clique numa variável para inserir no ponto do cursor."}>
                    {!aiTemplateDraft && (
                      <div className="flex flex-wrap gap-1.5">
                        {messageVariables.map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertMessageVariable(item.value)}
                            className="rounded-md border border-[#002187]/20 bg-[#002187]/5 px-2 py-1 text-[10px] font-semibold text-[#002187] transition-colors hover:bg-[#C4D600]/30 dark:border-[#C4D600]/30 dark:bg-[#C4D600]/10 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/20 cursor-pointer"
                            title={`Inserir ${item.value}`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span className="sr-only">Mensagem</span>
                      <textarea ref={messageInputRef} rows={5} value={form.mensagem} onChange={(event) => aiTemplateDraft ? updateGeneratedTemplateBody(event.target.value) : (setForm({ ...form, mensagem: event.target.value }), setFormError(""))} aria-required="true" placeholder="Olá {{nome}}! ..." className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
                    </label>
                  </WizardSection>
                )}
                <WizardSection icon={ImageIcon} title="Mídia" hint={campaignTemplate?.hasImage ? "O modelo tem imagem no cabeçalho: sem anexo, vai a imagem do modelo." : "Opcional: imagem, vídeo ou PDF."}>
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
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{isUploading ? "Enviando arquivos..." : selectedAttachments.length ? `${selectedAttachments.length} arquivo(s) anexado(s)` : "Nenhum arquivo anexado"}</p>
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
                </WizardSection>
                {formError && <p role="alert" className="rounded-lg border border-[#F7915E]/40 bg-[#F7915E]/10 px-3 py-2 text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
              </div>
              <aside aria-label="Prévia no WhatsApp" className="min-w-0 lg:sticky lg:top-0 lg:self-start">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><Smartphone className="h-3.5 w-3.5" />Como o cliente recebe</p>
                {messagePreview}
              </aside>
              </div>
            </Step>
            <Step title="Agendamento e revisão" description="Quando enviar e conferência">
              <div className="space-y-4">
                <WizardSection icon={CalendarClock} title="Quando enviar" hint="Horário de Brasília. Agendada, a campanha começa sozinha no horário escolhido.">
                  <div role="radiogroup" aria-label="Quando enviar" className="grid gap-2 sm:grid-cols-2">
                    {([
                      { mode: "now" as const, icon: Send, title: "Enviar agora", description: "O envio começa assim que você confirmar." },
                      { mode: "later" as const, icon: CalendarClock, title: "Agendar data e horário", description: "Escolha o dia e a hora do disparo." },
                    ]).map((option) => {
                      const active = scheduleMode === option.mode;
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.mode}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            setScheduleMode(option.mode);
                            setFormError("");
                            if (option.mode === "later" && !scheduleDay) setScheduleDay(addDays(brDay(), 1));
                          }}
                          className={`flex min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition-colors cursor-pointer ${active ? "border-[#002187] bg-[#002187]/5 ring-1 ring-[#002187]/30 dark:border-[#C4D600] dark:bg-[#C4D600]/10 dark:ring-[#C4D600]/30" : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"}`}
                        >
                          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-[#002187] dark:text-[#C4D600]" : "text-slate-400"}`} />
                          <span className="min-w-0"><span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{option.title}</span><span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{option.description}</span></span>
                        </button>
                      );
                    })}
                  </div>
                  {scheduleMode === "later" && (
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-end">
                      <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Data</span><input type="date" value={scheduleDay} min={brDay()} max={addDays(brDay(), MAX_SCHEDULE_DAYS)} onChange={(event) => { setScheduleDay(event.target.value); setFormError(""); }} className={`${inputClass} cursor-pointer dark:[color-scheme:dark]`} /></label>
                      <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Horário</span><input type="time" value={scheduleTime} onChange={(event) => { setScheduleTime(event.target.value); setFormError(""); }} className={`${inputClass} cursor-pointer dark:[color-scheme:dark]`} /></label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{scheduleError ? <span className="font-medium text-[#9a3d12] dark:text-[#F7915E]">{scheduleError}</span> : `Dispara em ${scheduleLabel}.`}</p>
                    </div>
                  )}
                  {scheduleMode === "later" && !scheduleError && outsideSendWindow(scheduleDay, scheduleTime, deliverySettings.sendWindow) && (
                    <p role="status" className="flex items-start gap-1.5 rounded-lg bg-[#F7915E]/10 p-2.5 text-[11px] text-[#9a3d12] dark:text-[#F7915E]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />O horário está fora da janela permitida ({deliverySettings.sendWindow?.start} às {deliverySettings.sendWindow?.end}{deliverySettings.sendWindow?.skipSundays ? ", sem domingos" : ""}): o envio espera o próximo início da janela.</p>
                  )}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700">
                    <button type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((current) => !current)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                      <span className="flex min-w-0 items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" /><span className="truncate">Envio seguro: ritmo, janela de horário e follow-up</span></span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">{safetySummary}<ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} /></span>
                    </button>
                    {showAdvanced && (
                      <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-700">
                        <CampaignDeliverySettings value={deliverySettings} onChange={setDeliverySettings} />
                        {cooldownToggle}
                      </div>
                    )}
                  </div>
                </WizardSection>

                <section aria-label="Revisão da campanha" className="space-y-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"><ClipboardCheck className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Revisão antes de confirmar</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ReviewItem
                      label="Campanha"
                      icon={Megaphone}
                      value={form.nome || "—"}
                      detail={[campaignObjective, campaignCategory === "UTILITY" ? "Utilidade" : "Marketing", campaignAiReply ? "IA atende as respostas" : "Respostas na fila humana"].filter(Boolean).join(" · ")}
                      onEdit={() => setCreateStep(1)}
                    />
                    <ReviewItem
                      label="Público válido"
                      icon={Users}
                      value={<span className="tabular-nums">{validSummary ? `${int(validSummary.valid)} contato${validSummary.valid === 1 ? "" : "s"}` : "Calculando..."}</span>}
                      detail={selectedAudienceSegments.join(", ") || "—"}
                      onEdit={() => setCreateStep(1)}
                    />
                    <ReviewItem
                      label="Modelo"
                      icon={FileText}
                      value={campaignTemplate ? campaignTemplate.name : aiTemplateDraft ? "Novo modelo (aguardando envio à Meta)" : "Mensagem livre"}
                      detail={campaignTemplate?.params.length ? campaignTemplate.params.map((field, index) => `{{${index + 1}}} ${isFixedParam(field) ? `"${fixedText(field)}"` : fieldLabel(field)}`).join(" · ") : selectedAttachments.length ? `${selectedAttachments.length} arquivo(s) anexado(s)` : campaignTemplate?.hasImage ? "Imagem do modelo" : "Sem variáveis"}
                      onEdit={() => setCreateStep(2)}
                    />
                    <ReviewItem
                      label="Disparo"
                      icon={Clock3}
                      value={scheduleMode === "later" ? (scheduleError ? "Horário inválido" : scheduleLabel) : "Agora, ao confirmar"}
                      detail={safetySummary}
                    />
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700">
                    <header className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
                      <h4 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Smartphone className="h-3 w-3" />Mensagem</h4>
                      <button type="button" onClick={() => setCreateStep(2)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#002187] hover:bg-[#002187]/5 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer"><Pencil className="h-3 w-3" />Editar</button>
                    </header>
                    <div className="custom-scrollbar h-auto max-h-48 space-y-1.5 overflow-y-auto px-3.5 pb-2.5 pt-1.5 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
                      {previewMedia.length > 0 && <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><Paperclip className="h-3 w-3" />{previewMedia.map((media) => media.name).join(", ")}</p>}
                      {(aiTemplateDraft?.headerText || campaignTemplate?.headerText) && <p className="font-semibold">{aiTemplateDraft?.headerText || campaignTemplate?.headerText}</p>}
                      <p className="whitespace-pre-wrap break-words">{previewBody.trim() || <span className="text-slate-400">Sem texto.</span>}</p>
                      {(aiTemplateDraft?.footer || campaignTemplate?.footer) && <p className="text-[11px] text-slate-500 dark:text-slate-400">{aiTemplateDraft?.footer || campaignTemplate?.footer}</p>}
                      {(aiTemplateDraft?.buttons ?? campaignTemplate?.buttons ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {(aiTemplateDraft?.buttons ?? campaignTemplate?.buttons ?? []).map((button, index) => <span key={`${button.text}-${index}`} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-[#002187] dark:border-slate-700 dark:text-[#C4D600]">{button.text}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
                {aiTemplateDraft && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">O modelo gerado pela IA ainda precisa ir para análise. Volte à etapa Mensagem e clique em “Aprovar e enviar para análise da Meta”; o disparo fica bloqueado até a aprovação.</p>}
                {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{formError}</p>}
                <p
                  role="status"
                  title={cooldownDays > 0 && !ignoreCooldown ? `Quem recebeu campanha nos últimos ${cooldownDays} dias é pulado, então o custo real tende a ser menor.` : undefined}
                  className="flex min-w-0 items-center gap-1.5 truncate rounded-lg border border-[#C4D600]/40 bg-[#C4D600]/10 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200"
                >
                  <Send className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                  <span className="truncate">
                    <b className="tabular-nums">{validSummary ? `${int(validSummary.valid)} contato${validSummary.valid === 1 ? "" : "s"} válido${validSummary.valid === 1 ? "" : "s"}` : "Calculando público..."}</b>
                    {validSummary && validSummary.optedOut + validSummary.invalidPhone > 0 ? ` · ${int(validSummary.optedOut + validSummary.invalidPhone)} fora (descadastro ou sem celular)` : ""}
                    {" · "}
                    {!dispatchEstimate || dispatchEstimate.loading ? "calculando custo..." : dispatchEstimate.error ? <span className="text-[#9a3d12] dark:text-[#F7915E]">{dispatchEstimate.error}</span> : <>custo estimado na Meta <b>{dispatchEstimate.cost === null ? "indisponível" : dispatchEstimate.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>{cooldownDays > 0 && !ignoreCooldown ? " (máx.)" : ""}</>}
                  </span>
                </p>
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
                <section aria-label="Ações rápidas" className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => duplicateCampaign(selectedCampaign)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#002187] hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:text-[#C4D600] dark:hover:border-[#C4D600] cursor-pointer"><Copy className="h-3.5 w-3.5" />Duplicar campanha</button>
                  {canResend(selectedCampaign) && (
                    <>
                      <button type="button" onClick={() => createResendCampaign(selectedCampaign, "not_read")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#002187] hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:text-[#C4D600] dark:hover:border-[#C4D600] cursor-pointer"><Repeat className="h-3.5 w-3.5" />Reenviar para não lidos</button>
                      <button type="button" onClick={() => createResendCampaign(selectedCampaign, "not_replied")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#002187] hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:text-[#C4D600] dark:hover:border-[#C4D600] cursor-pointer"><Repeat className="h-3.5 w-3.5" />Reenviar para não respondidos</button>
                    </>
                  )}
                </section>
                <section aria-label="Andamento do disparo" className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${displayStyles[selectedDisplay]}`}>{selectedDisplay === "Enviando" && <RefreshCw className="h-3 w-3 animate-spin" />}{selectedDisplay}</span>
                    {selectedJob && (selectedJob.status === "running" || selectedJob.status === "paused") && (
                      <div className="flex items-center gap-2">
                        {selectedJob.status === "paused" ? (
                          <button type="button" disabled={jobBusy === selectedCampaign.id} onClick={() => void controlDispatch(selectedCampaign.id, "resume")} className={primaryButton}><Play className="h-3.5 w-3.5" />{selectedJob.scheduledAt && selectedJob.cursor === 0 && selectedJob.pause?.kind === "schedule" ? "Enviar agora" : "Retomar"}</button>
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
                        {(selectedJob.duplicatesRemoved ?? 0) > 0 && ` · ${int(selectedJob.duplicatesRemoved ?? 0)} repetidos entre segmentos unificados (1 mensagem por cliente)`}
                        {(selectedJob.coldRemoved ?? 0) > 0 && ` · ${int(selectedJob.coldRemoved ?? 0)} leads frios fora do envio`}
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

                {selectedLocked || selectedMetaPending ? (
                  <section aria-label="Conteúdo enviado" className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{selectedMetaPending ? "Aguardando análise da Meta" : "Conteúdo enviado"}</p>
                    {/* Mesmo depois do disparo, o atendimento das respostas pode mudar a qualquer momento (vale na hora). */}
                    <CampaignAiReplyChoice value={selectedCampaign.aiAutoReplyEnabled !== false} onChange={(enabled) => void changeCampaignAiMode(selectedCampaign, enabled)} />
                    {selectedMetaPending && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">O disparo está bloqueado. A campanha será liberada automaticamente quando o webhook ou a consulta de status confirmar a aprovação do template.</p>}
                    {selectedCampaign.metaApprovalStatus === "REJECTED" && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">A Meta rejeitou o template: {selectedCampaign.metaApprovalReason || "motivo não informado"}</p>}
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
                    {audienceOverlapNotice}
                    <CampaignTemplatePicker value={campaignTemplate} onChange={changeCampaignTemplate} />
                    <CampaignAiReplyChoice value={campaignAiReply} onChange={(enabled) => void changeCampaignAiMode(selectedCampaign, enabled)} />
                    <CampaignDeliverySettings value={deliverySettings} onChange={setDeliverySettings} />
                    {(selectedCampaign.metaApprovalStatus === "REJECTED" || selectedCampaign.metaApprovalStatus === "SUBMISSION_FAILED") && <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30"><p className="text-xs font-semibold text-red-800 dark:text-red-200">{selectedCampaign.metaApprovalStatus === "REJECTED" ? `Rejeitada pela Meta: ${selectedCampaign.metaApprovalReason || "motivo não informado"}` : `Não foi possível submeter: ${selectedCampaign.metaApprovalReason || "verifique a integração e tente novamente"}`}</p><div className="flex gap-2"><input value={templatePrompt} onChange={(event) => setTemplatePrompt(event.target.value)} placeholder="Orientação para uma nova versão do template" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900" /><button type="button" disabled={isGeneratingTemplate} onClick={() => void generateMessageTemplateWithAi()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] cursor-pointer"><Sparkles className="h-3.5 w-3.5" />{isGeneratingTemplate ? "Gerando..." : "Gerar nova versão"}</button></div></div>}
                    {aiTemplateDraft && <div className="space-y-2 rounded-lg border border-[#C4D600]/40 bg-[#C4D600]/5 p-3"><p className="text-xs font-semibold text-slate-800 dark:text-white">Template para reenviar à análise</p><label className="block space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span>Categoria</span><select value={campaignCategory} onChange={(event) => setCampaignCategory(event.target.value as "MARKETING" | "UTILITY")} className={inputClass}><option value="MARKETING">MARKETING</option><option value="UTILITY">UTILITY</option></select></label><label className="block space-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span>Rodapé</span><input maxLength={60} value={aiTemplateDraft.footer} onChange={(event) => setAiTemplateDraft((current) => current ? { ...current, footer: event.target.value } : current)} className={inputClass} /></label><button type="button" disabled={isSubmittingTemplate} onClick={() => void submitTemplateForMeta({ ...selectedCampaign, nome: form.nome.trim(), publico: selectedAudienceSegments.join(", "), audienceSegmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id), criteriaFilters: campaignCriteriaFilters, objective: campaignObjective, audienceDescription: campaignAudienceDescription, metaCategory: campaignCategory, mensagem: form.mensagem.trim(), metaTemplateDraft: { ...aiTemplateDraft, body: form.mensagem.trim(), category: campaignCategory } }, { ...aiTemplateDraft, body: form.mensagem.trim(), category: campaignCategory }, false)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] cursor-pointer"><Send className="h-3.5 w-3.5" />{isSubmittingTemplate ? "Enviando..." : "Aprovar e reenviar para análise"}</button></div>}
                    {templateAiError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{templateAiError}</p>}
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Mensagem <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><textarea rows={5} value={form.mensagem} readOnly={Boolean(campaignTemplate)} onChange={(event) => aiTemplateDraft ? updateGeneratedTemplateBody(event.target.value) : (setForm({ ...form, mensagem: event.target.value }), setFormError(""))} className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
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
              {!selectedLocked && !selectedMetaPending && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={saveCampaign} className={ghostButton}>Salvar alterações</button>
                  {!isDispatchBlocked(selectedCampaign) && <button type="button" disabled={isDispatching} onClick={() => openDispatchConfirm([selectedCampaign.id], "single")} className={primaryButton}><Send className="h-3.5 w-3.5" />Disparar agora</button>}
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
