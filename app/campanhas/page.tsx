"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronUp,
  ChevronsUpDown,
  Clock3,
  FileText,
  Film,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Square,
  SquareCheck,
  X,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import Stepper, { Step } from "@/components/Stepper";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { FormSelect } from "@/components/FormSelect";
import { FormMultiSelect } from "@/components/FormMultiSelect";
import { useCrmData } from "@/hooks/useCrmData";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { useToast } from "@/components/ToastProvider";

type CampaignStatus = "Ativa" | "Pronta para envio" | "Agendada" | "Pausada" | "Rascunho" | "Enviando" | "Enviada" | "Envio parcial" | "Falha no envio";
type CampaignFilter = "Todas" | CampaignStatus;
type CampaignDurationUnit = "horas" | "dias" | "semanas" | "meses";

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

interface CampaignDispatchResult {
  sent: number;
  failed: number;
  campaigns: { nome: string; sent: number; failed: number; status: CampaignStatus }[];
  errors: string[];
}

interface CampaignDurationSettings {
  indefinite: boolean;
  amount: string;
  unit: CampaignDurationUnit;
}

interface ActiveCampaignDuration {
  amount: number;
  unit: CampaignDurationUnit;
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
  activeDuration?: ActiveCampaignDuration | null;
  activeUntil?: string;
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

const initialDurationSettings: CampaignDurationSettings = {
  indefinite: true,
  amount: "1",
  unit: "dias",
};

const durationUnitOptions: CampaignDurationUnit[] = ["horas", "dias", "semanas", "meses"];

const durationSummary = (duration?: ActiveCampaignDuration | null) =>
  duration ? `${duration.amount} ${duration.unit}` : "Indeterminado";

const getExpirationDate = (start: Date, duration: ActiveCampaignDuration) => {
  const expiration = new Date(start);
  if (duration.unit === "horas") expiration.setHours(expiration.getHours() + duration.amount);
  if (duration.unit === "dias") expiration.setDate(expiration.getDate() + duration.amount);
  if (duration.unit === "semanas") expiration.setDate(expiration.getDate() + duration.amount * 7);
  if (duration.unit === "meses") {
    const day = expiration.getDate();
    expiration.setDate(1);
    expiration.setMonth(expiration.getMonth() + duration.amount);
    const lastDayOfMonth = new Date(expiration.getFullYear(), expiration.getMonth() + 1, 0).getDate();
    expiration.setDate(Math.min(day, lastDayOfMonth));
  }
  return expiration;
};

function CampaignDurationFields({
  settings,
  onChange,
}: {
  settings: CampaignDurationSettings;
  onChange: (settings: CampaignDurationSettings) => void;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-xs font-semibold text-slate-600 dark:text-slate-300">Duração ativa</legend>
      <div role="radiogroup" aria-label="Duração ativa da campanha" className="grid grid-cols-2 gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={settings.indefinite}
          onClick={() => onChange({ ...settings, indefinite: true })}
          className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${settings.indefinite ? "border-[#002187] bg-[#002187]/5 text-[#002187] dark:border-[#C4D600] dark:bg-[#C4D600]/10 dark:text-[#C4D600]" : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
        >
          Indeterminada
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!settings.indefinite}
          onClick={() => onChange({ ...settings, indefinite: false })}
          className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${!settings.indefinite ? "border-[#002187] bg-[#002187]/5 text-[#002187] dark:border-[#C4D600] dark:bg-[#C4D600]/10 dark:text-[#C4D600]" : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
        >
          Por período
        </button>
      </div>
      {!settings.indefinite && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Quantidade
            <input
              type="number"
              min="1"
              step="1"
              value={settings.amount}
              onChange={(event) => onChange({ ...settings, amount: event.target.value })}
              aria-label="Quantidade da duração"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
            />
          </label>
          <FormSelect
            label="Unidade"
            value={settings.unit}
            options={durationUnitOptions}
              onChange={(unit) => {
                const selectedUnit = durationUnitOptions.find((option) => option === unit);
                if (selectedUnit) onChange({ ...settings, unit: selectedUnit });
              }}
          />
        </div>
      )}
      <p className="text-[10px] text-slate-400">O período começa quando a campanha é ativada.</p>
    </fieldset>
  );
}

const statusStyles: Record<CampaignStatus, string> = {
  Ativa: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  "Pronta para envio": "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]",
  Agendada: "bg-blue-100 text-[#002187] dark:bg-blue-950/50 dark:text-blue-300",
  Pausada: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Rascunho: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
  Enviando: "bg-[#002187]/10 text-[#002187] dark:bg-[#002187]/30 dark:text-[#C4D600]",
  Enviada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  "Envio parcial": "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
  "Falha no envio": "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
};

const filters: CampaignFilter[] = ["Todas", "Ativa", "Pronta para envio", "Agendada", "Pausada", "Rascunho", "Enviando", "Enviada", "Envio parcial", "Falha no envio"];
const presetAudienceCriteria: AudienceCriterion[] = [
  { id: "criteria-30d", nome: "Comprou nos últimos 30 dias", tipo: "geral" },
  { id: "criteria-90d", nome: "Comprou nos últimos 90 dias", tipo: "geral" },
  { id: "criteria-180d", nome: "Comprou nos últimos 180 dias", tipo: "geral" },
  { id: "criteria-inactive-180d", nome: "Sem compra há mais de 180 dias", tipo: "geral" },
  { id: "criteria-no-nps", nome: "Ainda não respondeu ao NPS", tipo: "geral" },
  { id: "criteria-low-nps", nome: "Recebeu NPS abaixo de 7", tipo: "geral" },
  { id: "criteria-valid-phone", nome: "Telefone válido", tipo: "geral" },
];

export default function CampanhasPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const toast = useToast();
  const { data: campaigns, setData: setCampaigns, saveData: persistCampaigns, isLoading: campaignsLoading, error: campaignsError, reloadData: reloadCampaigns } = useCrmData<Campaign[]>("campaigns", []);
  const { data: segments, isLoading: segmentsLoading } = useCrmData<CampaignAudienceSegment[]>("segments", []);
  const { data: savedAudienceCriteria, isLoading: criteriaLoading } = useCrmData<AudienceCriterion[]>("criteria", []);
  const segmentOptions = segments.map((segment) => segment.nome);
  const segmentOptionSet = new Set(segmentOptions);
  const [stores, setStores] = useState<{ number: number; active: boolean }[]>([]);
  const [storesError, setStoresError] = useState("");
  const [dispatchError, setDispatchError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<CampaignFilter>("Todas");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedAudienceSegments, setSelectedAudienceSegments] = useState<string[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Map<File, string>>(new Map());
  const attachmentPreviewUrlsRef = useRef(new Map<File, string>());
  const [durationSettings, setDurationSettings] = useState<CampaignDurationSettings>(initialDurationSettings);
  const [form, setForm] = useState({ nome: "", publico: "", mensagem: "" });
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<{ mode: "single" | "batch"; ids: string[] } | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchProgress, setDispatchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [dispatchResult, setDispatchResult] = useState<CampaignDispatchResult | null>(null);
  const [sortConfig, setSortConfig] = useState<{ field: string; order: "asc" | "desc" }>({ field: "atualizacao", order: "desc" });
  const handleSort = (field: string) => {
    setSortConfig((prev) => {
      const nextOrder = prev.field === field && prev.order === "desc" ? "asc" : "desc";
      return { field, order: nextOrder };
    });
  };
  const SortIndicator = ({ field }: { field: string }) => {
    const isActive = sortConfig.field === field;
    if (!isActive) return <ChevronsUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />;
    return <ChevronUp className={`h-3 w-3 transition-transform ${sortConfig.order === "desc" ? "rotate-180" : ""} text-[#002187] dark:text-[#C4D600]`} />;
  };
  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const dir = sortConfig.order === "asc" ? 1 : -1;
    switch (sortConfig.field) {
      case "nome":
        return dir * (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
      case "publico":
        return dir * (a.publico ?? "").localeCompare(b.publico ?? "", "pt-BR");
      case "status":
        return dir * (a.status ?? "").localeCompare(b.status ?? "", "pt-BR");
      case "envios":
        return dir * ((a.disparos ?? 0) - (b.disparos ?? 0));
      case "respostas":
        return dir * ((a.taxaResposta ?? 0) - (b.taxaResposta ?? 0));
      case "atualizacao":
        return dir * (new Date(a.dataAtualizacao ?? 0).getTime() - new Date(b.dataAtualizacao ?? 0).getTime());
      default:
        return 0;
    }
  });

  useEffect(() => {
    let active = true;
    fetch("/api/segments/audience")
      .then(async (response) => {
        const result = await response.json() as { data?: { number: number; active: boolean }[]; error?: string };
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
    ...[...stores].sort((a, b) => a.number - b.number).map((store) => ({
      id: `store-${store.number}`,
      nome: `Loja ${store.number}`,
      tipo: "loja" as const,
      inativo: !store.active,
    })),
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

  useEffect(() => {
    const expireCampaigns = () => {
      const now = Date.now();
      setCampaigns((current) => {
        let hasExpiredCampaign = false;
        const updated = current.map((campaign) => {
          if (campaign.status !== "Ativa" || !campaign.activeUntil || Date.parse(campaign.activeUntil) > now) return campaign;
          hasExpiredCampaign = true;
          return { ...campaign, status: "Pausada" as const, activeUntil: undefined, dataAtualizacao: "Período encerrado" };
        });
        return hasExpiredCampaign ? updated : current;
      });
      setSelectedCampaign((current) => {
        if (!current || current.status !== "Ativa" || !current.activeUntil || Date.parse(current.activeUntil) > now) return current;
        return { ...current, status: "Pausada", activeUntil: undefined, dataAtualizacao: "Período encerrado" };
      });
    };
    const intervalId = window.setInterval(expireCampaigns, 10_000);
    return () => window.clearInterval(intervalId);
  }, [setCampaigns]);

  const filteredCampaigns = sortedCampaigns.filter((campaign) => {
    const matchesSearch = `${campaign.nome} ${campaign.publico} ${campaign.status}`.toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR"));
    return matchesSearch && (activeFilter === "Todas" || campaign.status === activeFilter);
  });

  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "Ativa");
  const scheduledCampaigns = campaigns.filter((campaign) => campaign.status === "Agendada" || campaign.status === "Pronta para envio").length;
  const sentMessages = campaigns.reduce((total, campaign) => total + (campaign.disparos ?? 0), 0);

  const metrics = [
    { label: "Campanhas", value: campaigns.length.toString(), detail: "na biblioteca", icon: MessageSquare, color: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Ativas no CRM", value: activeCampaigns.length.toString(), detail: "status cadastrado", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    { label: "Envios", value: sentMessages.toLocaleString("pt-BR"), detail: "aceitos pelo WhatsApp", icon: Send, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
    { label: "Respostas", value: "—", detail: "indisponível sem provedor", icon: ArrowUpRight, color: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]" },
  ];

  const createCampaign = () => {
    const nome = form.nome.trim();
    const publico = selectedAudienceSegments.join(", ").trim();
    const mensagem = form.mensagem.trim();
    const durationAmount = Number(durationSettings.amount);
    if (!nome || !publico || !mensagem || (!durationSettings.indefinite && (!Number.isInteger(durationAmount) || durationAmount < 1))) {
      setFormError(!nome ? "Informe o nome da campanha." : !publico ? "Selecione pelo menos um segmento para o público-alvo." : !mensagem ? "Escreva a mensagem da campanha." : "Informe uma duração válida, em quantidade inteira maior que zero.");
      return;
    }
    const campaign: Campaign = {
      id: `camp-${Date.now()}`,
      nome,
      publico: selectedAudienceSegments.join(", "),
      audienceSegmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id),
      status: "Rascunho",
      disparos: 0,
      rotuloDisparos: "contatos no público",
      taxaResposta: 0,
      dataAtualizacao: "Criada agora",
      mensagem,
      anexos: uploadedAttachments.length > 0 ? uploadedAttachments : selectedAttachments.map(({ name, size, type }) => ({ name, size, type })),
      activeDuration: durationSettings.indefinite ? null : { amount: durationAmount, unit: durationSettings.unit },
    };
    setCampaigns((current) => [campaign, ...current]);
    setActiveFilter("Todas");
    setSearchTerm("");
    setForm({ nome: "", publico: "", mensagem: "" });
    setSelectedAudienceSegments([]);
    clearSelectedAttachments();
    setDurationSettings(initialDurationSettings);
    setFormError("");
    setIsCreateOpen(false);
    toast.success("Campanha criada", `"${campaign.nome}" foi adicionada.`);
  };

  const startEditingCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    clearSelectedAttachments();
    setSelectedAudienceSegments(campaign.publico.split(", ").filter((segment) => segmentOptionSet.has(segment)));
    setDurationSettings(campaign.activeDuration
      ? { indefinite: false, amount: String(campaign.activeDuration.amount), unit: campaign.activeDuration.unit }
      : initialDurationSettings);
    setForm({ nome: campaign.nome, publico: campaign.publico, mensagem: campaign.mensagem });
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

  const addAttachments = async (files: FileList | null) => {
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
    const durationAmount = Number(durationSettings.amount);
    if (!nome || !publico || !mensagem || (!durationSettings.indefinite && (!Number.isInteger(durationAmount) || durationAmount < 1))) {
      setFormError(!nome ? "Informe o nome da campanha." : !publico ? "Selecione pelo menos um segmento para o público-alvo." : !mensagem ? "Escreva a mensagem da campanha." : "Informe uma duração válida, em quantidade inteira maior que zero.");
      return;
    }
    const activeDuration = durationSettings.indefinite ? null : { amount: durationAmount, unit: durationSettings.unit };
    const updatedCampaign = {
      ...selectedCampaign,
      nome,
      publico,
      audienceSegmentIds: segments.filter((segment) => selectedAudienceSegments.includes(segment.nome)).map((segment) => segment.id),
      mensagem,
      activeDuration,
      activeUntil: selectedCampaign.status === "Ativa" && activeDuration
        ? getExpirationDate(new Date(), activeDuration).toISOString()
        : selectedCampaign.status === "Ativa" ? undefined : selectedCampaign.activeUntil,
      dataAtualizacao: "Atualizada agora",
    };
    setCampaigns((current) => current.map((campaign) => campaign.id === updatedCampaign.id ? updatedCampaign : campaign));
    setSelectedCampaign(updatedCampaign);
    setSelectedAudienceSegments(publico.split(", "));
    setFormError("");
    toast.success("Campanha atualizada", `"${nome}" foi salva.`);
  };

  const toggleCampaign = (campaignId: string) => {
    const updateStatus = (campaign: Campaign): Campaign => {
      if (campaign.id !== campaignId) return campaign;
      if (campaign.status === "Enviando" || campaign.status === "Enviada" || campaign.status === "Envio parcial") return campaign;
      if (campaign.status === "Ativa") {
        return { ...campaign, status: "Pausada", activeUntil: undefined, dataAtualizacao: "Pausada agora" };
      }
      const activeUntil = campaign.activeDuration
        ? getExpirationDate(new Date(), campaign.activeDuration).toISOString()
        : undefined;
      return { ...campaign, status: "Ativa", activeUntil, dataAtualizacao: "Ativada agora" };
    };
    setCampaigns((current) => current.map(updateStatus));
    setSelectedCampaign((current) => current ? updateStatus(current) : current);
    const target = campaigns.find((campaign) => campaign.id === campaignId);
    if (target) toast.success(target.status === "Ativa" ? "Campanha pausada" : "Campanha ativada", `"${target.nome}" foi atualizada.`);
  };

  const openCreateCampaign = async () => {
    setForm({ nome: "", publico: "", mensagem: "" });
    setSelectedAudienceSegments([]);
    clearSelectedAttachments();
    setDurationSettings(initialDurationSettings);
    setFormError("");
    try {
      const response = await fetch("/api/crm/settings");
      const result = await response.json() as { data?: Partial<{
          campaignDurationIndefinite: boolean;
          defaultCampaignDuration: string;
          defaultCampaignUnit: CampaignDurationUnit;
        }>; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as configurações.");
      const saved = result.data;
      if (saved) {
        if (typeof saved.campaignDurationIndefinite === "boolean") {
          const unit = durationUnitOptions.find((option) => option === saved.defaultCampaignUnit);
          const amount = saved.defaultCampaignDuration;
          if (!saved.campaignDurationIndefinite && (!unit || !amount || !Number.isInteger(Number(amount)) || Number(amount) < 1)) {
            throw new Error("Duração padrão inválida");
          }
          setDurationSettings({
            indefinite: saved.campaignDurationIndefinite,
            amount: amount ?? initialDurationSettings.amount,
            unit: unit ?? initialDurationSettings.unit,
          });
        }
      }
    } catch {
      setFormError("Não foi possível ler a duração padrão nas configurações. Confira a preferência antes de continuar.");
    }
    setIsCreateOpen(true);
  };

  const dispatchCampaigns = async () => {
    if (!dispatchTarget || isDispatching) return;
    setIsDispatching(true);
    setDispatchError("");
    setDispatchResult(null);
    setDispatchProgress(null);
    try {
      if (campaignsLoading || segmentsLoading || criteriaLoading) {
        throw new Error("Aguarde o carregamento das campanhas e dos públicos antes de disparar.");
      }
      if (storesError) throw new Error(`Não foi possível carregar as lojas usadas nos públicos: ${storesError}`);

      let currentCampaigns = campaigns;
      const targetCampaigns = dispatchTarget.ids.map((id) => currentCampaigns.find((campaign) => campaign.id === id));
      if (targetCampaigns.some((campaign) => !campaign)) throw new Error("Uma das campanhas selecionadas não foi encontrada. Atualize a página e tente novamente.");
      const readyCampaigns = targetCampaigns as Campaign[];
      const blocked = readyCampaigns.find((campaign) => campaign.status === "Enviando" || campaign.status === "Enviada" || campaign.status === "Envio parcial");
      if (blocked) throw new Error(`"${blocked.nome}" está em envio ou já teve mensagens enviadas. Não é possível dispará-la novamente para evitar duplicidades.`);

      const connectionResponse = await fetch("/api/whatsapp/connection", { cache: "no-store" });
      const connection = await connectionResponse.json() as { state?: string; error?: string };
      if (!connectionResponse.ok) throw new Error(connection.error || "Não foi possível verificar a conexão do WhatsApp.");
      if (connection.state !== "open") throw new Error("WhatsApp desconectado. Conecte a conta em Configurações antes de disparar a campanha.");

      const groups: Record<string, AudienceCriterion[]> = {};
      const contactGroups: Record<string, string[]> = {};
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
          if (segment.modoPublico === "contatos") {
            contactGroups[key] = segment.contatosSelecionados ?? [];
            continue;
          }

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
          groups[key] = criteria as AudienceCriterion[];
        }
        groupKeysByCampaign.set(campaign.id, keys);
      }

      const audienceResponse = await fetch("/api/segments/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups, contactGroups, includeRecipients: true }),
      });
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

      const totalRecipients = [...recipientsByCampaign.values()].reduce((total, recipients) => total + recipients.length, 0);
      let completed = 0;
      let totalSent = 0;
      let totalFailed = 0;
      const results: CampaignDispatchResult["campaigns"] = [];
      const recipientErrors: string[] = [];
      setDispatchProgress({ completed, total: totalRecipients });

      for (const campaign of readyCampaigns) {
        const recipients = recipientsByCampaign.get(campaign.id) ?? [];
        const sendingCampaigns = currentCampaigns.map((item) => item.id === campaign.id
          ? { ...item, status: "Enviando" as const, dataAtualizacao: "Disparo em andamento" }
          : item);
        setCampaigns(sendingCampaigns);
        setSelectedCampaign((current) => current?.id === campaign.id ? sendingCampaigns.find((item) => item.id === campaign.id) ?? current : current);
        try {
          await persistCampaigns(sendingCampaigns);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "erro desconhecido";
          throw new Error(`A campanha não foi enviada porque não foi possível registrar o início do disparo: ${reason}`);
        }
        currentCampaigns = sendingCampaigns;

        let sent = 0;
        let failed = 0;
        const templateValues = (recipient: CampaignRecipient): Record<string, string> => ({
          nome: recipient.nome,
          email: recipient.email,
          telefone: recipient.telefone,
          segmento: recipient.segmento,
          data_nascimento: recipient.dataNascimento,
        });

        for (const recipient of recipients) {
          if (!recipient.telefone.trim()) {
            failed += 1;
            recipientErrors.push(`${recipient.nome}: telefone não cadastrado.`);
          } else {
            const values = templateValues(recipient);
            const text = campaign.mensagem.replace(/\{\{(nome|email|telefone|segmento|data_nascimento)\}\}/g, (_match, key: string) => values[key] ?? "");
            const formData = new FormData();
            formData.set("phone", recipient.telefone);
            formData.set("text", text);
            if (campaign.anexos && campaign.anexos.length > 0) {
              formData.set("mediaUrls", JSON.stringify(campaign.anexos.filter((a) => a.url).map((a) => ({ url: a.url, fileName: a.name, mimetype: a.type }))));
            }
            try {
              const sendResponse = await fetch("/api/whatsapp/send", { method: "POST", body: formData });
              const result = await sendResponse.json() as { error?: string };
              if (!sendResponse.ok) throw new Error(result.error || "O WhatsApp recusou o envio.");
              sent += 1;
            } catch (error) {
              failed += 1;
              recipientErrors.push(`${recipient.nome}: ${error instanceof Error ? error.message : "falha no envio."}`);
            }
          }
          completed += 1;
          setDispatchProgress({ completed, total: totalRecipients });
        }

        const status: CampaignStatus = failed === 0 ? "Enviada" : sent > 0 ? "Envio parcial" : "Falha no envio";
        const updated = currentCampaigns.map((item) => item.id === campaign.id
          ? { ...item, status, disparos: (item.disparos ?? 0) + sent, dataAtualizacao: `${new Date().toLocaleString("pt-BR")} · ${sent} enviados, ${failed} falhas` }
          : item);
        setCampaigns(updated);
        setSelectedCampaign((current) => current?.id === campaign.id ? updated.find((item) => item.id === campaign.id) ?? current : current);
        try {
          await persistCampaigns(updated);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "erro desconhecido";
          throw new Error(`${sent} mensagens foram aceitas, mas não foi possível salvar o status da campanha: ${reason}`);
        }
        currentCampaigns = updated;
        totalSent += sent;
        totalFailed += failed;
        results.push({ nome: campaign.nome, sent, failed, status });
      }

      setDispatchResult({ sent: totalSent, failed: totalFailed, campaigns: results, errors: recipientErrors.slice(0, 5) });
      if (totalFailed === 0) toast.success("Campanha enviada", `${totalSent} mensagem${totalSent === 1 ? "" : "s"} aceita${totalSent === 1 ? "" : "s"} pelo WhatsApp.`);
      else toast.error("Envio concluído com falhas", `${totalSent} mensagem${totalSent === 1 ? "" : "s"} enviada${totalSent === 1 ? "" : "s"}; ${totalFailed} falha${totalFailed === 1 ? "" : "s"}.`);
      if (dispatchTarget.mode === "batch") setSelectedCampaignIds(new Set());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível disparar a campanha.";
      setDispatchError(message);
      toast.error("Disparo não concluído", message);
    } finally {
      setIsDispatching(false);
    }
  };

  if (campaignsLoading) {
    return <LoadingSpinner fullScreen label="Carregando campanhas..." size={96} />;
  }

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] text-slate-800 transition-colors dark:bg-[#030d29] dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-4 mt-4 flex h-16 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm dark:border-slate-800 dark:bg-[#051647]">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Campanhas</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" aria-label="Alertas" title="Alertas" className="topbar-icon-button bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
                      </div>
        </header>

        <main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">
          {campaignsError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{campaignsError}</p>}
          <p className="rounded-lg border border-[#C4D600]/40 bg-[#C4D600]/10 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
            Campanhas e status são salvos no banco. Os disparos usam o WhatsApp conectado; o rastreamento de respostas ainda não está disponível.
          </p>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Campanhas</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Crie e organize campanhas segmentadas para relacionamento e conversão.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void reloadCampaigns()} disabled={campaignsLoading} aria-label="Atualizar lista" title="Atualizar lista" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${campaignsLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <button type="button" onClick={openCreateCampaign} className="inline-flex items-center gap-2 rounded-lg bg-[#051647] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer">
                <Plus className="h-4 w-4" />
                Nova campanha
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />{scheduledCampaigns} campanhas aguardando ação
            </div>
          </div>

          <section aria-label="Resumo das campanhas" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{metric.value}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{metric.detail}</p>
                    </div>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${metric.color}`}><Icon className="h-4 w-4" /></span>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Biblioteca de campanhas</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filteredCampaigns.length} de {campaigns.length} campanhas</p>
                </div>
                <label className="relative block w-full lg:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} aria-label="Buscar campanhas" placeholder="Buscar campanha ou público" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:focus:border-[#C4D600]" />
                </label>
              </div>
              <div role="tablist" aria-label="Filtrar campanhas" className="flex flex-wrap gap-1.5">
                {filters.map((filter) => {
                  const count = filter === "Todas" ? campaigns.length : campaigns.filter((campaign) => campaign.status === filter).length;
                  return (
                    <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} onClick={() => setActiveFilter(filter)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${activeFilter === filter ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"}`}>
                      {filter}<span className={`text-[10px] ${activeFilter === filter ? "opacity-75" : "text-slate-400"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800/40">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <button
                        type="button"
                        aria-label={filteredCampaigns.length > 0 && filteredCampaigns.every((c) => selectedCampaignIds.has(c.id)) ? "Desmarcar todas as campanhas" : "Selecionar todas as campanhas"}
                        onClick={() => {
                          const allSelected = filteredCampaigns.length > 0 && filteredCampaigns.every((c) => selectedCampaignIds.has(c.id));
                          setSelectedCampaignIds((prev) => {
                            const next = new Set(prev);
                            if (allSelected) {
                              filteredCampaigns.forEach((c) => next.delete(c.id));
                            } else {
                              filteredCampaigns.forEach((c) => next.add(c.id));
                            }
                            return next;
                          });
                        }}
                        className="grid h-4 w-4 place-items-center rounded border border-slate-300 text-[#051647] transition-colors hover:border-[#002187] dark:border-slate-600 dark:text-[#C4D600] dark:hover:border-[#C4D600] cursor-pointer hover:cursor-pointer"
                      >
                        {filteredCampaigns.length > 0 && filteredCampaigns.every((c) => selectedCampaignIds.has(c.id)) && <SquareCheck className="h-3.5 w-3.5 fill-current" />}
                      </button>
                    </th>
                    <th className="px-5 py-3"><button type="button" onClick={() => handleSort("nome")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Campanha<SortIndicator field="nome" /></button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => handleSort("publico")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Público<SortIndicator field="publico" /></button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => handleSort("status")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Status<SortIndicator field="status" /></button></th>
                    <th className="px-4 py-3 text-right"><button type="button" onClick={() => handleSort("envios")} className="ml-auto inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Envios<SortIndicator field="envios" /></button></th>
                    <th className="px-4 py-3 text-right"><button type="button" onClick={() => handleSort("respostas")} className="ml-auto inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Respostas<SortIndicator field="respostas" /></button></th>
                    <th className="px-5 py-3"><button type="button" onClick={() => handleSort("atualizacao")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Atualização<SortIndicator field="atualizacao" /></button></th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {campaignsLoading && (
                    <tr><td colSpan={8} className="px-5 py-8">
                      <LoadingSpinner label="Carregando campanhas..." className="w-full justify-center" />
                    </td></tr>
                  )}
                  {!campaignsLoading && filteredCampaigns.map((campaign) => {
                    const isSelected = selectedCampaignIds.has(campaign.id);
                    return (
                      <tr
                        key={campaign.id}
                        tabIndex={0}
                        aria-label={`Abrir detalhes de ${campaign.nome}`}
                        onClick={() => startEditingCampaign(campaign)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            startEditingCampaign(campaign);
                          }
                        }}
                        className={`group cursor-pointer transition-colors hover:bg-slate-50/80 focus-visible:outline-2 focus-visible:outline-[#002187] dark:hover:bg-slate-800/30 dark:focus-visible:outline-[#C4D600] ${isSelected ? "bg-[#C4D600]/10 dark:bg-[#C4D600]/10" : ""}`}
                      >
                        <td className="px-3 py-3.5" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={`Selecionar campanha ${campaign.nome}`}
                            onClick={() => {
                              setSelectedCampaignIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(campaign.id)) next.delete(campaign.id);
                                else next.add(campaign.id);
                                return next;
                              });
                            }}
                            className={`grid h-4 w-4 place-items-center rounded border transition-colors cursor-pointer hover:cursor-pointer ${isSelected ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-300 text-transparent hover:border-[#002187] dark:border-slate-600 dark:text-transparent dark:hover:border-[#C4D600]"}`}
                          >
                            <SquareCheck className="h-3.5 w-3.5 fill-current" />
                          </button>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><WhatsAppIcon className="h-4 w-4 fill-current" /></span>
                            <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-900 group-hover:text-[#002187] dark:text-white dark:group-hover:text-[#C4D600]">{campaign.nome}</span><span className="mt-0.5 block text-[10px] text-slate-400">WhatsApp</span></span>
                          </div>
                        </td>
                        <td className="max-w-52 px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{campaign.publico}</td>
                        <td className="px-4 py-3.5"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[campaign.status]}`}>{campaign.status}</span></td>
                        <td className="px-4 py-3.5 text-right text-xs text-slate-400" title="A integração de envio ainda não está configurada.">—</td>
                        <td className="px-4 py-3.5 text-right text-xs text-slate-400" title="A integração de envio ainda não está configurada.">—</td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{campaign.dataAtualizacao}</td>
                        <td className="px-4 py-3.5 text-right" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            aria-label={`Disparar campanha ${campaign.nome}`}
                            onClick={() => {
                              setDispatchTarget({ mode: "single", ids: [campaign.id] });
                              setDispatchResult(null);
                              setDispatchError("");
                              setDispatchProgress(null);
                              setDispatchConfirmOpen(true);
                            }}
                            disabled={isDispatching || campaign.status === "Enviando" || campaign.status === "Enviada" || campaign.status === "Envio parcial"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-[#002187] transition-colors hover:border-[#002187] hover:bg-[#002187]/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer hover:cursor-pointer"
                            title={campaign.status === "Enviando" ? "Esta campanha já está em envio" : campaign.status === "Enviada" || campaign.status === "Envio parcial" ? "Esta campanha já possui envios registrados" : "Disparar campanha"}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!campaignsLoading && filteredCampaigns.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center"><Search className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhuma campanha encontrada</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente mudar a busca ou o filtro.</p></td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 dark:border-slate-800"><span>Mostrando {filteredCampaigns.length} de {campaigns.length} campanhas salvas</span><span>Banco de dados</span></footer>
          </section>
        </main>
      </div>

      {(selectedCampaign || isCreateOpen) && (
        <EntityDialog
          titleId="campaign-dialog-title"
          title={isCreateOpen ? "Nova campanha" : selectedCampaign?.nome ?? "Campanha"}
          description={isCreateOpen ? "Crie um rascunho para configurar o próximo envio." : "Edite os dados e a mensagem da campanha."}
          onClose={() => { setSelectedCampaign(null); setIsCreateOpen(false); clearSelectedAttachments(); setUploadedAttachments([]); setFormError(""); }}
        >
          {isCreateOpen ? (
            <Stepper
              initialStep={1}
              onStepChange={() => setFormError("")}
              onFinalStepCompleted={createCampaign}
              validateStep={(step) => {
                  if (step === 1 && (!form.nome.trim() || (!durationSettings.indefinite && (!Number.isInteger(Number(durationSettings.amount)) || Number(durationSettings.amount) < 1)))) {
                    setFormError(!form.nome.trim() ? "Informe o nome da campanha." : "Informe uma duração válida, em quantidade inteira maior que zero.");
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
                setFormError("");
                return true;
              }}
              backButtonText="Voltar"
              nextButtonText="Continuar"
              completeButtonText="Salvar rascunho"
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
              <Step title="Identificação" description="Nome e duração ativa">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Identifique sua campanha</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Escolha um nome e por quanto tempo ela ficará ativa.</p></div>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome da campanha <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  <CampaignDurationFields settings={durationSettings} onChange={setDurationSettings} />
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
              <Step title="Público" description="Quem receberá">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Defina o público</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Selecione um ou mais segmentos existentes para receber a campanha.</p></div>
                  <FormMultiSelect
                    label="Público-alvo"
                    selected={selectedAudienceSegments}
                    options={segmentOptions}
                    onChange={(segments) => { setSelectedAudienceSegments(segments); setFormError(""); }}
                    placeholder="Selecione os segmentos"
                    required
                  />
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
              <Step title="Mensagem" description="Revise e salve">
                <div className="space-y-3">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Escreva a mensagem</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A campanha será criada como rascunho.</p></div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Variáveis de personalização</p>
                    <div className="flex flex-wrap gap-1.5">
                      {messageVariables.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => insertMessageVariable(item.value)}
                          className="rounded-lg border border-[#002187]/20 bg-[#002187]/5 px-2.5 py-1.5 text-[10px] font-semibold text-[#002187] transition-colors hover:bg-[#C4D600]/30 dark:border-[#C4D600]/30 dark:bg-[#C4D600]/10 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/20 cursor-pointer hover:cursor-pointer"
                          title={`Inserir ${item.value}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400">Clique em uma variável para inseri-la no ponto selecionado da mensagem.</p>
                  </div>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span>Mensagem <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span>
                    <textarea ref={messageInputRef} rows={4} value={form.mensagem} onChange={(event) => { setForm({ ...form, mensagem: event.target.value }); setFormError(""); }} className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
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
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Arquivos anexados</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">Imagens, vídeos ou PDFs</p>
                      </div>
                      <button type="button" onClick={() => attachmentInputRef.current?.click()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer hover:cursor-pointer">
                        <Paperclip className="h-3.5 w-3.5" />Adicionar arquivo
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
                              }} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer hover:cursor-pointer">
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
            </Stepper>
          ) : selectedCampaign && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-[10px] text-slate-500 dark:text-slate-400">Envios aceitos</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{selectedCampaign.disparos.toLocaleString("pt-BR")}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-[10px] text-slate-500 dark:text-slate-400">Respostas</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Indisponível</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-[10px] text-slate-500 dark:text-slate-400">Status</p><p className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[selectedCampaign.status]}`}>{selectedCampaign.status}</p></div>
                </div>
                <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <CampaignDurationFields settings={durationSettings} onChange={setDurationSettings} />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Duração configurada: <span className="font-semibold text-slate-700 dark:text-slate-200">{durationSummary(selectedCampaign.activeDuration)}</span>
                  </p>
                  {selectedCampaign.activeUntil && selectedCampaign.status === "Ativa" && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ativa até {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(selectedCampaign.activeUntil))}
                    </p>
                  )}
                </div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome da campanha <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <FormMultiSelect
                  label="Público-alvo"
                  selected={selectedAudienceSegments}
                  options={segmentOptions}
                  onChange={(segments) => { setSelectedAudienceSegments(segments); setFormError(""); }}
                  placeholder="Selecione os segmentos"
                  required
                />
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Mensagem <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><textarea rows={5} value={form.mensagem} onChange={(event) => { setForm({ ...form, mensagem: event.target.value }); setFormError(""); }} className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                {selectedCampaign.anexos && selectedCampaign.anexos.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Arquivos da campanha</p>
                    {selectedCampaign.anexos.map((file, index) => (
                      <p key={`${file.name}-${index}`} className="truncate text-xs text-slate-500 dark:text-slate-400" title={file.name}>{file.name} · {formatFileSize(file.size)}</p>
                    ))}
                  </div>
                )}
                {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
              </div>
              <footer className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><Clock3 className="h-3.5 w-3.5" />{selectedCampaign.dataAtualizacao}</span>
                <div className="flex items-center gap-2">
                  {selectedCampaign.status !== "Enviando" && selectedCampaign.status !== "Enviada" && selectedCampaign.status !== "Envio parcial" && (
                    <button type="button" onClick={() => toggleCampaign(selectedCampaign.id)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">{selectedCampaign.status === "Ativa" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{selectedCampaign.status === "Ativa" ? "Pausar no CRM" : "Ativar no CRM"}</button>
                  )}
                  <button
                    type="button"
                    disabled={isDispatching || selectedCampaign.status === "Enviando" || selectedCampaign.status === "Enviada" || selectedCampaign.status === "Envio parcial"}
                    onClick={() => {
                      setDispatchTarget({ mode: "single", ids: [selectedCampaign.id] });
                      setDispatchResult(null);
                      setDispatchError("");
                      setDispatchProgress(null);
                      setDispatchConfirmOpen(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#F7915E]/40 bg-[#F7915E]/10 px-3 text-xs font-semibold text-[#9a3d12] transition-colors hover:border-[#F7915E] hover:bg-[#F7915E]/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#F7915E]/30 dark:bg-[#F7915E]/15 dark:text-[#F7915E] dark:hover:bg-[#F7915E]/25 cursor-pointer hover:cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />Disparar agora
                  </button>
                  <button type="button" onClick={saveCampaign} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer">Salvar alterações</button>
                </div>
              </footer>
            </div>
          )}
        </EntityDialog>
      )}

      {/* Barra de ações em lote */}
      {selectedCampaignIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {selectedCampaignIds.size} campanha{selectedCampaignIds.size === 1 ? "" : "s"} selecionada{selectedCampaignIds.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setSelectedCampaignIds(new Set())}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />Limpar
          </button>
          <button
            type="button"
            disabled={isDispatching}
            onClick={() => {
              setDispatchTarget({ mode: "batch", ids: Array.from(selectedCampaignIds) });
              setDispatchResult(null);
              setDispatchError("");
              setDispatchProgress(null);
              setDispatchConfirmOpen(true);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#051647] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />Disparar selecionadas
          </button>
        </div>
      )}

      {/* Modal de confirmação de disparo */}
      {dispatchConfirmOpen && dispatchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar disparo de campanha"
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F7915E]/15 text-[#F7915E]">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {dispatchTarget.mode === "single" ? "Disparar campanha" : `Disparar ${dispatchTarget.ids.length} campanhas`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {dispatchTarget.mode === "single"
                    ? "A campanha será enviada imediatamente para o público configurado."
                    : "As campanhas selecionadas serão enviadas imediatamente para seus respectivos públicos."}
                </p>
              </div>
            </div>

            {dispatchError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{dispatchError}</p>}
            {isDispatching && dispatchProgress && (
              <p role="status" className="text-xs text-slate-500 dark:text-slate-400">
                Enviando mensagens: {dispatchProgress.completed} de {dispatchProgress.total} contatos processados.
              </p>
            )}
            {dispatchResult && (
              <div className={`space-y-2 rounded-lg border p-3 text-xs ${dispatchResult.failed === 0 ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200" : "border-[#F7915E]/30 bg-[#F7915E]/10 text-[#9a3d12] dark:text-[#F7915E]"}`}>
                <p className="font-semibold">{dispatchResult.sent} mensagem{dispatchResult.sent === 1 ? "" : "s"} enviada{dispatchResult.sent === 1 ? "" : "s"}; {dispatchResult.failed} falha{dispatchResult.failed === 1 ? "" : "s"}.</p>
                {dispatchResult.campaigns.map((campaign) => (
                  <p key={campaign.nome}>{campaign.nome}: {campaign.status} · {campaign.sent} enviadas · {campaign.failed} falhas</p>
                ))}
                {dispatchResult.errors.length > 0 && (
                  <ul className="list-inside list-disc border-t border-current/15 pt-2">
                    {dispatchResult.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
                    {dispatchResult.failed > dispatchResult.errors.length && <li>Há outras falhas; consulte os contatos sem telefone e o estado da conexão.</li>}
                  </ul>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDispatching}
                onClick={() => setDispatchConfirmOpen(false)}
                className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
              >
                {dispatchResult || dispatchError ? "Fechar" : "Cancelar"}
              </button>
              {!dispatchResult && !dispatchError && (
                <button
                  type="button"
                  disabled={isDispatching}
                  onClick={() => void dispatchCampaigns()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer"
                >
                  {isDispatching ? (
                    <>
                      <Clock3 className="h-3.5 w-3.5 animate-spin" />Disparando...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />Confirmar disparo
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
