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
import { CustomSelect } from "@/components/CustomSelect";
import { useCrmData } from "@/hooks/useCrmData";
import { useCrmTheme } from "@/hooks/useCrmTheme";

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};
import { useToast } from "@/components/ToastProvider";
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
  Paperclip,
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
import Stepper, { Step } from "@/components/Stepper";

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

interface DealObservation {
  id: string;
  texto: string;
  autor: string;
  criadoEm: string;
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
  observacoes?: DealObservation[];
  imagem?: string;
  progresso: number;
  progressoCor: string;
  diasNaEtapa: string;
  iniciais: string;
  coluna: ColumnId;
  mensagem: string;
  entrouEmEtapaEm?: string;
}

function migrateCards(cards: PipelineCard[]): { cards: PipelineCard[]; changed: boolean } {
  let changed = false;
  const migrated = cards.map((card) => {
    const raw = card.observacoes as unknown;
    if (typeof raw === "string") {
      changed = true;
      const text = raw.trim();
      return {
        ...card,
        observacoes: text ? [{ id: generateId(), texto: text, autor: "Sistema", criadoEm: new Date().toISOString() }] : [],
      };
    }
    if (!Array.isArray(raw)) {
      changed = true;
      return { ...card, observacoes: [] };
    }
    return card;
  });
  return { cards: migrated, changed };
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
  const toast = useToast();
  const [periodo, setPeriodo] = useState<"mes" | "tri" | "ano">("tri");
  const [activePipelineId, setActivePipelineIdState] = useState<PipelineId>("novos");
  const setActivePipelineId = (id: PipelineId) => {
    setActivePipelineIdState(id);
    window.localStorage.setItem("crm-active-pipeline", id);
  };
  useEffect(() => {
    const saved = window.localStorage.getItem("crm-active-pipeline");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "novos" || saved === "relacionamento") setActivePipelineIdState(saved);
  }, []);
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
  const [dealContactSearch, setDealContactSearch] = useState("");
  const [isDealContactOpen, setIsDealContactOpen] = useState(false);
  const dealContactRef = useRef<HTMLDivElement>(null);
  const [dealContactResults, setDealContactResults] = useState<Contact[]>([]);
  const [dealContactSearching, setDealContactSearching] = useState(false);
  const dealContactSearchRef = useRef(dealContactSearch);
  dealContactSearchRef.current = dealContactSearch;

  useEffect(() => {
    const term = dealContactSearch.trim();
    if (!term) {
      setDealContactResults(contacts);
      setDealContactSearching(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setDealContactSearching(true);
      fetch(`/api/contacts/search?q=${encodeURIComponent(term)}&limit=50`, { signal: controller.signal })
        .then(async (response) => {
          const result = await response.json() as { data?: Contact[]; error?: string };
          if (!response.ok) throw new Error(result.error || "Erro ao buscar contatos.");
          if (dealContactSearchRef.current === term) {
            setDealContactResults(result.data ?? []);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name !== "AbortError" && dealContactSearchRef.current === term) {
            setDealContactResults([]);
          }
        })
        .finally(() => {
          if (dealContactSearchRef.current === term) setDealContactSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [dealContactSearch, contacts]);

  // Click-outside handler for deal contact dropdown
  useEffect(() => {
    if (!isDealContactOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dealContactRef.current && !dealContactRef.current.contains(event.target as Node)) {
        setIsDealContactOpen(false);
        if (dealContactId) {
          const selected = contacts.find((c) => c.id === dealContactId) ?? dealContactResults.find((c) => c.id === dealContactId);
          setDealContactSearch(selected?.nome ?? "");
        } else {
          setDealContactSearch("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDealContactOpen, dealContactId, contacts, dealContactResults]);

  const filteredDealContacts = dealContactSearch.trim() ? dealContactResults : contacts;
  const [dealTitle, setDealTitle] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [newObservations, setNewObservations] = useState<DealObservation[]>([]);
  const [newObservationText, setNewObservationText] = useState("");
  const [newDealImage, setNewDealImage] = useState<string | null>(null);
  const dealImageInputRef = useRef<HTMLInputElement>(null);
  const [dealPipelineId, setDealPipelineId] = useState<PipelineId>("novos");
  const [dealStageId, setDealStageId] = useState<ColumnId>("novo-lead");
  const [contactsLoading, setContactsLoading] = useState(true);
  const [dealError, setDealError] = useState("");
  const [editingCard, setEditingCard] = useState<PipelineCard | null>(null);
  const [detailTab, setDetailTab] = useState<"dados" | "compras" | "observacoes">("dados");
  const migratedRef = useRef(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const closeDialogButtonRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  const { data: cards, setData: setCards, isLoading: cardsLoading, isSaving: cardsSaving, error: cardsError, reloadData: reloadPipeline } = useCrmData<PipelineCard[]>("pipeline", []);

  // Migrate old string observacoes to DealObservation[] on first load
  useEffect(() => {
    if (migratedRef.current || cards.length === 0) return;
    const result = migrateCards(cards);
    if (result.changed) {
      migratedRef.current = true;
      setCards(result.cards);
    } else {
      migratedRef.current = true;
    }
  }, [cards, setCards]);
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
    toast.success("Etapa atualizada", `"${config.titulo}" foi salva.`);
  };
  const editingStage = editingStageId ? STAGE_DEFINITIONS.find((stage) => stage.id === editingStageId) : undefined;

  useEffect(() => {
    let active = true;
    fetch("/api/contacts/search?limit=500")
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
    toast.success("Oportunidade movida", "A etapa da oportunidade foi atualizada.");
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
      toast.success("Oportunidade movida", "A posição da oportunidade foi atualizada.");
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
    setDealContactSearch("");
    setDealContactResults([]);
    setDealTitle("");
    setDealValue("");
    setDealNotes("");
    setDealError("");
    setEditingCard(null);
    setIsCreateDealOpen(true);
  };
  const createDeal = () => {
    const contact = contacts.find((item) => item.id === dealContactId) ?? dealContactResults.find((item) => item.id === dealContactId);
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
    const allObservations = [...newObservations];
    if (dealNotes.trim()) {
      allObservations.push({ id: generateId(), texto: dealNotes.trim(), autor: "Usuário", criadoEm: new Date().toISOString() });
    }
    if (editingCard) {
      // Edit existing card
      setCards((current) => current.map((c) => c.id === editingCard.id ? {
        ...c,
        pipelineId: dealPipelineId,
        titulo: dealTitle.trim() || c.titulo,
        cliente: contact.nome,
        telefone: contact.telefone,
        email: contact.email,
        dataNascimento: contact.dataNascimento,
        contactId: contact.id,
        tag: contact.segmento || categoryLabel[contact.categoria],
        tagColor,
        valor: dealValue.trim() || "Valor a definir",
        observacoes: allObservations.length > 0 ? allObservations : c.observacoes,
        imagem: newDealImage ?? c.imagem,
        progresso: STAGE_PROGRESS[selectedStage.id],
        iniciais: contact.iniciais,
        coluna: selectedStage.id,
      } : c));
      toast.success("Oportunidade atualizada", `"${dealTitle.trim() || editingCard.titulo}" foi editada.`);
    } else {
      // Create new card
      const card: PipelineCard = {
        id: generateId(),
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
        valor: dealValue.trim() || "Valor a definir",
        observacoes: allObservations,
        imagem: newDealImage ?? undefined,
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
      toast.success("Oportunidade criada", `"${card.titulo}" foi adicionada.`);
    }
    setNewObservations([]);
    setNewObservationText("");
    setNewDealImage(null);
  }

  const updateSelectedCardField = (field: keyof PipelineCard, value: string) => {
    if (!selectedCard) return;
    setCards((current) => current.map((c) => c.id === selectedCard.id ? { ...c, [field]: value } : c));
    setSelectedCard((prev) => prev && prev.id === selectedCard.id ? { ...prev, [field]: value } : prev);
  };

  const addObservationToCard = (texto: string) => {
    if (!selectedCard || !texto.trim()) return;
    const obs: DealObservation = { id: generateId(), texto: texto.trim(), autor: "Usuário", criadoEm: new Date().toISOString() };
    setCards((current) => current.map((c) => c.id === selectedCard.id ? { ...c, observacoes: [...(c.observacoes ?? []), obs] } : c));
    setSelectedCard((prev) => prev && prev.id === selectedCard.id ? { ...prev, observacoes: [...(prev.observacoes ?? []), obs] } : prev);
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

          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <NotificationDropdown isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
          </div>
        </header>

        {/* Cabeçalho do Pipeline estilo Dribbble */}
        <div className="px-6 sm:px-8 pt-8 pb-4">
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
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void reloadPipeline()} disabled={cardsLoading} aria-label="Atualizar pipeline" title="Atualizar pipeline" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${cardsLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <button type="button" onClick={() => openDealDialog()} className="inline-flex items-center gap-2 rounded-lg bg-[#051647] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer">
                <Plus className="h-4 w-4" />
                Novo negócio
              </button>
            </div>
          </div>
        </div>

        {/* Etapas do funil */}
        <main className="flex-1 px-6 sm:px-8 pb-10">
          {cardsError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cardsError}</p>}
          {cardsSaving && <LoadingSpinner label="Salvando alterações no banco..." size={32} className="mb-4" />}
          {contactsError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{contactsError}</p>}
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
            toast.success("Mensagem enviada", `Enviada para ${messageCard.cliente}.`);
          }}
        />
      )}

      {isCreateDealOpen && (
          <Stepper
              cancelButtonText="Cancelar"
              onCancel={() => setIsCreateDealOpen(false)}
              indicator="numbers"
              transition="slide"
              linear
              validateStep={(step) => {
                if (step === 1) return !!dealContactId;
                if (step === 2) return !!dealTitle.trim();
                return true;
              }}
              onFinalStepCompleted={createDeal}
              backButtonText="Voltar"
              nextButtonText="Continuar"
              completeButtonText={editingCard ? "Salvar alterações" : "Criar oportunidade"}
              accentColor="#C4D600"
              theme="light"
            >
              <Step title="Contato" description="Selecione o contato vinculado">
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300" htmlFor="deal-contact-search">Contato</label>
                    <div className="relative" ref={dealContactRef}>
                      <input
                        id="deal-contact-search"
                        type="text"
                        role="combobox"
                        aria-expanded={isDealContactOpen}
                        aria-controls="deal-contact-listbox"
                        autoComplete="off"
                        placeholder={contactsLoading ? "Carregando contatos..." : dealContactId ? ((contacts.find((c) => c.id === dealContactId) ?? dealContactResults.find((c) => c.id === dealContactId))?.nome ?? "Selecione um contato") : "Pesquisar contato..."}
                        value={dealContactSearch}
                        onChange={(event) => {
                          setDealContactSearch(event.target.value);
                          if (!isDealContactOpen) setIsDealContactOpen(true);
                        }}
                        onFocus={() => {
                          if (dealContactId) {
                            const selected = contacts.find((c) => c.id === dealContactId) ?? dealContactResults.find((c) => c.id === dealContactId);
                            setDealContactSearch(selected?.nome ?? "");
                          }
                          setIsDealContactOpen(true);
                        }}
                        disabled={contactsLoading || contacts.length === 0}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] cursor-pointer hover:cursor-pointer"
                      />
                      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      {isDealContactOpen && (
                        <ul
                          id="deal-contact-listbox"
                          role="listbox"
                          className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
                        >
                          {dealContactSearching ? (
                            <li className="px-3 py-1">
                              <LoadingSpinner label="Pesquisando..." size={24} />
                            </li>
                          ) : filteredDealContacts.length === 0 ? (
                            <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Nenhum contato encontrado.</li>
                          ) : filteredDealContacts.map((contact) => {
                            const isSelected = contact.id === dealContactId;
                            return (
                              <li
                                key={contact.id}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  setDealContactId(contact.id);
                                  setDealContactSearch(contact.nome);
                                  setIsDealContactOpen(false);
                                }}
                                className={`flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${isSelected ? "bg-slate-100 dark:bg-slate-700" : ""}`}
                              >
                                <span className="font-medium text-slate-900 dark:text-white">{contact.nome}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{contact.telefone}{contact.email ? ` · ${contact.email}` : ""}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                  {contacts.length === 0 && !contactsLoading && !contactsError && (
                    <p className="text-xs text-slate-500">Cadastre um contato antes de criar uma oportunidade.</p>
                  )}
                  {dealError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{dealError}</p>}
                </div>
              </Step>
              <Step title="Detalhes" description="Dados da oportunidade">
                <div className="space-y-4 py-2">
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
                    Valor estimado
                    <input
                      type="text"
                      value={dealValue}
                      onChange={(event) => setDealValue(event.target.value)}
                      placeholder="Ex: R$ 1.500,00"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                    />
                  </label>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Pipeline</label>
                    <CustomSelect
                      value={dealPipelineId}
                      options={[
                        { value: "novos", label: "Novos clientes" },
                        { value: "relacionamento", label: "Relacionamento" },
                      ]}
                      onChange={(val) => {
                        const pipelineId = val === "relacionamento" ? "relacionamento" : "novos";
                        setDealPipelineId(pipelineId as PipelineId);
                        setDealStageId(pipelinesConfig[pipelineId].stages[0].id);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Etapa</label>
                    <CustomSelect
                      value={dealStageId}
                      options={pipelinesConfig[dealPipelineId].stages.map((stage) => ({ value: stage.id, label: stageTitle(stage.id) }))}
                      onChange={(val) => {
                        const stage = pipelinesConfig[dealPipelineId].stages.find((item) => item.id === val);
                        if (stage) setDealStageId(stage.id);
                      }}
                    />
                  </div>
                </div>
              </Step>
              <Step title="Observações" description="Anotações e anexos">
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Adicionar observação</label>
                    <div className="flex gap-2">
                      <textarea
                        value={newObservationText}
                        onChange={(event) => setNewObservationText(event.target.value)}
                        placeholder="Escreva uma observação..."
                        rows={2}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] resize-none"
                      ></textarea>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newObservationText.trim()) return;
                          setNewObservations((prev) => [...prev, { id: generateId(), texto: newObservationText.trim(), autor: "Usuário", criadoEm: new Date().toISOString() }]);
                          setNewObservationText("");
                        }}
                        disabled={!newObservationText.trim()}
                        className="self-end rounded-lg bg-[#051647] px-3 py-2 text-xs font-bold text-white hover:bg-[#002187] disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                  {newObservations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Observações adicionadas ({newObservations.length})</p>
                      <div className="max-h-32 space-y-1.5 overflow-y-auto">
                        {newObservations.map((obs) => (
                          <div key={obs.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-[#002187] dark:text-[#C4D600]">{obs.autor}</span>
                              <button type="button" onClick={() => setNewObservations((prev) => prev.filter((o) => o.id !== obs.id))} className="text-slate-400 hover:text-red-500 cursor-pointer hover:cursor-pointer"><X className="h-3 w-3" /></button>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">{obs.texto}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Imagem (opcional)</label>
                    <input type="file" accept="image/*" ref={dealImageInputRef} className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 16 * 1024 * 1024) { toast.error("Imagem muito grande", "Máximo 16MB."); return; }
                      const reader = new FileReader();
                      reader.onload = () => setNewDealImage(reader.result as string);
                      reader.readAsDataURL(file);
                    }} />
                    {newDealImage ? (
                      <div className="relative inline-block">
                        <img src={newDealImage} alt="Preview" className="h-24 w-24 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
                        <button type="button" onClick={() => { setNewDealImage(null); if (dealImageInputRef.current) dealImageInputRef.current.value = ""; }} className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow cursor-pointer hover:cursor-pointer"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => dealImageInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-600 hover:border-[#002187] hover:text-[#002187] dark:border-slate-600 dark:text-slate-400 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer">
                        <Paperclip className="h-3.5 w-3.5" /> Anexar imagem
                      </button>
                    )}
                  </div>
                </div>
              </Step>
            </Stepper>
      )}

      {selectedCard && (
        <EntityDialog
          titleId="customer-details-title"
          title={selectedCard.cliente}
          description={selectedCard.tag}
          onClose={() => setSelectedCard(null)}
          size="lg"
        >
          <div className="flex h-full min-h-0 flex-col">
            {/* Fixed header with avatar and tag */}
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 pb-4 dark:border-slate-700">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#051647] text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                {selectedCard.iniciais}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{selectedCard.cliente}</h2>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedCard.tagColor}`}>{selectedCard.tag}</span>
              </div>
            </div>

            {/* Tab bar */}
            <div className="mt-3 flex shrink-0 gap-1 border-b border-slate-200 dark:border-slate-700">
              {([
                { key: "dados", label: "Dados" },
                { key: "compras", label: "Compras" },
                { key: "observacoes", label: "Observações" },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setDetailTab(tab.key)}
                  className={`relative px-4 py-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${
                    detailTab === tab.key
                      ? "text-[#002187] dark:text-[#C4D600]"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                  {detailTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C4D600] dark:bg-[#C4D600]" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content — scrollable area */}
            <div className="min-h-0 flex-1 overflow-y-auto py-4">
              {detailTab === "dados" && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <section>
                    <h3 className="mb-3 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Dados do cliente</h3>
                    <dl className="space-y-3 text-sm">
                      <InlineField label="Telefone" value={formatPhone(selectedCard.telefone)} onSave={(v) => updateSelectedCardField("telefone", v)} icon={<Phone className="h-3.5 w-3.5" />} />
                      <InlineField label="E-mail" value={selectedCard.email} onSave={(v) => updateSelectedCardField("email", v)} icon={<Mail className="h-3.5 w-3.5" />} />
                      <InlineField label="Data de nascimento" value={selectedCard.dataNascimento} onSave={(v) => updateSelectedCardField("dataNascimento", v)} icon={<CalendarDays className="h-3.5 w-3.5" />} />
                    </dl>
                  </section>
                  <section>
                    <h3 className="mb-3 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Negócio atual</h3>
                    <dl className="space-y-3 text-sm">
                      <InlineField label="Título" value={selectedCard.titulo} onSave={(v) => updateSelectedCardField("titulo", v)} />
                      <InlineField label="Valor" value={selectedCard.valor} onSave={(v) => updateSelectedCardField("valor", v)} />
                      <div>
                        <dt className="text-[10px] text-slate-500 dark:text-slate-400">Etapa</dt>
                        <dd className="font-medium text-slate-900 dark:text-white">{stageTitle(selectedCard.coluna)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-slate-500 dark:text-slate-400">Dias na etapa</dt>
                        <dd className="font-medium text-slate-900 dark:text-white">{selectedCard.diasNaEtapa}</dd>
                      </div>
                    </dl>
                  </section>
                </div>
              )}

              {detailTab === "compras" && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(() => {
                    const purchases = selectedCard.ultimasCompras.length > 0
                      ? selectedCard.ultimasCompras
                      : loadedPurchases && loadedPurchases.contactId === selectedCard.contactId ? loadedPurchases.items ?? [] : null;
                    if (purchases === null) {
                      return selectedCard.contactId
                        ? <LoadingSpinner label="Carregando compras..." size={32} className="py-3" />
                        : <p className="py-3 text-xs text-slate-500 dark:text-slate-400">Não há compras detalhadas registradas.</p>;
                    }
                    if (purchases.length === 0) {
                      return <p className="py-3 text-xs text-slate-500 dark:text-slate-400">Não há compras detalhadas registradas.</p>;
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
              )}

              {detailTab === "observacoes" && (
                <div className="space-y-4">
                  {selectedCard.imagem && (
                    <div className="mb-3">
                      <img src={selectedCard.imagem} alt="Anexo do card" className="max-h-40 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Nova observação</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Escreva uma observação..."
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = e.currentTarget.value.trim();
                            if (!val) return;
                            addObservationToCard(val);
                            e.currentTarget.value = "";
                          }
                        }}
                        onBlur={(e) => {
                          // no-op; Enter is the trigger
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          const val = input?.value.trim();
                          if (!val) return;
                          addObservationToCard(val);
                          input.value = "";
                        }}
                        className="rounded-lg bg-[#051647] px-3 py-2 text-xs font-bold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Histórico ({(selectedCard.observacoes ?? []).length})</p>
                    {(selectedCard.observacoes ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma observação registrada.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(selectedCard.observacoes ?? []).map((obs) => (
                          <div key={obs.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-[#002187] dark:text-[#C4D600]">{obs.autor}</span>
                              <span className="text-[9px] text-slate-400">{new Date(obs.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">{obs.texto}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}

function InlineField({ label, value, onSave, icon, type = "text" }: { label: string; value: string; onSave: (v: string) => void; icon?: React.ReactNode; type?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div onClick={() => { setDraft(value); setEditing(true); }} className="group flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">
        {icon && <span className="shrink-0 text-[#002187] dark:text-[#C4D600]">{icon}</span>}
        <div className="min-w-0">
          <dt className="text-[10px] text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="truncate font-medium text-slate-900 dark:text-white">{value || "—"}</dd>
        </div>
        </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {icon && <span className="shrink-0 text-[#002187] dark:text-[#C4D600]">{icon}</span>}
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] text-slate-500 dark:text-slate-400">{label}</dt>
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { onSave(draft); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          className="w-full rounded border border-[#002187] bg-white px-1.5 py-0.5 text-sm font-medium outline-none dark:border-[#C4D600] dark:bg-slate-800 dark:text-white"
        />
      </div>
    </div>
  );
}
