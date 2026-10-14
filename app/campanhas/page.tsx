"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Film,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Pause,
  Play,
  Plus,
  Search,
  Send,
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

type CampaignStatus = "Ativa" | "Pronta para envio" | "Agendada" | "Pausada" | "Rascunho";
type CampaignFilter = "Todas" | CampaignStatus;
type CampaignDurationUnit = "horas" | "dias" | "semanas" | "meses";

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
  status: CampaignStatus;
  disparos: number;
  rotuloDisparos: string;
  taxaResposta: number;
  dataAtualizacao: string;
  mensagem: string;
  anexos?: { name: string; size: number; type: string }[];
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
};

const filters: CampaignFilter[] = ["Todas", "Ativa", "Pronta para envio", "Agendada", "Pausada", "Rascunho"];
export default function CampanhasPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const { data: campaigns, setData: setCampaigns, isLoading: campaignsLoading, error: campaignsError } = useCrmData<Campaign[]>("campaigns", []);
  const { data: segments } = useCrmData<{ id: string; nome: string }[]>("segments", []);
  const segmentOptions = segments.map((segment) => segment.nome);
  const segmentOptionSet = new Set(segmentOptions);
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

  const clearSelectedAttachments = useCallback(() => {
    attachmentPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    attachmentPreviewUrlsRef.current.clear();
    setAttachmentPreviewUrls(new Map());
    setSelectedAttachments([]);
  }, []);

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

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = `${campaign.nome} ${campaign.publico} ${campaign.status}`.toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR"));
    return matchesSearch && (activeFilter === "Todas" || campaign.status === activeFilter);
  });

  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "Ativa");
  const scheduledCampaigns = campaigns.filter((campaign) => campaign.status === "Agendada" || campaign.status === "Pronta para envio").length;

  const metrics = [
    { label: "Campanhas", value: campaigns.length.toString(), detail: "na biblioteca", icon: MessageSquare, color: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Ativas no CRM", value: activeCampaigns.length.toString(), detail: "status cadastrado", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    { label: "Envios", value: "—", detail: "integração não configurada", icon: Send, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
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
      status: "Rascunho",
      disparos: 0,
      rotuloDisparos: "contatos no público",
      taxaResposta: 0,
      dataAtualizacao: "Criada agora",
      mensagem,
      anexos: selectedAttachments.map(({ name, size, type }) => ({ name, size, type })),
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

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const allowedFiles = selectedFiles.filter((file) =>
      file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf");
    if (allowedFiles.length !== selectedFiles.length) {
      setFormError("Adicione apenas imagens, vídeos ou arquivos PDF.");
    } else {
      setFormError("");
    }
    if (allowedFiles.length) {
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
    }
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
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
  };

  const toggleCampaign = (campaignId: string) => {
    const updateStatus = (campaign: Campaign): Campaign => {
      if (campaign.id !== campaignId) return campaign;
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
            <button type="button" onClick={openCreateCampaign} className="topbar-action-button bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              <Plus className="h-4 w-4" /> Nova campanha
            </button>
          </div>
        </header>

        <main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">
          {campaignsError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{campaignsError}</p>}
          <p className="rounded-lg border border-[#C4D600]/40 bg-[#C4D600]/10 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
            Campanhas, públicos e status são salvos no banco. O envio e o rastreamento de respostas ainda dependem da integração com um provedor de mensagens.
          </p>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Campanhas</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Crie e organize campanhas segmentadas para relacionamento e conversão.</p>
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
                    <th className="px-5 py-3">Campanha</th>
                    <th className="px-4 py-3">Público</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Envios</th>
                    <th className="px-4 py-3 text-right">Respostas</th>
                    <th className="px-5 py-3">Atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {campaignsLoading && (
                    <tr><td colSpan={6} className="px-5 py-8">
                      <LoadingSpinner label="Carregando campanhas..." className="w-full justify-center" />
                    </td></tr>
                  )}
                  {!campaignsLoading && filteredCampaigns.map((campaign) => (
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
                      className="group cursor-pointer transition-colors hover:bg-slate-50/80 focus-visible:outline-2 focus-visible:outline-[#002187] dark:hover:bg-slate-800/30 dark:focus-visible:outline-[#C4D600]"
                    >
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
                    </tr>
                  ))}
                  {!campaignsLoading && filteredCampaigns.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center"><Search className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhuma campanha encontrada</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente mudar a busca ou o filtro.</p></td></tr>}
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
          onClose={() => { setSelectedCampaign(null); setIsCreateOpen(false); clearSelectedAttachments(); setFormError(""); }}
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
                    values={selectedAudienceSegments}
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
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-[10px] text-slate-500 dark:text-slate-400">Envios</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Indisponível</p></div>
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
                  values={selectedAudienceSegments}
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
                  <button type="button" onClick={() => toggleCampaign(selectedCampaign.id)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">{selectedCampaign.status === "Ativa" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{selectedCampaign.status === "Ativa" ? "Pausar no CRM" : "Ativar no CRM"}</button>
                  <button type="button" onClick={saveCampaign} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer">Salvar alterações</button>
                </div>
              </footer>
            </div>
          )}
        </EntityDialog>
      )}
    </div>
  );
}
