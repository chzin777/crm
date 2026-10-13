"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Plus,
  Search,
  Sparkles,
  Tags,
  Target,
  Users,
  X,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import Stepper, { Step } from "@/components/Stepper";
import { initialContacts, type ContactCategory } from "@/lib/contacts";
import { initialSegmentNames } from "@/lib/segments";

type SegmentStatus = "Ativo" | "Rascunho";
type SegmentFilter = "Todos" | SegmentStatus;
type AudienceMode = "criterios" | "contatos";
type ContactFilter = "Todos" | "Clientes" | "Leads" | "NPS" | "Inativos";

interface Segment {
  id: string;
  nome: string;
  descricao: string;
  status: SegmentStatus;
  membros: number;
  atualizado: string;
  criterios: string[];
  modoPublico: AudienceMode;
  contatosSelecionados: string[];
  objetivo: string;
  campanhas: number;
}

const initialSegments: Segment[] = [
  {
    id: "seg-1",
    nome: initialSegmentNames.postAtendimentoNps,
    descricao: "Clientes que concluíram uma compra recentemente.",
    status: "Ativo",
    membros: 1284,
    atualizado: "Hoje, 09:42",
    criterios: ["Compra concluída", "Últimos 30 minutos", "Telefone válido"],
    modoPublico: "criterios",
    contatosSelecionados: [],
    objetivo: "Enviar pesquisa de satisfação após atendimento.",
    campanhas: 1,
  },
  {
    id: "seg-2",
    nome: initialSegmentNames.adaptacaoLentesNps,
    descricao: "Clientes que estão usando lentes novas há um mês.",
    status: "Ativo",
    membros: 638,
    atualizado: "Hoje, 08:15",
    criterios: ["Compra de lentes", "Entre 28 e 35 dias da compra", "Não respondeu à pesquisa"],
    modoPublico: "criterios",
    contatosSelecionados: [],
    objetivo: "Acompanhar adaptação e identificar necessidade de ajuste.",
    campanhas: 1,
  },
  {
    id: "seg-3",
    nome: initialSegmentNames.interesseArmacoes,
    descricao: "Leads que pediram orçamento de armação nos últimos dias.",
    status: "Ativo",
    membros: 412,
    atualizado: "Ontem, 16:20",
    criterios: ["Lead com orçamento aberto", "Interesse em armação", "Sem compra nos últimos 7 dias"],
    modoPublico: "criterios",
    contatosSelecionados: [],
    objetivo: "Retomar o atendimento e avançar o orçamento.",
    campanhas: 2,
  },
  {
    id: "seg-4",
    nome: initialSegmentNames.reativacaoClientes,
    descricao: "Clientes sem compras há mais de seis meses.",
    status: "Ativo",
    membros: 348,
    atualizado: "Ontem, 14:05",
    criterios: ["Compra anterior", "Sem compra há mais de 180 dias", "Telefone válido"],
    modoPublico: "criterios",
    contatosSelecionados: [],
    objetivo: "Criar uma oportunidade de retorno à loja.",
    campanhas: 1,
  },
  {
    id: "seg-5",
    nome: initialSegmentNames.recallExameAnual,
    descricao: "Pacientes próximos de completar um ano do último exame.",
    status: "Ativo",
    membros: 112,
    atualizado: "13/10/2026",
    criterios: ["Exame registrado", "Entre 350 e 365 dias do exame"],
    modoPublico: "criterios",
    contatosSelecionados: [],
    objetivo: "Lembrar o cliente de atualizar o exame de vista.",
    campanhas: 1,
  },
  {
    id: "seg-6",
    nome: initialSegmentNames.compradoresFrequentes,
    descricao: "Clientes com histórico recorrente de compras.",
    status: "Rascunho",
    membros: 0,
    atualizado: "Criado em 12/10/2026",
    criterios: ["Três ou mais compras", "Últimos 12 meses"],
    modoPublico: "criterios",
    contatosSelecionados: [],
    objetivo: "Preparar ofertas de fidelização para clientes frequentes.",
    campanhas: 0,
  },
];

const statusStyles: Record<SegmentStatus, string> = {
  Ativo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  Rascunho: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const filters: SegmentFilter[] = ["Todos", "Ativo", "Rascunho"];
const contactFilters: ContactFilter[] = ["Todos", "Clientes", "Leads", "NPS", "Inativos"];
const contactCategoryLabels: Record<ContactCategory, string> = {
  cliente: "Cliente",
  lead: "Lead",
  nps: "NPS",
  inativo: "Inativo",
};
const presetCriteria = [
  "Comprou nos últimos 30 dias",
  "Comprou nos últimos 90 dias",
  "Comprou nos últimos 180 dias",
  "Sem compra há mais de 180 dias",
  "Tem compra de lentes multifocais",
  "Exame vence nos próximos 30 dias",
  "Ainda não respondeu ao NPS",
  "Recebeu NPS abaixo de 7",
  "Tem orçamento em aberto",
  "Telefone válido",
];

export default function SegmentosPage() {
  const [isDark, setIsDark] = useState(false);
  const [segments, setSegments] = useState(initialSegments);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<SegmentFilter>("Todos");
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditingSegment, setIsEditingSegment] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "", criterios: "" });
  const [formError, setFormError] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("criterios");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("Todos");
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [isCriteriaMenuOpen, setIsCriteriaMenuOpen] = useState(false);
  const criteriaMenuRef = useRef<HTMLDivElement>(null);
  const criteriaTriggerRef = useRef<HTMLButtonElement>(null);
  const criteriaMenuPortalRef = useRef<HTMLDivElement>(null);
  const [criteriaMenuPosition, setCriteriaMenuPosition] = useState<CSSProperties>({});

  useEffect(() => {
    const savedTheme = localStorage.getItem("otb-crm-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  useEffect(() => {
    if (!selectedSegment && !isCreateOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isContactPickerOpen) {
          event.stopPropagation();
          setIsContactPickerOpen(false);
          return;
        }
        setSelectedSegment(null);
        setIsCreateOpen(false);
        setIsEditingSegment(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedSegment, isCreateOpen, isContactPickerOpen]);

  useEffect(() => {
    if (!isCriteriaMenuOpen) return;
    const updatePosition = () => {
      const trigger = criteriaTriggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const availableBelow = window.innerHeight - bounds.bottom - 12;
      const availableAbove = bounds.top - 12;
      const desiredHeight = Math.min(240, window.innerHeight - 24);
      const openAbove = availableBelow < desiredHeight && availableAbove > availableBelow;
      const availableSpace = openAbove ? availableAbove : availableBelow;
      const maxHeight = Math.max(96, Math.min(desiredHeight, availableSpace));
      setCriteriaMenuPosition({
        position: "fixed",
        top: openAbove ? bounds.top - maxHeight - 8 : bounds.bottom + 8,
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - bounds.width - 12)),
        width: bounds.width,
        maxHeight,
        zIndex: 200,
      });
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!criteriaMenuRef.current?.contains(target) && !criteriaMenuPortalRef.current?.contains(target)) {
        setIsCriteriaMenuOpen(false);
      }
    };
    updatePosition();
    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isCriteriaMenuOpen]);

  const toggleTheme = () => {
    setIsDark((previous) => {
      const next = !previous;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("otb-crm-theme", next ? "dark" : "light");
      return next;
    });
  };

  const filteredSegments = segments.filter((segment) => {
    const selectedNames = initialContacts.filter((contact) => segment.contatosSelecionados.includes(contact.id)).map((contact) => contact.nome).join(" ");
    const matchesSearch = `${segment.nome} ${segment.descricao} ${segment.objetivo} ${segment.criterios.join(" ")} ${selectedNames}`.toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR"));
    return matchesSearch && (activeFilter === "Todos" || segment.status === activeFilter);
  });

  const activeCount = segments.filter((segment) => segment.status === "Ativo").length;
  const totalMembers = segments.reduce((total, segment) => total + segment.membros, 0);
  const connectedCampaigns = segments.reduce((total, segment) => total + segment.campanhas, 0);
  const availableContacts = initialContacts.filter((contact) => {
    const matchesSearch = `${contact.nome} ${contact.telefone} ${contact.email}`.toLocaleLowerCase("pt-BR").includes(contactSearch.trim().toLocaleLowerCase("pt-BR"));
    const matchesFilter = contactFilter === "Todos"
      || (contactFilter === "Clientes" && contact.compras > 0)
      || (contactFilter === "Leads" && contact.categoria === "lead")
      || (contactFilter === "NPS" && contact.categoria === "nps")
      || (contactFilter === "Inativos" && contact.categoria === "inativo");
    return matchesSearch && matchesFilter;
  });
  const allVisibleContactsSelected = availableContacts.length > 0
    && availableContacts.every((contact) => selectedContactIds.includes(contact.id));
  const selectedContactRecords = initialContacts.filter((contact) => selectedContactIds.includes(contact.id));
  const selectedCriteria = form.criterios.split("\n").map((criterion) => criterion.trim()).filter(Boolean);

  const metrics = [
    { label: "Segmentos", value: segments.length.toString(), detail: "na biblioteca", icon: Tags, color: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Ativos", value: activeCount.toString(), detail: "atualizados automaticamente", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    { label: "Pessoas alcançáveis", value: totalMembers.toLocaleString("pt-BR"), detail: "somatório dos segmentos", icon: Users, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
    { label: "Campanhas vinculadas", value: connectedCampaigns.toString(), detail: "usando esses públicos", icon: Target, color: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]" },
  ];

  const validateSegmentStep = (step: number) => {
    if (step === 1 && (!form.nome.trim() || !form.descricao.trim())) {
      setFormError("Preencha o nome e a descrição para continuar.");
      return false;
    }
    if (step === 2) {
      if (audienceMode === "criterios" && !form.criterios.split("\n").some((criterion) => criterion.trim())) {
        setFormError("Adicione pelo menos um critério para continuar.");
        return false;
      }
      if (audienceMode === "contatos" && selectedContactIds.length === 0) {
        setFormError("Selecione pelo menos um contato para continuar.");
        return false;
      }
    }
    setFormError("");
    return true;
  };

  const createSegment = () => {
    const selectedContacts = initialContacts.filter((contact) => selectedContactIds.includes(contact.id));
    const segment: Segment = {
      id: `seg-${Date.now()}`,
      nome: form.nome.trim(),
      descricao: form.descricao.trim(),
      status: "Rascunho",
      membros: audienceMode === "contatos" ? selectedContacts.length : 0,
      atualizado: "Criado agora",
      criterios: audienceMode === "criterios" ? form.criterios.split("\n").map((criterion) => criterion.trim()).filter(Boolean) : [],
      modoPublico: audienceMode,
      contatosSelecionados: audienceMode === "contatos" ? [...selectedContactIds] : [],
      objetivo: form.descricao.trim(),
      campanhas: 0,
    };
    setSegments((current) => [segment, ...current]);
    setActiveFilter("Todos");
    setSearchTerm("");
    setForm({ nome: "", descricao: "", criterios: "" });
    setFormError("");
    setAudienceMode("criterios");
    setSelectedContactIds([]);
    setContactSearch("");
    setContactFilter("Todos");
    setIsContactPickerOpen(false);
    setIsCreateOpen(false);
  };

  const startEditingSegment = (segment: Segment) => {
    setSelectedSegment(segment);
    setForm({
      nome: segment.nome,
      descricao: segment.descricao,
      criterios: segment.criterios.join("\n"),
    });
    setAudienceMode(segment.modoPublico);
    setSelectedContactIds([...segment.contatosSelecionados]);
    setFormError("");
    setIsCriteriaMenuOpen(false);
    setIsEditingSegment(true);
  };

  const saveSegmentChanges = () => {
    if (!selectedSegment) return;
    const criterios = form.criterios.split("\n").map((criterion) => criterion.trim()).filter(Boolean);
    if (!form.nome.trim() || !form.descricao.trim()) {
      setFormError("Preencha o nome e a descrição para salvar.");
      return;
    }
    if (audienceMode === "criterios" && criterios.length === 0) {
      setFormError("Adicione pelo menos um critério para salvar.");
      return;
    }
    if (audienceMode === "contatos" && selectedContactIds.length === 0) {
      setFormError("Selecione pelo menos um contato para salvar.");
      return;
    }

    const updatedSegment: Segment = {
      ...selectedSegment,
      nome: form.nome.trim(),
      descricao: form.descricao.trim(),
      membros: audienceMode === "contatos"
        ? selectedContactIds.length
        : selectedSegment.modoPublico === "criterios" ? selectedSegment.membros : 0,
      atualizado: "Atualizado agora",
      criterios: audienceMode === "criterios" ? criterios : [],
      modoPublico: audienceMode,
      contatosSelecionados: audienceMode === "contatos" ? [...selectedContactIds] : [],
    };
    setSegments((current) => current.map((segment) => segment.id === updatedSegment.id ? updatedSegment : segment));
    setSelectedSegment(updatedSegment);
    setIsEditingSegment(false);
    setFormError("");
    setIsCriteriaMenuOpen(false);
    setIsContactPickerOpen(false);
  };

  const closeOverlay = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setSelectedSegment(null);
      setIsCreateOpen(false);
      setIsEditingSegment(false);
      setIsContactPickerOpen(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] text-slate-800 transition-colors dark:bg-[#030d29] dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-4 mt-4 flex h-16 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm dark:border-slate-800 dark:bg-[#051647]">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Segmentos</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" aria-label="Alertas" title="Alertas" className="topbar-icon-button bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setIsCreateOpen(true)} className="topbar-action-button bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              <Plus className="h-4 w-4" /> Criar segmento
            </button>
          </div>
        </header>

        <main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Segmentos</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Organize públicos por comportamento, compra e relacionamento.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Sparkles className="h-3.5 w-3.5 text-[#F7915E]" />Públicos atualizados automaticamente</span>
          </div>

          <section aria-label="Resumo dos segmentos" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
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
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Biblioteca de segmentos</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filteredSegments.length} de {segments.length} segmentos</p>
                </div>
                <label className="relative block w-full lg:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} aria-label="Buscar segmentos" placeholder="Buscar segmento ou critério" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:focus:border-[#C4D600]" />
                </label>
              </div>
              <div role="tablist" aria-label="Filtrar segmentos" className="flex flex-wrap gap-1.5">
                {filters.map((filter) => {
                  const count = filter === "Todos" ? segments.length : segments.filter((segment) => segment.status === filter).length;
                  return (
                    <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} onClick={() => setActiveFilter(filter)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${activeFilter === filter ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"}`}>
                      {filter}<span className={`text-[10px] ${activeFilter === filter ? "opacity-75" : "text-slate-400"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800/40">
                  <tr>
                    <th className="px-5 py-3">Segmento</th>
                    <th className="px-4 py-3">Pessoas</th>
                    <th className="px-4 py-3">Critérios</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3">Atualizado</th>
                    <th className="px-4 py-3 text-right">Campanhas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSegments.map((segment) => (
                    <tr
                      key={segment.id}
                      tabIndex={0}
                      aria-label={`Abrir detalhes de ${segment.nome}`}
                      onClick={() => startEditingSegment(segment)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          startEditingSegment(segment);
                        }
                      }}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/80 focus-visible:outline-2 focus-visible:outline-[#002187] dark:hover:bg-slate-800/30 dark:focus-visible:outline-[#C4D600]"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><Tags className="h-4 w-4" /></span>
                          <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-900 group-hover:text-[#002187] dark:text-white dark:group-hover:text-[#C4D600]">{segment.nome}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{segment.descricao}</span></span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{segment.membros.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3.5"><span className="inline-flex max-w-56 items-center gap-1.5 truncate text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />{segment.modoPublico === "contatos" ? `${segment.contatosSelecionados.length} contatos selecionados` : segment.criterios[0] || "Sem critérios"}</span><span className="ml-1 text-[10px] text-slate-400">{segment.modoPublico === "criterios" && segment.criterios.length > 1 ? `+${segment.criterios.length - 1}` : ""}</span></td>
                      <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[segment.status]}`}>{segment.status}</span></td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{segment.atualizado}</td>
                      <td className="px-4 py-3.5 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">{segment.campanhas}</td>
                    </tr>
                  ))}
                  {filteredSegments.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center"><Search className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum segmento encontrado</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente mudar a busca ou o filtro.</p></td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 dark:border-slate-800"><span>Mostrando {filteredSegments.length} de {segments.length} segmentos</span><span>Dados demonstrativos</span></footer>
          </section>
        </main>
      </div>

      {(selectedSegment || isCreateOpen) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#051647]/55 p-4 backdrop-blur-sm" onMouseDown={closeOverlay}>
          <section role="dialog" aria-modal="true" aria-labelledby="segment-dialog-title" className={`w-full ${isCreateOpen || isEditingSegment ? "max-w-xl flex h-[min(640px,90vh)] max-h-[90vh] flex-col overflow-hidden" : "max-w-lg"} rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#07194f] sm:p-6`}>
            <div className={`flex items-start justify-between gap-4 ${isCreateOpen || isEditingSegment ? "mb-5 shrink-0" : "mb-5"}`}>
              <div><h2 id="segment-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">{isCreateOpen ? "Criar segmento" : selectedSegment?.nome}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{isCreateOpen ? "Defina um público para usar nas campanhas." : isEditingSegment ? "Atualize os dados e o público deste segmento." : "Critérios e campanhas vinculadas a este público."}</p></div>
              <button type="button" onClick={() => { setSelectedSegment(null); setIsCreateOpen(false); setIsEditingSegment(false); setIsContactPickerOpen(false); }} aria-label="Fechar" title="Fechar" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            {isCreateOpen ? (
              <>
                <Stepper
                  initialStep={1}
                  onStepChange={() => setFormError("")}
                  onFinalStepCompleted={createSegment}
                  backButtonText="Voltar"
                  nextButtonText="Continuar"
                  completeButtonText="Salvar segmento"
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
                  validateStep={validateSegmentStep}
                >
                  <Step title="Identificação" description="Nome e propósito">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Defina o segmento</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Dê um nome claro para reconhecer esse público.</p>
                      </div>
                      <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome do segmento <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><input required value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                      <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Descrição <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><textarea required rows={2} value={form.descricao} onChange={(event) => { setForm({ ...form, descricao: event.target.value }); setFormError(""); }} className="h-20 min-h-20 max-h-20 w-full resize-none overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                      {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                    </div>
                  </Step>
                  <Step title="Público" description="Regras ou contatos existentes">
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Como definir o público?</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Escolha regras automáticas ou selecione contatos da base.</p>
                      </div>
                      <div role="group" aria-label="Origem do público" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80">
                        <button type="button" aria-pressed={audienceMode === "criterios"} onClick={() => { setAudienceMode("criterios"); setFormError(""); setIsCriteriaMenuOpen(false); }} className={`h-8 rounded-md px-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${audienceMode === "criterios" ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>Usar critérios</button>
                        <button type="button" aria-pressed={audienceMode === "contatos"} onClick={() => { setAudienceMode("contatos"); setFormError(""); setIsCriteriaMenuOpen(false); }} className={`h-8 rounded-md px-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${audienceMode === "contatos" ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>Escolher contatos</button>
                      </div>
                      {audienceMode === "criterios" ? (
                        <div className="space-y-2.5">
                          <div ref={criteriaMenuRef} className="relative space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Critérios do público <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span>
                            <button
                              ref={criteriaTriggerRef}
                              type="button"
                              onClick={() => setIsCriteriaMenuOpen((open) => !open)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setIsCriteriaMenuOpen(false);
                                }
                              }}
                              aria-haspopup="menu"
                              aria-controls="criteria-options-menu"
                              aria-expanded={isCriteriaMenuOpen}
                              aria-label="Selecione um critério"
                              className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-medium text-slate-600 shadow-xs transition-colors hover:border-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#051647] cursor-pointer hover:cursor-pointer"
                            >
                              <span>Selecione um critério</span>
                              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isCriteriaMenuOpen ? "rotate-180" : ""}`} />
                            </button>
                            {isCriteriaMenuOpen && typeof document !== "undefined" && createPortal(
                              <div
                                ref={criteriaMenuPortalRef}
                                id="criteria-options-menu"
                                role="menu"
                                aria-label="Critérios disponíveis"
                                style={criteriaMenuPosition}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setIsCriteriaMenuOpen(false);
                                    criteriaTriggerRef.current?.focus();
                                  }
                                }}
                                className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#07194f]"
                              >
                                {presetCriteria.map((criterion) => {
                                  const isSelected = selectedCriteria.includes(criterion);
                                  return (
                                    <button
                                      key={criterion}
                                      type="button"
                                      role="menuitemcheckbox"
                                      aria-checked={isSelected}
                                      onClick={() => {
                                        if (!isSelected) {
                                          setForm((current) => {
                                            const currentCriteria = current.criterios.split("\n").map((item) => item.trim()).filter(Boolean);
                                            return { ...current, criterios: [...currentCriteria, criterion].join("\n") };
                                          });
                                        }
                                        setFormError("");
                                        setIsCriteriaMenuOpen(false);
                                      }}
                                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
                                    >
                                      <span>{criterion}</span>
                                      {isSelected && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
                                    </button>
                                  );
                                })}
                              </div>,
                              document.body
                            )}
                          </div>
                          {selectedCriteria.length > 0 ? (
                            <ul className="flex flex-wrap gap-1.5">
                              {selectedCriteria.map((criterion) => (
                                <li key={criterion}>
                                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#C4D600]/20 py-1 pl-2.5 pr-1.5 text-[10px] font-semibold text-[#051647] dark:text-[#C4D600]">
                                    <span className="truncate">{criterion}</span>
                                    <button type="button" onClick={() => { setForm({ ...form, criterios: selectedCriteria.filter((item) => item !== criterion).join("\n") }); setFormError(""); }} aria-label={`Remover critério ${criterion}`} title="Remover critério" className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-[#C4D600]/30 cursor-pointer hover:cursor-pointer"><X className="h-3 w-3" /></button>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : <p className="text-[11px] text-slate-400">Adicione um ou mais critérios para definir o público.</p>}
                        </div>
                      ) : (
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Contatos do público</p>
                              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {selectedContactIds.length
                                  ? `${selectedContactIds.length} ${selectedContactIds.length === 1 ? "contato selecionado" : "contatos selecionados"}`
                                  : "Nenhum contato selecionado"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setContactSearch("");
                                setContactFilter("Todos");
                                setIsContactPickerOpen(true);
                              }}
                              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
                            >
                              <Users className="h-3.5 w-3.5" />
                              {selectedContactIds.length ? "Gerenciar contatos" : "Selecionar contatos"}
                            </button>
                          </div>
                          {selectedContactRecords.length > 0 && (
                            <ul aria-label="Contatos selecionados" className="flex flex-wrap gap-1.5">
                              {selectedContactRecords.slice(0, 4).map((contact) => (
                                <li key={contact.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#C4D600]/25 text-[8px] font-bold text-[#051647] dark:text-[#C4D600]">{contact.iniciais}</span>
                                  <span className="max-w-40 truncate">{contact.nome}</span>
                                </li>
                              ))}
                              {selectedContactRecords.length > 4 && (
                                <li className="inline-flex items-center rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  +{selectedContactRecords.length - 4}
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      )}
                      {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                    </div>
                  </Step>
                  <Step title="Revisão" description="Confira antes de salvar">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Revise seu segmento</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ele será salvo como rascunho, sem campanhas vinculadas.</p>
                      </div>
                      <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/50">
                        <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Nome</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{form.nome || "Não informado"}</dd></div>
                        <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Descrição</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{form.descricao || "Não informada"}</dd></div>
                        <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Público</dt><dd className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{audienceMode === "criterios" ? "Definido por critérios" : `${selectedContactIds.length} contatos selecionados`}</dd></div>
                        <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">{audienceMode === "criterios" ? "Critérios" : "Contatos"}</dt><dd className="mt-1 space-y-1 text-xs text-slate-700 dark:text-slate-200">{audienceMode === "criterios" ? form.criterios.split("\n").filter((criterion) => criterion.trim()).map((criterion) => <p key={criterion}>· {criterion}</p>) : selectedContactRecords.map((contact) => <p key={contact.id}>· {contact.nome}</p>)}</dd></div>
                      </dl>
                    </div>
                  </Step>
                </Stepper>
              </>
            ) : selectedSegment && isEditingSegment ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span>Nome do segmento</span>
                    <input
                      value={form.nome}
                      onChange={(event) => { setForm((current) => ({ ...current, nome: event.target.value })); setFormError(""); }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                    />
                  </label>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span>Descrição</span>
                    <textarea
                      rows={2}
                      value={form.descricao}
                      onChange={(event) => { setForm((current) => ({ ...current, descricao: event.target.value })); setFormError(""); }}
                      className="min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                    />
                  </label>
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">Público do segmento</h3>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Edite os critérios ou selecione contatos específicos.</p>
                    </div>
                    <div role="group" aria-label="Origem do público" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80">
                      <button type="button" aria-pressed={audienceMode === "criterios"} onClick={() => { setAudienceMode("criterios"); setFormError(""); setIsCriteriaMenuOpen(false); }} className={`h-8 rounded-md px-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${audienceMode === "criterios" ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>Usar critérios</button>
                      <button type="button" aria-pressed={audienceMode === "contatos"} onClick={() => { setAudienceMode("contatos"); setFormError(""); setIsCriteriaMenuOpen(false); }} className={`h-8 rounded-md px-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${audienceMode === "contatos" ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>Escolher contatos</button>
                    </div>
                    {audienceMode === "criterios" ? (
                      <div className="space-y-2.5">
                        <div ref={criteriaMenuRef} className="relative space-y-1.5">
                          <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Critérios do público</span>
                          <button
                            ref={criteriaTriggerRef}
                            type="button"
                            onClick={() => setIsCriteriaMenuOpen((open) => !open)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                event.stopPropagation();
                                setIsCriteriaMenuOpen(false);
                              }
                            }}
                            aria-haspopup="menu"
                            aria-controls="criteria-options-menu"
                            aria-expanded={isCriteriaMenuOpen}
                            aria-label="Adicionar critério"
                            className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-medium text-slate-600 shadow-xs transition-colors hover:border-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:hover:border-[#C4D600] dark:hover:bg-[#051647] cursor-pointer hover:cursor-pointer"
                          >
                            <span>Adicionar critério</span>
                            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isCriteriaMenuOpen ? "rotate-180" : ""}`} />
                          </button>
                          {isCriteriaMenuOpen && typeof document !== "undefined" && createPortal(
                            <div
                              ref={criteriaMenuPortalRef}
                              id="criteria-options-menu"
                              role="menu"
                              aria-label="Critérios disponíveis"
                              style={criteriaMenuPosition}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setIsCriteriaMenuOpen(false);
                                  criteriaTriggerRef.current?.focus();
                                }
                              }}
                              className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#07194f]"
                            >
                              {presetCriteria.map((criterion) => {
                                const isSelected = selectedCriteria.includes(criterion);
                                return (
                                  <button
                                    key={criterion}
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={isSelected}
                                    onClick={() => {
                                      setForm((current) => {
                                        const currentCriteria = current.criterios.split("\n").map((item) => item.trim()).filter(Boolean);
                                        return {
                                          ...current,
                                          criterios: (isSelected
                                            ? currentCriteria.filter((item) => item !== criterion)
                                            : [...currentCriteria, criterion]).join("\n"),
                                        };
                                      });
                                      setFormError("");
                                      setIsCriteriaMenuOpen(false);
                                    }}
                                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
                                  >
                                    <span>{criterion}</span>
                                    {isSelected && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
                                  </button>
                                );
                              })}
                            </div>,
                            document.body
                          )}
                        </div>
                        {selectedCriteria.length > 0 ? (
                          <ul className="flex flex-wrap gap-1.5">
                            {selectedCriteria.map((criterion) => (
                              <li key={criterion}>
                                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#C4D600]/20 py-1 pl-2.5 pr-1.5 text-[10px] font-semibold text-[#051647] dark:text-[#C4D600]">
                                  <span className="truncate">{criterion}</span>
                                  <button
                                    type="button"
                                    onClick={() => { setForm((current) => ({ ...current, criterios: selectedCriteria.filter((item) => item !== criterion).join("\n") })); setFormError(""); }}
                                    aria-label={`Remover critério ${criterion}`}
                                    title="Remover critério"
                                    className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-[#C4D600]/30 cursor-pointer hover:cursor-pointer"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-[11px] text-slate-400">Adicione pelo menos um critério para definir o público.</p>}
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {selectedContactIds.length
                              ? `${selectedContactIds.length} ${selectedContactIds.length === 1 ? "contato selecionado" : "contatos selecionados"}`
                              : "Nenhum contato selecionado"}
                          </p>
                          <button
                            type="button"
                            onClick={() => { setContactSearch(""); setContactFilter("Todos"); setIsContactPickerOpen(true); }}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
                          >
                            <Users className="h-3.5 w-3.5" />
                            {selectedContactIds.length ? "Gerenciar contatos" : "Selecionar contatos"}
                          </button>
                        </div>
                        {selectedContactRecords.length > 0 && (
                          <ul aria-label="Contatos selecionados" className="flex flex-wrap gap-1.5">
                            {selectedContactRecords.slice(0, 4).map((contact) => (
                              <li key={contact.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#C4D600]/25 text-[8px] font-bold text-[#051647] dark:text-[#C4D600]">{contact.iniciais}</span>
                                <span className="max-w-40 truncate">{contact.nome}</span>
                              </li>
                            ))}
                            {selectedContactRecords.length > 4 && <li className="inline-flex items-center rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">+{selectedContactRecords.length - 4}</li>}
                          </ul>
                        )}
                      </div>
                    )}
                    {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                  </div>
                </div>
                <footer className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button type="button" onClick={() => { setIsEditingSegment(false); setFormError(""); setIsCriteriaMenuOpen(false); }} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
                  <button type="button" onClick={saveSegmentChanges} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer">
                    <Check className="h-3.5 w-3.5" />Salvar alterações
                  </button>
                </footer>
              </div>
            ) : selectedSegment && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[selectedSegment.status]}`}>{selectedSegment.status}</span><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><Users className="h-3.5 w-3.5" />{selectedSegment.membros.toLocaleString("pt-BR")} pessoas</span></div>
                <div className="mt-5"><h3 className="text-[10px] font-bold uppercase text-slate-400">Descrição</h3><p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{selectedSegment.descricao}</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{selectedSegment.objetivo}</p></div>
                {selectedSegment.modoPublico === "criterios" ? (
                  <section className="mt-5"><h3 className="text-[10px] font-bold uppercase text-slate-400">Critérios do público</h3><ul className="mt-2 space-y-2">{selectedSegment.criterios.map((criterion) => <li key={criterion} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />{criterion}</li>)}</ul></section>
                ) : (
                  <section className="mt-5"><h3 className="text-[10px] font-bold uppercase text-slate-400">Contatos selecionados</h3><ul className="mt-2 space-y-2">{initialContacts.filter((contact) => selectedSegment.contatosSelecionados.includes(contact.id)).map((contact) => <li key={contact.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#C4D600]/20 text-[9px] font-bold text-[#051647] dark:text-[#C4D600]">{contact.iniciais}</span><span>{contact.nome}</span></li>)}</ul></section>
                )}
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs dark:border-slate-800"><span className="text-slate-500 dark:text-slate-400">Campanhas vinculadas</span><span className="font-semibold text-slate-900 dark:text-white">{selectedSegment.campanhas}</span></div>
              </div>
            )}
          </section>
        </div>
      )}
      {isContactPickerOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-[#051647]/65 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsContactPickerOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-picker-title"
            className="flex h-[min(720px,92vh)] max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#07194f]"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div>
                <h2 id="contact-picker-title" className="text-base font-bold text-slate-900 dark:text-white">Selecionar contatos</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pesquise e filtre a base para montar o público do segmento.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsContactPickerOpen(false)}
                aria-label="Fechar seleção de contatos"
                title="Fechar"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="shrink-0 space-y-4 border-b border-slate-100 p-5 dark:border-slate-800 sm:px-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Exibindo {availableContacts.length} de {initialContacts.length} contatos
                </p>
                <label className="relative block w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    autoFocus
                    value={contactSearch}
                    onChange={(event) => setContactSearch(event.target.value)}
                    aria-label="Buscar contatos"
                    placeholder="Buscar por nome, telefone ou e-mail"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:focus:border-[#C4D600]"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="tablist" aria-label="Filtrar contatos por categoria" className="flex flex-wrap gap-1.5">
                  {contactFilters.map((filter) => {
                    const count = filter === "Todos" ? initialContacts.length
                      : filter === "Clientes" ? initialContacts.filter((contact) => contact.compras > 0).length
                      : filter === "Leads" ? initialContacts.filter((contact) => contact.categoria === "lead").length
                      : filter === "NPS" ? initialContacts.filter((contact) => contact.categoria === "nps").length
                      : initialContacts.filter((contact) => contact.categoria === "inativo").length;
                    return (
                      <button
                        key={filter}
                        type="button"
                        role="tab"
                        aria-selected={contactFilter === filter}
                        onClick={() => setContactFilter(filter)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${contactFilter === filter ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"}`}
                      >
                        {filter}<span className={`text-[10px] ${contactFilter === filter ? "opacity-75" : "text-slate-400"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  aria-label={allVisibleContactsSelected ? "Desmarcar contatos exibidos" : "Selecionar todos os contatos exibidos"}
                  aria-pressed={allVisibleContactsSelected}
                  disabled={availableContacts.length === 0}
                  onClick={() => {
                    const visibleContactIds = availableContacts.map((contact) => contact.id);
                    setSelectedContactIds((current) => allVisibleContactsSelected
                      ? current.filter((id) => !visibleContactIds.includes(id))
                      : [...new Set([...current, ...visibleContactIds])]);
                    setFormError("");
                  }}
                  className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#051647] transition-colors hover:bg-[#C4D600]/20 disabled:opacity-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/15 cursor-pointer hover:cursor-pointer"
                >
                  {allVisibleContactsSelected ? "Desmarcar exibidos" : "Selecionar todos"}
                </button>
              </div>
            </div>

            <ul aria-label="Resultados de contatos" className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {availableContacts.length > 0 ? availableContacts.map((contact) => {
                const isSelected = selectedContactIds.includes(contact.id);
                return (
                  <li key={contact.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:px-6">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => {
                          setSelectedContactIds((current) => event.target.checked
                            ? [...current, contact.id]
                            : current.filter((id) => id !== contact.id));
                          setFormError("");
                        }}
                        className="h-4 w-4 shrink-0 accent-[#002187] dark:accent-[#C4D600]"
                      />
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#C4D600]/20 text-[10px] font-bold text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">
                        {contact.iniciais}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{contact.nome}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{contact.telefone} · {contact.email}</span>
                      </span>
                      <span className="hidden shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:inline-flex">
                        {contactCategoryLabels[contact.categoria]}
                      </span>
                      <span className="hidden max-w-40 shrink-0 truncate text-[11px] text-slate-500 dark:text-slate-400 lg:block">{contact.segmento}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
                    </label>
                  </li>
                );
              }) : (
                <li className="grid min-h-48 place-items-center px-5 text-center">
                  <div>
                    <Search className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum contato encontrado</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente mudar a busca ou o filtro.</p>
                  </div>
                </li>
              )}
            </ul>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {selectedContactIds.length} {selectedContactIds.length === 1 ? "contato selecionado" : "contatos selecionados"}
              </p>
              <button
                type="button"
                onClick={() => setIsContactPickerOpen(false)}
                className="inline-flex h-9 items-center rounded-lg bg-[#051647] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
              >
                Concluir seleção
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
