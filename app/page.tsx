"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import {
  Bell,
  Plus,
  Search,
  Filter,
  Flame,
  Clock,
  UserCheck,
  RefreshCw,
  MoreVertical,
  CheckCircle2,
  ArrowRight,
  CalendarDays,
  Mail,
  Phone,
  ShoppingBag,
  X,
} from "lucide-react";

type PipelineId = "novos" | "relacionamento";
type ColumnId = "novo-lead" | "em-atendimento" | "fechamento" | "pos-venda" | "recompra" | "reativacao";

interface PurchaseRecord {
  produto: string;
  data: string;
  valor: string;
}

interface PipelineCard {
  id: string;
  pipelineId: PipelineId;
  titulo: string;
  cliente: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  ultimasCompras: PurchaseRecord[];
  tag: string;
  tagColor: string;
  valor: string;
  progresso: number;
  progressoCor: string;
  diasNaEtapa: string;
  iniciais: string;
  coluna: ColumnId;
  mensagem: string;
}

interface PipelineStage {
  id: ColumnId;
  titulo: string;
  descricao: string;
  bgColuna: string;
}

interface PipelineConfig {
  titulo: string;
  descricao: string;
  stages: PipelineStage[];
}

const normalizeSearchText = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export default function Home() {
  const [isDark, setIsDark] = useState(false);
  const [periodo, setPeriodo] = useState<"mes" | "tri" | "ano">("tri");
  const [activePipelineId, setActivePipelineId] = useState<PipelineId>("novos");
  const [searchQuery, setSearchQuery] = useState("");
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);
  const [dragOverCard, setDragOverCard] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationAreaRef = useRef<HTMLDivElement>(null);
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const closeDialogButtonRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  const [cards, setCards] = useState<PipelineCard[]>([
    {
      id: "C-1",
      pipelineId: "novos",
      titulo: "Ray-Ban Aviator Polarizado",
      cliente: "Guilherme Sampaio",
      telefone: "(11) 99120-7734",
      email: "guilherme.sampaio@email.com",
      dataNascimento: "12/04/1988",
      ultimasCompras: [
        { produto: "Ray-Ban Aviator Polarizado", data: "11/10/2026", valor: "R$ 1.250" },
        { produto: "Lentes solares polarizadas", data: "05/12/2025", valor: "R$ 680" },
      ],
      tag: "Quente",
      tagColor: "bg-[#F7915E]/15 text-[#b94a15] dark:text-[#F7915E]",
      valor: "R$ 1.250",
      progresso: 85,
      progressoCor: "bg-[#C4D600]",
      diasNaEtapa: "2h na etapa",
      iniciais: "GS",
      coluna: "novo-lead",
      mensagem: "Olá Guilherme! Vi que consultou o Ray-Ban Aviator, separamos para você ver na loja...",
    },
    {
      id: "C-2",
      pipelineId: "novos",
      titulo: "Exame + Armação Vogue",
      cliente: "Amanda Meirelles",
      telefone: "(11) 98319-2200",
      email: "amanda.meirelles@email.com",
      dataNascimento: "21/09/1993",
      ultimasCompras: [
        { produto: "Exame de vista + armação Vogue", data: "12/10/2026", valor: "R$ 890" },
        { produto: "Lentes antirreflexo", data: "14/03/2026", valor: "R$ 420" },
      ],
      tag: "Novo",
      tagColor: "bg-blue-100 text-[#002187] dark:bg-blue-900/50 dark:text-blue-300",
      valor: "R$ 890",
      progresso: 70,
      progressoCor: "bg-[#002187] dark:bg-[#C4D600]",
      diasNaEtapa: "1d na etapa",
      iniciais: "AM",
      coluna: "em-atendimento",
      mensagem: "Amanda, tudo bem? Podemos confirmar seu agendamento de exame de vista para amanhã?",
    },
    {
      id: "C-3",
      pipelineId: "relacionamento",
      titulo: "Pesquisa Pós-Atendimento",
      cliente: "Mariana Albuquerque",
      telefone: "(11) 98721-4432",
      email: "mariana.albuquerque@email.com",
      dataNascimento: "08/06/1985",
      ultimasCompras: [
        { produto: "Armação de acetato", data: "13/10/2026", valor: "R$ 760" },
        { produto: "Óculos de sol", data: "20/02/2026", valor: "R$ 540" },
      ],
      tag: "NPS 30min",
      tagColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
      valor: "Nota 10",
      progresso: 95,
      progressoCor: "bg-emerald-500",
      diasNaEtapa: "32min atrás",
      iniciais: "MA",
      coluna: "pos-venda",
      mensagem: "Mariana, muito obrigado pela visita! De 0 a 10, como avalia nosso atendimento hoje?",
    },
    {
      id: "C-4",
      pipelineId: "relacionamento",
      titulo: "Adaptação Multifocal Varilux",
      cliente: "Beatriz Nogueira Dias",
      telefone: "(11) 99451-2210",
      email: "beatriz.nogueira@email.com",
      dataNascimento: "17/11/1974",
      ultimasCompras: [
        { produto: "Lentes multifocais Varilux", data: "13/09/2026", valor: "R$ 2.450" },
        { produto: "Óculos para leitura", data: "09/08/2025", valor: "R$ 680" },
      ],
      tag: "NPS 30 Dias",
      tagColor: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300",
      valor: "1 Mês de uso",
      progresso: 60,
      progressoCor: "bg-purple-500",
      diasNaEtapa: "30d na etapa",
      iniciais: "BN",
      coluna: "pos-venda",
      mensagem: "Beatriz, faz 1 mês dos seus novos óculos! Como está a adaptação da sua visão de perto?",
    },
    {
      id: "C-5",
      pipelineId: "relacionamento",
      titulo: "Reposição Lentes Acuvue",
      cliente: "Lucas Ferraz Fontes",
      telefone: "(11) 98844-3321",
      email: "lucas.ferraz@email.com",
      dataNascimento: "03/02/1991",
      ultimasCompras: [
        { produto: "Lentes de contato Acuvue", data: "28/09/2026", valor: "R$ 540" },
        { produto: "Solução para lentes", data: "30/06/2026", valor: "R$ 95" },
      ],
      tag: "Recorrente",
      tagColor: "bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]",
      valor: "R$ 540",
      progresso: 90,
      progressoCor: "bg-[#C4D600]",
      diasNaEtapa: "15d na etapa",
      iniciais: "LF",
      coluna: "recompra",
      mensagem: "Lucas, seu kit de lentes está próximo de acabar. Quer garantir a reposição com frete grátis?",
    },
    {
      id: "C-6",
      pipelineId: "relacionamento",
      titulo: "Oakley Grau Esportivo",
      cliente: "Carlos Eduardo Silveira",
      telefone: "(11) 97134-8890",
      email: "carlos.silveira@email.com",
      dataNascimento: "25/07/1982",
      ultimasCompras: [
        { produto: "Oakley grau esportivo", data: "08/10/2026", valor: "R$ 1.950" },
        { produto: "Óculos de sol Oakley", data: "11/01/2026", valor: "R$ 1.180" },
      ],
      tag: "VIP",
      tagColor: "bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]",
      valor: "R$ 1.950",
      progresso: 80,
      progressoCor: "bg-[#051647] dark:bg-[#C4D600]",
      diasNaEtapa: "5d na etapa",
      iniciais: "CS",
      coluna: "recompra",
      mensagem: "Carlos, chegaram novos modelos da linha esportiva que você curte. Passe para conferir!",
    },
    {
      id: "C-7",
      pipelineId: "relacionamento",
      titulo: "Exame Anual Vencido",
      cliente: "Roberto Mendes Filho",
      telefone: "(11) 98112-9933",
      email: "roberto.mendes@email.com",
      dataNascimento: "14/03/1968",
      ultimasCompras: [
        { produto: "Armação e lentes graduadas", data: "02/02/2026", valor: "R$ 1.940" },
        { produto: "Óculos de sol", data: "19/12/2024", valor: "R$ 620" },
      ],
      tag: "Recall",
      tagColor: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
      valor: "8m sem compra",
      progresso: 40,
      progressoCor: "bg-amber-500",
      diasNaEtapa: "22d na etapa",
      iniciais: "RM",
      coluna: "reativacao",
      mensagem: "Roberto, sua saúde visual é prioridade. Já faz 1 ano do seu exame de vista. Vamos agendar?",
    },
    {
      id: "C-8",
      pipelineId: "relacionamento",
      titulo: "Retorno Cliente Inativo",
      cliente: "Juliana Peixoto Ramos",
      telefone: "(11) 97650-1122",
      email: "juliana.peixoto@email.com",
      dataNascimento: "30/01/1989",
      ultimasCompras: [
        { produto: "Armação de acetato", data: "15/10/2025", valor: "R$ 1.390" },
        { produto: "Lentes antirreflexo", data: "22/05/2024", valor: "R$ 490" },
      ],
      tag: "Inativo +1 ano",
      tagColor: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
      valor: "1 ano sem visita",
      progresso: 30,
      progressoCor: "bg-rose-500",
      diasNaEtapa: "35d na etapa",
      iniciais: "JP",
      coluna: "reativacao",
      mensagem: "Juliana, estamos com saudades! Temos um voucher especial de retorno para você nas Óticas Brasil.",
    },
  ]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("otb-crm-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    if (!showNotifications) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!notificationAreaRef.current?.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifications]);

  useEffect(() => {
    if (!selectedCard) return;

    const previousFocus = dialogReturnFocusRef.current;
    closeDialogButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCard(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [selectedCard]);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("otb-crm-theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("otb-crm-theme", "light");
      }
      return next;
    });
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData("text/plain", cardId);
    setDraggedCardId(cardId);
    setDragOverCard(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: ColumnId) => {
    e.preventDefault();
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetColId: ColumnId) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain") || draggedCardId;
    if (cardId) {
      setCards((prev) => {
        const movingCard = prev.find((card) => card.id === cardId);
        if (!movingCard) return prev;
        const remaining = prev.filter((card) => card.id !== cardId);
        const lastTargetIndex = remaining.reduce(
          (lastIndex, card, index) => card.coluna === targetColId ? index : lastIndex,
          -1
        );
        const insertionIndex = lastTargetIndex + 1;
        return [
          ...remaining.slice(0, insertionIndex),
          { ...movingCard, coluna: targetColId },
          ...remaining.slice(insertionIndex),
        ];
      });
    }
    setDraggedCardId(null);
    setDragOverColumn(null);
    setDragOverCard(null);
  };

  const handleDragOverCard = (e: React.DragEvent, cardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const bounds = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDragOverCard((current) =>
      current?.id === cardId && current.position === position ? current : { id: cardId, position }
    );
  };

  const handleDropOnCard = (e: React.DragEvent, targetCardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceCardId = e.dataTransfer.getData("text/plain") || draggedCardId;

    if (sourceCardId && sourceCardId !== targetCardId) {
      const bounds = e.currentTarget.getBoundingClientRect();
      const position = e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      setCards((prev) => {
        const sourceCard = prev.find((card) => card.id === sourceCardId);
        const remaining = prev.filter((card) => card.id !== sourceCardId);
        const targetIndex = remaining.findIndex((card) => card.id === targetCardId);
        if (!sourceCard || targetIndex < 0) return prev;

        const targetCard = remaining[targetIndex];
        const insertionIndex = targetIndex + (position === "after" ? 1 : 0);
        remaining.splice(insertionIndex, 0, { ...sourceCard, coluna: targetCard.coluna });
        return remaining;
      });
    }

    setDraggedCardId(null);
    setDragOverColumn(null);
    setDragOverCard(null);
  };

  const pipelinesConfig: Record<PipelineId, PipelineConfig> = {
    novos: {
      titulo: "Novos clientes",
      descricao: "Do primeiro contato à primeira compra.",
      stages: [
        { id: "novo-lead", titulo: "Novo lead", descricao: "Aguardando qualificação", bgColuna: "bg-[#f8f9fc] dark:bg-[#07194f]/60" },
        { id: "em-atendimento", titulo: "Em atendimento", descricao: "Necessidade e orçamento", bgColuna: "bg-[#f5f8ff] dark:bg-[#07194f]/60" },
        { id: "fechamento", titulo: "Fechamento", descricao: "Pronto para a primeira compra", bgColuna: "bg-[#fbfcf5] dark:bg-[#07194f]/60" },
      ],
    },
    relacionamento: {
      titulo: "Clientes recorrentes",
      descricao: "Pós-venda, recompra e recuperação de clientes.",
      stages: [
        { id: "pos-venda", titulo: "Pós-venda", descricao: "Acompanhamento e satisfação", bgColuna: "bg-[#f8f9fc] dark:bg-[#07194f]/60" },
        { id: "recompra", titulo: "Recompra", descricao: "Reposição e novas necessidades", bgColuna: "bg-[#fbfcf5] dark:bg-[#07194f]/60" },
        { id: "reativacao", titulo: "Reativação", descricao: "Retomar clientes inativos", bgColuna: "bg-[#f5f8ff] dark:bg-[#07194f]/60" },
      ],
    },
  };
  const activePipeline = pipelinesConfig[activePipelineId];
  const activeCards = cards.filter((card) => card.pipelineId === activePipelineId);
  const allPipelineStages = Object.values(pipelinesConfig).flatMap((pipeline) => pipeline.stages);
  const normalizedSearchQuery = normalizeSearchText(searchQuery.trim());
  const searchActive = normalizedSearchQuery.length > 0;
  const matchingCards = searchActive
    ? cards.filter((card) => {
        const searchableText = [
          card.cliente,
          card.telefone,
          card.email,
          card.titulo,
          card.tag,
          card.dataNascimento,
          pipelinesConfig[card.pipelineId].titulo,
          allPipelineStages.find((stage) => stage.id === card.coluna)?.titulo ?? "",
        ].join(" ");
        return normalizeSearchText(searchableText).includes(normalizedSearchQuery);
      })
    : [];

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] dark:bg-[#030d29] text-slate-800 dark:text-slate-100 transition-colors">
      {/* Sidebar de Navegação */}
      <Sidebar />

      {/* Conteúdo Central */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar estilo Dribbble */}
        <header className="h-16 mx-4 mt-4 bg-white dark:bg-[#051647] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm px-6 sm:px-8 flex items-center justify-between gap-4 transition-colors">
          {/* Breadcrumb à esquerda */}
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-medium">
            <span>Workspace</span>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <strong className="text-slate-900 dark:text-white font-semibold">
              Pipelines
            </strong>
          </div>

          {/* Controles da direita */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Toggle Uiverse por alexruix */}
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />

            {/* Botão de Alertas com Dropdown */}
            <div ref={notificationAreaRef} className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((isOpen) => !isOpen)}
                aria-label="Alertas"
                title="Alertas"
                aria-expanded={showNotifications}
                className={`topbar-icon-button relative cursor-pointer hover:cursor-pointer ${
                  showNotifications
                    ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]"
                    : "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                <Bell className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#F7915E] text-[10px] font-bold text-white">
                  7
                </span>
              </button>

              <NotificationDropdown
                isOpen={showNotifications}
                onClose={() => setShowNotifications(false)}
              />
            </div>

            {/* Botão Criar estilo Dribbble */}
            <button
              type="button"
              className="topbar-action-button bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Criar</span>
            </button>

          </div>
        </header>

        {/* Cabeçalho do Pipeline estilo Dribbble */}
        <div className="px-6 sm:px-8 pt-8 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {searchActive ? "Resultados da busca" : activePipeline.titulo}
              </h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {searchActive
                  ? `${matchingCards.length} resultados em todas as pipelines`
                  : `${activePipeline.descricao} · ${activeCards.length} deals`}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-2.5 xl:justify-end">
            <button
              type="button"
              className="px-3.5 py-1.5 bg-white dark:bg-[#07194f] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-full text-xs font-semibold shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer hover:cursor-pointer"
            >
              Todos os responsáveis
            </button>
            <div className="inline-flex shrink-0 rounded-full bg-slate-100 p-1 text-xs font-semibold dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setPeriodo("mes")}
                aria-pressed={periodo === "mes"}
                className={`relative rounded-full px-3 py-1 transition-colors cursor-pointer hover:cursor-pointer ${periodo === "mes" ? "text-white dark:text-[#051647]" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}
              >
                {periodo === "mes" && <motion.span layoutId="periodo-ativo" className="pointer-events-none absolute inset-0 rounded-full bg-[#051647] shadow-xs dark:bg-[#C4D600]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                <span className="relative z-10">Mês</span>
              </button>
              <button
                type="button"
                onClick={() => setPeriodo("tri")}
                aria-pressed={periodo === "tri"}
                className={`relative rounded-full px-3 py-1 transition-colors cursor-pointer hover:cursor-pointer ${periodo === "tri" ? "text-white dark:text-[#051647]" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}
              >
                {periodo === "tri" && <motion.span layoutId="periodo-ativo" className="pointer-events-none absolute inset-0 rounded-full bg-[#051647] shadow-xs dark:bg-[#C4D600]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                <span className="relative z-10">Trimestre</span>
              </button>
              <button
                type="button"
                onClick={() => setPeriodo("ano")}
                aria-pressed={periodo === "ano"}
                className={`relative rounded-full px-3 py-1 transition-colors cursor-pointer hover:cursor-pointer ${periodo === "ano" ? "text-white dark:text-[#051647]" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}
              >
                {periodo === "ano" && <motion.span layoutId="periodo-ativo" className="pointer-events-none absolute inset-0 rounded-full bg-[#051647] shadow-xs dark:bg-[#C4D600]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                <span className="relative z-10">Ano</span>
              </button>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 bg-[#051647] dark:bg-[#C4D600] text-white dark:text-[#051647] px-4 py-1.5 rounded-full text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer hover:cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Novo Deal</span>
            </button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Pipelines de clientes" className={`${searchActive ? "hidden" : "inline-flex"} rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80`}>
            <button
              type="button"
              role="tab"
              aria-selected={activePipelineId === "novos"}
              onClick={() => setActivePipelineId("novos")}
              className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${activePipelineId === "novos" ? "text-white dark:text-[#051647]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
            >
              {activePipelineId === "novos" && <motion.span layoutId="pipeline-tab-ativo" className="pointer-events-none absolute inset-0 rounded-lg bg-[#051647] shadow-xs dark:bg-[#C4D600]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="relative z-10 flex items-center gap-2"><UserCheck className="h-4 w-4" />Novos clientes</span>
              <span className="relative z-10 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{cards.filter((card) => card.pipelineId === "novos").length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePipelineId === "relacionamento"}
              onClick={() => setActivePipelineId("relacionamento")}
              className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${activePipelineId === "relacionamento" ? "text-white dark:text-[#051647]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
            >
              {activePipelineId === "relacionamento" && <motion.span layoutId="pipeline-tab-ativo" className="pointer-events-none absolute inset-0 rounded-lg bg-[#051647] shadow-xs dark:bg-[#C4D600]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="relative z-10 flex items-center gap-2"><RefreshCw className="h-4 w-4" />Relacionamento</span>
              <span className="relative z-10 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{cards.filter((card) => card.pipelineId === "relacionamento").length}</span>
            </button>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Buscar cliente em todas as pipelines"
              placeholder="Buscar cliente em todas as pipelines"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-[#07194f] dark:text-white dark:focus:border-[#C4D600]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Limpar busca"
                title="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer hover:cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          </div>
        </div>

        {/* Etapas do funil */}
        <main className="flex-1 px-6 sm:px-8 pb-10">
          {searchActive ? (
            matchingCards.length > 0 ? (
              <div className="max-w-4xl divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {matchingCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    aria-label={`Ver detalhes de ${card.cliente}`}
                    onClick={(event) => {
                      dialogReturnFocusRef.current = event.currentTarget;
                      setSelectedCard(card);
                    }}
                    className="flex w-full items-center gap-3 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer hover:cursor-pointer sm:gap-4"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#051647] text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                      {card.iniciais}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{card.cliente}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{card.titulo} · {card.telefone}</span>
                      <span className="mt-1 block text-[10px] text-slate-400 sm:hidden">{pipelinesConfig[card.pipelineId].titulo} · {allPipelineStages.find((stage) => stage.id === card.coluna)?.titulo}</span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{pipelinesConfig[card.pipelineId].titulo}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{allPipelineStages.find((stage) => stage.id === card.coluna)?.titulo}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${card.tagColor}`}>{card.tag}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="max-w-4xl border-y border-slate-200 py-10 text-center dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum cliente encontrado</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente outro nome, telefone, e-mail ou deal.</p>
              </div>
            )
          ) : (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
            {activePipeline.stages.map((coluna, stageIndex) => {
              const cardsDaColuna = activeCards.filter((card) => card.coluna === coluna.id);
              const isOver = dragOverColumn === coluna.id;

              return (
                <div
                  key={coluna.id}
                  onDragOver={(e) => handleDragOver(e, coluna.id)}
                  onDrop={(e) => handleDrop(e, coluna.id)}
                  className={`relative flex flex-col rounded-2xl p-3 transition-all duration-200 ${cardsDaColuna.length === 0 ? "min-h-[309px]" : ""} ${coluna.bgColuna} ${
                    isOver ? "ring-2 ring-[#002187] dark:ring-[#C4D600] bg-blue-50/50 dark:bg-blue-950/40" : ""
                  }`}
                >
                  {stageIndex < activePipeline.stages.length - 1 && (
                    <motion.span
                      aria-hidden="true"
                      initial={{ opacity: 0, scale: 0.75, x: -4 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 450, damping: 26, delay: stageIndex * 0.08 }}
                      className="pointer-events-none absolute -right-[18px] top-[3.25rem] z-30 hidden h-9 w-9 items-center justify-center rounded-full border-4 border-[#f4f5f8] bg-[#051647] text-[#C4D600] shadow-md dark:border-[#030d29] dark:bg-[#C4D600] dark:text-[#051647] xl:flex"
                    >
                      <ArrowRight className="h-4 w-4" strokeWidth={2.75} />
                    </motion.span>
                  )}
                  <div className="mb-3 flex min-h-14 items-start justify-between gap-2 px-2 py-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-[#002187] shadow-xs dark:bg-[#051647] dark:text-[#C4D600]">{String(stageIndex + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <h2 className="font-bold text-sm text-slate-900 dark:text-white">{coluna.titulo}</h2>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{coluna.descricao}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-[#002187] dark:bg-[#051647] dark:text-[#C4D600]">
                      {cardsDaColuna.length}
                    </span>
                  </div>

                  {/* Fila de Cartões */}
                  <div className="flex flex-1 flex-col gap-3">
                    {cardsDaColuna.length === 0 ? (
                      <div className="flex min-h-32 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300/80 px-4 text-center text-xs text-slate-400 dark:border-slate-700">
                        Nenhum deal nesta etapa
                      </div>
                    ) : cardsDaColuna.map((card) => (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onDragEnd={() => {
                          setDraggedCardId(null);
                          setDragOverCard(null);
                        }}
                        onDragOver={(e) => handleDragOverCard(e, card.id)}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverCard(null);
                        }}
                        onDrop={(e) => handleDropOnCard(e, card.id)}
                        className={`relative bg-white dark:bg-[#07194f] rounded-xl p-4 shadow-xs border border-slate-200/80 dark:border-slate-700/80 transition-all hover:shadow-md cursor-grab active:cursor-grabbing hover:cursor-grab ${
                          draggedCardId === card.id ? "opacity-50 scale-95" : "opacity-100"
                        }`}
                      >
                        {dragOverCard?.id === card.id && (
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none absolute left-3 right-3 z-30 h-0.5 rounded-full bg-[#C4D600] ${dragOverCard.position === "before" ? "top-0" : "bottom-0"}`}
                          />
                        )}
                        <button
                          type="button"
                          aria-label={`Ver detalhes de ${card.cliente}`}
                          title={`Ver detalhes de ${card.cliente}`}
                          onClick={(event) => {
                            dialogReturnFocusRef.current = event.currentTarget;
                            setSelectedCard(card);
                          }}
                          className="absolute inset-0 z-0 rounded-xl cursor-pointer hover:cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002187] dark:focus-visible:outline-[#C4D600]"
                        />
                        <div className="relative z-10 pointer-events-none space-y-3">
                        {/* Título e Tag */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                              {card.titulo}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {card.cliente}
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${card.tagColor}`}>
                            {card.tag}
                          </span>
                        </div>

                        {/* Valor e Porcentagem */}
                        <div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                              {card.valor}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-400">
                              {card.progresso}%
                            </span>
                          </div>
                          {/* Barra de Progresso estilo Dribbble */}
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                            <div
                              className={`h-1.5 rounded-full ${card.progressoCor}`}
                              style={{ width: `${card.progresso}%` }}
                            />
                          </div>
                        </div>

                        {/* Rodapé do Card com Avatar, Tempo e Botão WhatsApp Oficial */}
                        <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold flex items-center justify-center">
                              {card.iniciais}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {card.diasNaEtapa}
                            </span>
                          </div>

                          {/* Botão Oficial do WhatsApp com Logotipo Real */}
                          <button
                            type="button"
                            className="relative z-20 pointer-events-auto flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20ba5a] text-white px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer hover:cursor-pointer shadow-xs"
                            title="Disparar mensagem no WhatsApp"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                            <span>WhatsApp</span>
                          </button>
                        </div>
                        </div>
                      </div>
                    ))}

                    {/* Botão Dribbble "+ Add deal" pontilhado */}
                    <button
                      type="button"
                      className="mt-auto w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar deal</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </main>
      </div>

      {selectedCard && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#051647]/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedCard(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-details-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#07194f] sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                  {selectedCard.iniciais}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Detalhes do cliente</p>
                  <h2 id="customer-details-title" className="truncate text-lg font-bold text-slate-900 dark:text-white">
                    {selectedCard.cliente}
                  </h2>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedCard.tagColor}`}>
                    {selectedCard.tag}
                  </span>
                </div>
              </div>
              <button
                ref={closeDialogButtonRef}
                type="button"
                onClick={() => setSelectedCard(null)}
                aria-label="Fechar detalhes do cliente"
                title="Fechar"
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer hover:cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <section>
                <h3 className="mb-3 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Dados do cliente</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Telefone</dt><dd>{selectedCard.telefone}</dd></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0"><dt className="text-[10px] text-slate-500 dark:text-slate-400">E-mail</dt><dd className="break-all">{selectedCard.email}</dd></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Data de nascimento</dt><dd>{selectedCard.dataNascimento}</dd></div>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="mb-3 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Negócio atual</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="col-span-2"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Deal</dt><dd className="font-semibold">{selectedCard.titulo}</dd></div>
                  <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Etapa</dt><dd>{allPipelineStages.find((stage) => stage.id === selectedCard.coluna)?.titulo}</dd></div>
                  <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Na etapa</dt><dd>{selectedCard.diasNaEtapa}</dd></div>
                  <div className="col-span-2"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Valor / situação</dt><dd className="font-bold">{selectedCard.valor}</dd></div>
                </dl>
              </section>
            </div>

            <section className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                <ShoppingBag className="h-4 w-4" /> Últimas compras
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedCard.ultimasCompras.map((purchase) => (
                  <div key={`${purchase.data}-${purchase.produto}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{purchase.produto}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{purchase.data}</p>
                    </div>
                    <span className="shrink-0 font-bold text-slate-900 dark:text-white">{purchase.valor}</span>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </div>
      )}
    </div>
  );
}
