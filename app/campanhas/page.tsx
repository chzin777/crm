"use client";

import { useEffect, useRef, useState } from "react";
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
import { FormMultiSelect } from "@/components/FormMultiSelect";
import { initialSegmentNames } from "@/lib/segments";

type CampaignStatus = "Ativa" | "Pronta para envio" | "Agendada" | "Pausada" | "Rascunho";
type CampaignFilter = "Todas" | CampaignStatus;

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
  anexos?: File[];
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

const initialCampaigns: Campaign[] = [
  {
    id: "camp-1",
    nome: "Pesquisa NPS · Pós-atendimento",
    publico: "Clientes após a finalização de uma compra",
    status: "Ativa",
    disparos: 28,
    rotuloDisparos: "hoje",
    taxaResposta: 78,
    dataAtualizacao: "Hoje, 09:42",
    mensagem: "Olá, {{nome}}! Como foi sua experiência com nosso atendimento? Sua opinião nos ajuda a melhorar.",
  },
  {
    id: "camp-2",
    nome: "Pesquisa NPS · Adaptação de lentes",
    publico: "Clientes que completaram 30 dias da compra",
    status: "Ativa",
    disparos: 54,
    rotuloDisparos: "no mês",
    taxaResposta: 64,
    dataAtualizacao: "Hoje, 08:15",
    mensagem: "Olá, {{nome}}! Já faz um mês que está usando suas lentes. Como está sendo a adaptação?",
  },
  {
    id: "camp-3",
    nome: "Reativação de clientes inativos",
    publico: "Clientes sem compras há mais de 180 dias",
    status: "Pronta para envio",
    disparos: 348,
    rotuloDisparos: "contatos no público",
    taxaResposta: 38,
    dataAtualizacao: "Ontem, 16:20",
    mensagem: "Oi, {{nome}}! Sentimos sua falta. Temos novidades para você voltar a cuidar da sua visão.",
  },
  {
    id: "camp-4",
    nome: "Recall · Exame de vista anual",
    publico: "Pacientes com exame completando 365 dias",
    status: "Agendada",
    disparos: 112,
    rotuloDisparos: "contatos no público",
    taxaResposta: 52,
    dataAtualizacao: "Agendada para 20/10/2026",
    mensagem: "Olá, {{nome}}! Está na hora de atualizar seu exame de vista. Quer agendar seu retorno?",
  },
];

const statusStyles: Record<CampaignStatus, string> = {
  Ativa: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  "Pronta para envio": "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]",
  Agendada: "bg-blue-100 text-[#002187] dark:bg-blue-950/50 dark:text-blue-300",
  Pausada: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Rascunho: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
};

const filters: CampaignFilter[] = ["Todas", "Ativa", "Pronta para envio", "Agendada", "Pausada", "Rascunho"];
const segmentOptions = Object.values(initialSegmentNames);

export default function CampanhasPage() {
  const [isDark, setIsDark] = useState(false);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<CampaignFilter>("Todas");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedAudienceSegments, setSelectedAudienceSegments] = useState<string[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);
  const [form, setForm] = useState({ nome: "", publico: "", mensagem: "" });
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("otb-crm-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  useEffect(() => {
    if (!selectedCampaign && !isCreateOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedCampaign(null);
        setIsCreateOpen(false);
        setSelectedAttachments([]);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCampaign, isCreateOpen]);

  const toggleTheme = () => {
    setIsDark((previous) => {
      const next = !previous;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("otb-crm-theme", next ? "dark" : "light");
      return next;
    });
  };

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = `${campaign.nome} ${campaign.publico} ${campaign.status}`.toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR"));
    return matchesSearch && (activeFilter === "Todas" || campaign.status === activeFilter);
  });

  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "Ativa");
  const totalSent = activeCampaigns.reduce((total, campaign) => total + campaign.disparos, 0);
  const responseRate = totalSent
    ? Math.round(activeCampaigns.reduce((total, campaign) => total + campaign.disparos * campaign.taxaResposta, 0) / totalSent)
    : 0;
  const scheduledCampaigns = campaigns.filter((campaign) => campaign.status === "Agendada" || campaign.status === "Pronta para envio").length;

  const metrics = [
    { label: "Campanhas", value: campaigns.length.toString(), detail: "na biblioteca", icon: MessageSquare, color: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Ativas", value: activeCampaigns.length.toString(), detail: "em automação", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    { label: "Mensagens enviadas", value: totalSent.toLocaleString("pt-BR"), detail: "nas campanhas ativas", icon: Send, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
    { label: "Respostas", value: `${responseRate}%`, detail: "taxa média ponderada", icon: ArrowUpRight, color: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]" },
  ];

  const createCampaign = () => {
    const nome = form.nome.trim();
    const publico = selectedAudienceSegments.join(", ").trim();
    const mensagem = form.mensagem.trim();
    if (!nome || !publico || !mensagem) {
      setFormError("Preencha todos os campos antes de salvar.");
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
      anexos: selectedAttachments,
    };
    setCampaigns((current) => [campaign, ...current]);
    setActiveFilter("Todas");
    setSearchTerm("");
    setForm({ nome: "", publico: "", mensagem: "" });
    setSelectedAudienceSegments([]);
    setSelectedAttachments([]);
    setFormError("");
    setIsCreateOpen(false);
  };

  const startEditingCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setSelectedAttachments([]);
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
    if (allowedFiles.length) setSelectedAttachments((current) => [...current, ...allowedFiles]);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  };

  const saveCampaign = () => {
    if (!selectedCampaign) return;
    const nome = form.nome.trim();
    const publico = form.publico.trim();
    const mensagem = form.mensagem.trim();
    if (!nome || !publico || !mensagem) {
      setFormError("Preencha todos os campos antes de salvar.");
      return;
    }
    const updatedCampaign = {
      ...selectedCampaign,
      nome,
      publico,
      mensagem,
      dataAtualizacao: "Atualizada agora",
    };
    setCampaigns((current) => current.map((campaign) => campaign.id === updatedCampaign.id ? updatedCampaign : campaign));
    setSelectedCampaign(updatedCampaign);
    setFormError("");
  };

  const toggleCampaign = (campaignId: string) => {
    setCampaigns((current) => current.map((campaign) => {
      if (campaign.id !== campaignId) return campaign;
      const nextStatus: CampaignStatus = campaign.status === "Ativa" ? "Pausada" : "Ativa";
      return { ...campaign, status: nextStatus, dataAtualizacao: nextStatus === "Ativa" ? "Ativada agora" : "Pausada agora" };
    }));
    setSelectedCampaign((current) => current?.id === campaignId
      ? { ...current, status: current.status === "Ativa" ? "Pausada" : "Ativa", dataAtualizacao: current.status === "Ativa" ? "Pausada agora" : "Ativada agora" }
      : current);
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
            <button type="button" onClick={() => { setForm({ nome: "", publico: "", mensagem: "" }); setSelectedAudienceSegments([]); setSelectedAttachments([]); setFormError(""); setIsCreateOpen(true); }} className="topbar-action-button bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              <Plus className="h-4 w-4" /> Nova campanha
            </button>
          </div>
        </header>

        <main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Campanhas</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Acompanhe envios, respostas e automações de WhatsApp.</p>
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
                    <th className="px-4 py-3 text-right">Disparos</th>
                    <th className="px-4 py-3 text-right">Resposta</th>
                    <th className="px-5 py-3">Atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCampaigns.map((campaign) => (
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
                      <td className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 dark:text-slate-200"><span className="block">{campaign.disparos}</span><span className="text-[10px] font-normal text-slate-400">{campaign.rotuloDisparos}</span></td>
                      <td className="px-4 py-3.5 text-right text-xs font-bold text-slate-900 dark:text-white">{campaign.taxaResposta}%</td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{campaign.dataAtualizacao}</td>
                    </tr>
                  ))}
                  {filteredCampaigns.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center"><Search className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhuma campanha encontrada</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente mudar a busca ou o filtro.</p></td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 dark:border-slate-800"><span>Mostrando {filteredCampaigns.length} de {campaigns.length} campanhas</span><span>Dados demonstrativos</span></footer>
          </section>
        </main>
      </div>

      {(selectedCampaign || isCreateOpen) && (
        <EntityDialog
          titleId="campaign-dialog-title"
          title={isCreateOpen ? "Nova campanha" : selectedCampaign?.nome ?? "Campanha"}
          description={isCreateOpen ? "Crie um rascunho para configurar o próximo envio." : "Edite os dados e a mensagem da campanha."}
          onClose={() => { setSelectedCampaign(null); setIsCreateOpen(false); setSelectedAttachments([]); setFormError(""); }}
        >
          {isCreateOpen ? (
            <Stepper
              initialStep={1}
              onStepChange={() => setFormError("")}
              onFinalStepCompleted={createCampaign}
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
              <Step title="Identificação" description="Nome da campanha">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Identifique sua campanha</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Escolha um nome fácil de reconhecer.</p></div>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome da campanha *</span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
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
                    <span>Mensagem *</span>
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
                              <button type="button" aria-label={`Remover arquivo ${file.name}`} onClick={() => setSelectedAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer hover:cursor-pointer">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
            </Stepper>
          ) : selectedCampaign && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-[10px] text-slate-500 dark:text-slate-400">Disparos</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{selectedCampaign.disparos}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-[10px] text-slate-500 dark:text-slate-400">Resposta</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{selectedCampaign.taxaResposta}%</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-[10px] text-slate-500 dark:text-slate-400">Status</p><p className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[selectedCampaign.status]}`}>{selectedCampaign.status}</p></div>
                </div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome da campanha</span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Público-alvo</span><input value={form.publico} onChange={(event) => { setForm({ ...form, publico: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Mensagem</span><textarea rows={5} value={form.mensagem} onChange={(event) => { setForm({ ...form, mensagem: event.target.value }); setFormError(""); }} className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
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
                  <button type="button" onClick={() => toggleCampaign(selectedCampaign.id)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">{selectedCampaign.status === "Ativa" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{selectedCampaign.status === "Ativa" ? "Pausar" : "Ativar"}</button>
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
