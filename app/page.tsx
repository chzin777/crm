"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "motion/react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { EntityDialog } from "@/components/EntityDialog";
import { StageEditorDialog } from "@/components/StageEditorDialog";
import { SendMessageDialog } from "@/components/SendMessageDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useCrmData } from "@/hooks/useCrmData";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import type { Contact } from "@/lib/contacts";
import {
  STAGE_DEFINITIONS,
  STAGE_PROGRESS,
  orderedStages,
  resolveStageConfigs,
  type PipelineId,
  type StageConfig,
  type StageConfigStore,
  type LegacyPipelineRules,
  type StageDefinition,
  type StageId,
} from "@/lib/pipeline-stages";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  UserCheck,
  RefreshCw,
  ArrowRight,
  CalendarDays,
  Mail,
  Phone,
  ShoppingBag,
  X,
} from "lucide-react";

type ColumnId = StageId;
const CARD_PAGE_SIZES = [10, 20, 30, 50] as const;

interface PurchaseRecord {
  produto: string;
  data: string;
  valor: string;
}

function formatPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
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
  contactId?: string;
  tag: string;
  tagColor: string;
  valor: string;
  progresso: number;
  progressoCor: string;
  diasNaEtapa: string;
  iniciais: string;
  coluna: ColumnId;
  mensagem: string;
  entrouEmEtapaEm?: string;
}

interface PipelineConfig {
  titulo: string;
  descricao: string;
  stages: StageDefinition[];
}

const pipelineMeta: Record<PipelineId, { titulo: string; descricao: string }> = {
  novos: { titulo: "Novos clientes", descricao: "Do primeiro contato à primeira compra." },
  relacionamento: { titulo: "Clientes recorrentes", descricao: "Pós-venda, recompra e recuperação de clientes." },
};

function isStageOverdue(card: PipelineCard, config: StageConfig | undefined): boolean {
  if (!config?.maxDiasNaEtapa || !card.entrouEmEtapaEm) return false;
  const enteredAt = new Date(card.entrouEmEtapaEm).getTime();
  return Number.isFinite(enteredAt) && Date.now() - enteredAt > config.maxDiasNaEtapa * 86400000;
}

const normalizeSearchText = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export default function Home() {
  const { isDark, toggleTheme } = useCrmTheme();
  const [periodo, setPeriodo] = useState<"mes" | "tri" | "ano">("tri");
  const [activePipelineId, setActivePipelineId] = useState<PipelineId>("novos");
  const [cardsPerPage, setCardsPerPage] = useState<number>(10);
  const [stagePages, setStagePages] = useState<Partial<Record<ColumnId, number>>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);
  const [dragOverCard, setDragOverCard] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationAreaRef = useRef<HTMLDivElement>(null);
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null);
  const [messageCard, setMessageCard] = useState<PipelineCard | null>(null);
  const [loadedPurchases, setLoadedPurchases] = useState<{ contactId: string; items: PurchaseRecord[] | null } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsError, setContactsError] = useState("");
  const [isCreateDealOpen, setIsCreateDealOpen] = useState(false);
  const [dealContactId, setDealContactId] = useState("");
  const [dealTitle, setDealTitle] = useState("");
  const [dealPipelineId, setDealPipelineId] = useState<PipelineId>("novos");
  const [dealStageId, setDealStageId] = useState<ColumnId>("novo-lead");
  const [contactsLoading, setContactsLoading] = useState(true);
  const [dealError, setDealError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const closeDialogButtonRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  const { data: cards, setData: setCards, isLoading: cardsLoading, isSaving: cardsSaving, error: cardsError, reloadData: reloadPipeline } = useCrmData<PipelineCard[]>("pipeline", []);
  const { data: settingsData } = useCrmData<{ pipelineRules?: LegacyPipelineRules }>("settings", {}, { autoSave: false });
  const { data: stageStore, setData: setStageStore, saveData: saveStageStore } = useCrmData<StageConfigStore>("pipeline-stages", { stages: {} }, { autoSave: false });
  const [editingStageId, setEditingStageId] = useState<StageId | null>(null);
  const stageConfigs = useMemo(
    () => resolveStageConfigs(stageStore, settingsData.pipelineRules),
    [stageStore, settingsData.pipelineRules]
  );
  const pipelinesConfig = useMemo<Record<PipelineId, PipelineConfig>>(() => ({
    novos: { ...pipelineMeta.novos, stages: orderedStages("novos", stageConfigs) },
    relacionamento: { ...pipelineMeta.relacionamento, stages: orderedStages("relacionamento", stageConfigs) },
  }), [stageConfigs]);
  const stageTitle = (stageId: StageId) => stageConfigs[stageId].titulo;

  const handleSaveStage = async (stageId: StageId, config: StageConfig, position: number) => {
    const pipelineId = STAGE_DEFINITIONS.find((stage) => stage.id === stageId)!.pipelineId;
    const ids = orderedStages(pipelineId, stageConfigs).map((stage) => stage.id).filter((id) => id !== stageId);
    ids.splice(position, 0, stageId);
    const stages = { ...(stageStore.stages ?? {}) };
    ids.forEach((id, index) => {
      stages[id] = id === stageId ? { ...config, ordem: index } : { ...(stages[id] ?? {}), ordem: index };
    });
    const next: StageConfigStore = { stages };
    await saveStageStore(next);
    setStageStore(next);
  };
  const editingStage = editingStageId ? STAGE_DEFINITIONS.find((stage) => stage.id === editingStageId) : undefined;

  useEffect(() => {
    let active = true;
    fetch("/api/contacts/search?limit=50")
      .then(async (response) => {
        const result = await response.json() as { data?: Contact[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Não foi possível carregar os contatos.");
        if (active) setContacts(result.data ?? []);
      })
      .catch((error: unknown) => {
        if (active) setContactsError(error instanceof Error ? error.message : "Não foi possível carregar os contatos.");
      })
      .finally(() => { if (active) setContactsLoading(false); });
    return () => { active = false; };
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

  const selectedContactId = selectedCard?.contactId;
  useEffect(() => {
    if (!selectedContactId) return;
    const controller = new AbortController();
    fetch(`/api/contacts/${encodeURIComponent(selectedContactId)}/purchases`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: PurchaseRecord[] } | null) => setLoadedPurchases({ contactId: selectedContactId, items: body?.data ?? [] }))
      .catch(() => {
        if (!controller.signal.aborted) setLoadedPurchases({ contactId: selectedContactId, items: [] });
      });
    return () => controller.abort();
  }, [selectedContactId]);

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
          { ...movingCard, coluna: targetColId, progresso: STAGE_PROGRESS[targetColId], diasNaEtapa: "Atualizado agora", entrouEmEtapaEm: movingCard.coluna === targetColId ? movingCard.entrouEmEtapaEm : new Date().toISOString() },
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
        remaining.splice(insertionIndex, 0, {
          ...sourceCard,
          coluna: targetCard.coluna,
          progresso: STAGE_PROGRESS[targetCard.coluna],
          diasNaEtapa: "Atualizado agora",
          entrouEmEtapaEm: sourceCard.coluna === targetCard.coluna ? sourceCard.entrouEmEtapaEm : new Date().toISOString(),
        });
        return remaining;
      });
    }

    setDraggedCardId(null);
    setDragOverColumn(null);
    setDragOverCard(null);
  };

  const openDealDialog = (stage?: ColumnId) => {
    let pipelineId = activePipelineId;
    let stageId = stage;
    if (stage) {
      pipelineId = pipelinesConfig.novos.stages.some((item) => item.id === stage) ? "novos" : "relacionamento";
    } else {
      stageId = pipelinesConfig[pipelineId].stages[0].id;
    }
    setDealPipelineId(pipelineId);
    setDealStageId(stageId ?? pipelinesConfig[pipelineId].stages[0].id);
    setDealContactId("");
    setDealTitle("");
    setDealError("");
    setIsCreateDealOpen(true);
  };
  const createDeal = () => {
    const contact = contacts.find((item) => item.id === dealContactId);
    if (!contact) {
      setDealError(contactsError || "Selecione um contato existente para criar a oportunidade.");
      return;
    }
    const selectedStage = pipelinesConfig[dealPipelineId].stages.find((stage) => stage.id === dealStageId) ?? pipelinesConfig[dealPipelineId].stages[0];
    const categoryLabel: Record<Contact["categoria"], string> = {
      cliente: "Cliente",
      lead: "Lead",
      nps: "NPS",
      inativo: "Inativo",
    };
    const tagColor = contact.categoria === "lead"
      ? "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]"
      : contact.categoria === "cliente"
        ? "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]"
        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    const card: PipelineCard = {
      id: crypto.randomUUID(),
      pipelineId: dealPipelineId,
      titulo: dealTitle.trim() || `Acompanhar ${contact.nome}`,
      cliente: contact.nome,
      telefone: contact.telefone,
      email: contact.email,
      dataNascimento: contact.dataNascimento,
      ultimasCompras: [],
      contactId: contact.id,
      tag: contact.segmento || categoryLabel[contact.categoria],
      tagColor,
      valor: "Valor a definir",
      progresso: STAGE_PROGRESS[selectedStage.id],
      progressoCor: "bg-[#C4D600]",
      diasNaEtapa: "Novo",
      entrouEmEtapaEm: new Date().toISOString(),
      iniciais: contact.iniciais,
      coluna: selectedStage.id,
      mensagem: "",
    };
    setCards((current) => [card, ...current]);
    setActivePipelineId(dealPipelineId);
    setDealError("");
    setIsCreateDealOpen(false);
  };
  const activePipeline = pipelinesConfig[activePipelineId];
  const normalizedSearchQuery = useMemo(() => normalizeSearchText(searchQuery.trim()), [searchQuery]);
  const searchActive = normalizedSearchQuery.length > 0;

  const activeCards = useMemo(
    () => cards.filter((card) => card.pipelineId === activePipelineId),
    [cards, activePipelineId]
  );

  const cardsByStage = useMemo(() => {
    const grouped: Record<ColumnId, PipelineCard[]> = {
      "novo-lead": [],
      "em-atendimento": [],
      fechamento: [],
      "pos-venda": [],
      recompra: [],
      reativacao: [],
    };
    for (const card of activeCards) {
      if (grouped[card.coluna]) grouped[card.coluna].push(card);
    }
    return grouped;
  }, [activeCards]);

  const matchingCards = useMemo(() => {
    if (!searchActive) return [];
    return cards.filter((card) => {
      const searchableText = [
        card.cliente,
        card.telefone,
        card.email,
        card.titulo,
        card.tag,
        card.dataNascimento,
        pipelineMeta[card.pipelineId].titulo,
        stageConfigs[card.coluna]?.titulo ?? "",
      ].join(" ");
      return normalizeSearchText(searchableText).includes(normalizedSearchQuery);
    });
  }, [cards, searchActive, normalizedSearchQuery, stageConfigs]);

  const novosCount = useMemo(() => cards.filter((card) => card.pipelineId === "novos").length, [cards]);
  const relacionamentoCount = useMemo(() => cards.filter((card) => card.pipelineId === "relacionamento").length, [cards]);

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
              </button>

              <NotificationDropdown
                isOpen={showNotifications}
                onClose={() => setShowNotifications(false)}
              />
            </div>

            {/* Botão Criar estilo Dribbble */}
            <button
              type="button"
              onClick={() => openDealDialog()}
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
              onClick={async () => {
                setSyncMessage(null);
                setIsSyncing(true);
                try {
                  let totalCreated = 0;
                  let totalCards = 0;
                  // Each call syncs one batch; columns are refreshed between calls.
                  for (let batch = 0; batch < 100; batch++) {
                    const res = await fetch("/api/pipeline/sync", { method: "POST" });
                    const data = await res.json() as { error?: string; done?: boolean; created?: number; total?: number };
                    if (!res.ok) {
                      await reloadPipeline().catch(() => undefined);
                      setSyncMessage({
                        type: totalCreated > 0 ? "success" : "error",
                        text: totalCreated > 0
                          ? `${totalCreated} cards foram gravados na pipeline.`
                          : data.error || "Erro ao sincronizar.",
                      });
                      return;
                    }
                    totalCreated += data.created ?? 0;
                    totalCards = data.total ?? totalCards;
                    if ((data.created ?? 0) > 0) await reloadPipeline();
                    if (data.done) break;
                    setSyncMessage({ type: "success", text: `Sincronizando... ${totalCards} cards na pipeline até agora.` });
                  }
                  setSyncMessage({
                    type: "success",
                    text: `Sincronização concluída: ${totalCreated} cards novos gravados, ${totalCards} cards na pipeline.`,
                  });
                } catch (error: unknown) {
                  setSyncMessage({
                    type: "error",
                    text: error instanceof Error
                      ? `Falha ao sincronizar: ${error.message}`
                      : "Falha de conexão ao sincronizar.",
                  });
                } finally {
                  setIsSyncing(false);
                }
              }}
              disabled={isSyncing}
              className="flex items-center gap-1.5 bg-white dark:bg-[#07194f] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Sincronizando..." : "Sincronizar contatos"}</span>
            </button>
            <button
              type="button"
              onClick={() => openDealDialog()}
              className="flex items-center gap-1.5 bg-[#051647] dark:bg-[#C4D600] text-white dark:text-[#051647] px-4 py-1.5 rounded-full text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer hover:cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Novo Deal</span>
            </button>
            </div>
          </div>

          {syncMessage && (
            <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${syncMessage.type === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"}`}>
              {syncMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {syncMessage.text}
            </div>
          )}

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
              <span className="relative z-10 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{novosCount}</span>
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
              <span className="relative z-10 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{relacionamentoCount}</span>
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
          {cardsError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cardsError}</p>}
          {cardsSaving && <LoadingSpinner label="Salvando alterações no banco..." size={32} className="mb-4" />}
          {contactsError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{contactsError}</p>}
          {!searchActive && (
            <label className="mb-4 flex w-fit items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Cards por página
              <select
                value={cardsPerPage}
                onChange={(event) => {
                  setCardsPerPage(Number(event.target.value));
                  setStagePages({});
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#07194f] dark:text-white dark:focus:border-[#C4D600] cursor-pointer hover:cursor-pointer"
              >
                {CARD_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          )}
          {searchActive ? (
            cardsLoading ? (
              <div className="max-w-4xl border-y border-slate-200 py-8 dark:border-slate-800">
                <LoadingSpinner label="Carregando oportunidades..." className="w-full justify-center" />
              </div>
            ) : matchingCards.length > 0 ? (
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
                      <span className="mt-1 block text-[10px] text-slate-400 sm:hidden">{pipelinesConfig[card.pipelineId].titulo} · {stageTitle(card.coluna)}</span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{pipelinesConfig[card.pipelineId].titulo}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{stageTitle(card.coluna)}</span>
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
              const cardsDaColuna = cardsByStage[coluna.id];
              const pageCount = Math.max(1, Math.ceil(cardsDaColuna.length / cardsPerPage));
              const currentPage = Math.min(stagePages[coluna.id] ?? 1, pageCount);
              const visibleCards = cardsDaColuna.slice((currentPage - 1) * cardsPerPage, currentPage * cardsPerPage);
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
                        <h2 className="font-bold text-sm text-slate-900 dark:text-white">{stageConfigs[coluna.id].titulo}</h2>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{stageConfigs[coluna.id].descricao}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingStageId(coluna.id)}
                        aria-label={`Editar etapa ${stageConfigs[coluna.id].titulo}`}
                        title="Editar etapa"
                        className="grid h-6 w-6 place-items-center rounded-full text-slate-500 hover:bg-white/80 hover:text-[#002187] dark:text-slate-400 dark:hover:bg-[#051647] dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-[#002187] dark:bg-[#051647] dark:text-[#C4D600]">
                        {cardsDaColuna.length}
                      </span>
                    </div>
                  </div>

                  {/* Fila de Cartões */}
                  <div className="flex flex-1 flex-col gap-3">
                    {cardsLoading ? (
                      <div className="flex min-h-32 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300/80 px-4 dark:border-slate-700">
                        <LoadingSpinner label={`Carregando etapa ${stageConfigs[coluna.id].titulo}...`} />
                      </div>
                    ) : cardsDaColuna.length === 0 ? (
                      <div className="flex min-h-32 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300/80 px-4 text-center text-xs text-slate-400 dark:border-slate-700">
                        Nenhum deal nesta etapa
                      </div>
                    ) : visibleCards.map((card) => (
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
                            {isStageOverdue(card, stageConfigs[card.coluna]) && (
                              <span className="rounded-full bg-[#F7915E]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#9a3d12] dark:text-[#F7915E]" title={`Limite da etapa: ${stageConfigs[card.coluna].maxDiasNaEtapa} dias`}>
                                Prazo excedido
                              </span>
                            )}
                          </div>

                          {/* Botão Oficial do WhatsApp com Logotipo Real */}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMessageCard(card);
                            }}
                            className="relative z-20 pointer-events-auto flex items-center gap-1.5 rounded-md bg-[#25D366] px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition-colors hover:bg-[#20ba5a] cursor-pointer hover:cursor-pointer"
                            title="Enviar mensagem"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                            <span>Enviar mensagem</span>
                          </button>
                        </div>
                        </div>
                      </div>
                    ))}

                    {cardsDaColuna.length > 0 && (
                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-200/70 px-1 pt-3 dark:border-slate-700/70">
                        <button
                          type="button"
                          onClick={() => setStagePages((current) => ({ ...current, [coluna.id]: Math.max(1, currentPage - 1) }))}
                          disabled={currentPage === 1}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-[#002187] hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#C4D600] dark:hover:bg-slate-800/70 cursor-pointer hover:cursor-pointer"
                        >
                          Anterior
                        </button>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Página {currentPage} de {pageCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStagePages((current) => ({ ...current, [coluna.id]: Math.min(pageCount, currentPage + 1) }))}
                          disabled={currentPage === pageCount}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-[#002187] hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#C4D600] dark:hover:bg-slate-800/70 cursor-pointer hover:cursor-pointer"
                        >
                          Próxima
                        </button>
                      </div>
                    )}

                    {/* Botão Dribbble "+ Add deal" pontilhado */}
                    <button
                      type="button"
                      onClick={() => openDealDialog(coluna.id)}
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

      {editingStage && (
        <StageEditorDialog
          key={editingStage.id}
          stageName={stageConfigs[editingStage.id].titulo}
          config={stageConfigs[editingStage.id]}
          position={pipelinesConfig[editingStage.pipelineId].stages.findIndex((stage) => stage.id === editingStage.id)}
          stageCount={pipelinesConfig[editingStage.pipelineId].stages.length}
          onClose={() => setEditingStageId(null)}
          onSave={(config, position) => handleSaveStage(editingStage.id, config, position)}
        />
      )}

      {messageCard && (
        <SendMessageDialog
          recipientName={messageCard.cliente}
          recipientPhone={formatPhone(messageCard.telefone)}
          onClose={() => setMessageCard(null)}
          onSend={async ({ text, files }) => {
            const body = new FormData();
            body.set("phone", messageCard.telefone);
            body.set("text", text);
            files.forEach((file) => body.append("files", file));
            const response = await fetch("/api/whatsapp/send", { method: "POST", body });
            if (!response.ok) {
              const data = await response.json().catch(() => null);
              throw new Error(data?.error ?? "Não foi possível enviar a mensagem.");
            }
          }}
        />
      )}

      {isCreateDealOpen && (
        <EntityDialog
          titleId="create-deal-title"
          title="Nova oportunidade"
          description="Vincule uma oportunidade a um contato existente no banco."
          onClose={() => setIsCreateDealOpen(false)}
        >
          <div className="flex h-full flex-col gap-4">
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Contato
              <select
                value={dealContactId}
                onChange={(event) => setDealContactId(event.target.value)}
                disabled={contactsLoading || contacts.length === 0}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
              >
                <option value="">{contactsLoading ? "Carregando contatos..." : "Selecione um contato"}</option>
                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.nome} · {contact.telefone}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Nome da oportunidade
              <input
                value={dealTitle}
                onChange={(event) => setDealTitle(event.target.value)}
                placeholder="Ex.: Orçamento de lentes"
                maxLength={200}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
              />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Pipeline
              <select
                value={dealPipelineId}
                onChange={(event) => {
                  const pipelineId = event.target.value === "relacionamento" ? "relacionamento" : "novos";
                  setDealPipelineId(pipelineId);
                  setDealStageId(pipelinesConfig[pipelineId].stages[0].id);
                }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
              >
                <option value="novos">Novos clientes</option>
                <option value="relacionamento">Relacionamento</option>
              </select>
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Etapa
              <select
                value={dealStageId}
                onChange={(event) => {
                  const stage = pipelinesConfig[dealPipelineId].stages.find((item) => item.id === event.target.value);
                  if (stage) setDealStageId(stage.id);
                }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
              >
                {pipelinesConfig[dealPipelineId].stages.map((stage) => <option key={stage.id} value={stage.id}>{stageTitle(stage.id)}</option>)}
              </select>
            </label>
            {contacts.length === 0 && !contactsLoading && !contactsError && (
              <p className="text-xs text-slate-500">Cadastre um contato antes de criar uma oportunidade.</p>
            )}
            {dealError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{dealError}</p>}
            <div className="mt-auto flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setIsCreateDealOpen(false)} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
              <button type="button" onClick={createDeal} disabled={contactsLoading || contacts.length === 0} className="h-9 rounded-lg bg-[#051647] px-3 text-xs font-bold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">Criar oportunidade</button>
            </div>
          </div>
        </EntityDialog>
      )}

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
                    <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Telefone</dt><dd>{formatPhone(selectedCard.telefone)}</dd></div>
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
                  <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Etapa</dt><dd>{stageTitle(selectedCard.coluna)}</dd></div>
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
              {(() => {
                const purchases = selectedCard.ultimasCompras.length > 0
                  ? selectedCard.ultimasCompras
                  : loadedPurchases && loadedPurchases.contactId === selectedCard.contactId ? loadedPurchases.items ?? [] : null;
                if (purchases === null) {
                  return selectedCard.contactId
                    ? <LoadingSpinner label="Carregando compras..." size={32} className="py-3" />
                    : <p className="py-3 text-xs text-slate-500 dark:text-slate-400">Não há compras detalhadas registradas para esta oportunidade.</p>;
                }
                if (purchases.length === 0) {
                  return <p className="py-3 text-xs text-slate-500 dark:text-slate-400">Não há compras detalhadas registradas para esta oportunidade.</p>;
                }
                return purchases.map((purchase, index) => (
                  <div key={`${purchase.data}-${purchase.produto}-${index}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{purchase.produto}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{purchase.data}</p>
                    </div>
                    <span className="shrink-0 font-bold text-slate-900 dark:text-white">{purchase.valor}</span>
                  </div>
                ));
              })()}
              </div>
            </section>
          </section>
        </div>
      )}
    </div>
  );
}
