"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Check,
  CheckCircle2,
  Megaphone,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import Stepper, { Step } from "@/components/Stepper";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import Link from "next/link";
import { AudienceCounter, AudiencePreviewList, CriterionBuilder, useAudiencePreview } from "@/components/CriterionBuilder";
import { FormSelect } from "@/components/FormSelect";
import { SegmentSpreadsheetImport, segmentNameFromFile, type SpreadsheetImportResult, type SpreadsheetMergeSummary } from "@/components/SegmentSpreadsheetImport";
import { describeRule, validateRule, type RuleMatch, type SegmentRule } from "@/lib/segment-rules";
import { compareStoreNames, storeDisplayName } from "@/lib/stores";
import type { Contact, ContactCategory } from "@/lib/contacts";
import { useCrmData } from "@/hooks/useCrmData";

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

type SegmentStatus = "Ativo" | "Rascunho";
type SegmentFilter = "Todos" | SegmentStatus;
type AudienceMode = "criterios" | "contatos";
type ContactFilter = "Todos" | "Clientes" | "Leads" | "NPS" | "Inativos";
type CriterionKind = "geral" | "loja";
type ContactPickerView = "todos" | "selecionados";

interface SegmentCriterion {
  id: string;
  nome: string;
  tipo: CriterionKind;
  regras?: SegmentRule[];
  /** Como as regras se combinam: todas (E, padrão) ou qualquer uma (OU). */
  combinar?: RuleMatch;
  inativo?: boolean;
}

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

/** Converte nomes de critérios do segmento nas definições atuais (aceita nomes legados de loja); null se algum não existir mais. */
function resolveCriterionNames(names: string[], options: SegmentCriterion[]): SegmentCriterion[] | null {
  const resolved = names.map((name) => {
    const legacyName = name.replace(/^Loja:\s*/i, "Loja ");
    const option = options.find((candidate) => candidate.nome === name || candidate.nome === legacyName);
    if (option) return option;
    // Nome antigo "Loja <n>": a loja segue a mesma (id store-<n>), mesmo que hoje apareça pelo nome cadastrado.
    const deletedStore = /^Loja (\d+)$/i.exec(legacyName);
    if (!deletedStore) return undefined;
    return options.find((candidate) => candidate.id === `store-${deletedStore[1]}`) ?? { id: `store-${deletedStore[1]}`, nome: legacyName, tipo: "loja" as const };
  });
  return resolved.some((option) => !option) ? null : resolved as SegmentCriterion[];
}

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
const presetCriteria: SegmentCriterion[] = [
  { id: "criteria-30d", nome: "Comprou nos últimos 30 dias", tipo: "geral" },
  { id: "criteria-90d", nome: "Comprou nos últimos 90 dias", tipo: "geral" },
  { id: "criteria-180d", nome: "Comprou nos últimos 180 dias", tipo: "geral" },
  { id: "criteria-inactive-180d", nome: "Sem compra há mais de 180 dias", tipo: "geral" },
  { id: "criteria-no-nps", nome: "Ainda não respondeu ao NPS", tipo: "geral" },
  { id: "criteria-low-nps", nome: "Recebeu NPS abaixo de 7", tipo: "geral" },
  { id: "criteria-valid-phone", nome: "Telefone válido", tipo: "geral" },
];

const criterionKinds: CriterionKind[] = ["geral", "loja"];
/** Itens por página em cada grupo da lista de critérios salvos do modal de critérios. */
const MANAGER_PAGE_SIZE = 8;
const criterionKindLabels: Record<CriterionKind, string> = {
  geral: "Geral",
  loja: "Loja",
};
export default function SegmentosPage() {
  const { isDark } = useCrmTheme();
  const toast = useToast();
  const { data: segments, setData: setSegments, isLoading: segmentsLoading, error: segmentsError, reloadData: segmentsReload } = useCrmData<Segment[]>("segments", []);
  const { data: savedCriteriaOptions, setData: setSavedCriteriaOptions, error: criteriaDataError } = useCrmData<SegmentCriterion[]>("criteria", []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const { data: campaigns, error: campaignsError } = useCrmData<{ id: string; publico: string }[]>("campaigns", []);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState("");
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsTotalPages, setContactsTotalPages] = useState(1);
  const [contactsTotal, setContactsTotal] = useState(0);
  const CONTACTS_PAGE_SIZE = 50;
  const contactSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [stores, setStores] = useState<{ number: number; name?: string; active: boolean }[]>([]);
  const [audienceCounts, setAudienceCounts] = useState<Record<string, number>>({});
  const [refinedCounts, setRefinedCounts] = useState<Record<string, number>>({});
  const requestedAudienceKeysRef = useRef(new Set<string>());
  const [sortConfig, setSortConfig] = useState<{ field: string; order: "asc" | "desc" }>({ field: "nome", order: "asc" });
  const handleSort = (field: string) => {
    setSortConfig((prev) => {
      const nextOrder = prev.field === field && prev.order === "asc" ? "desc" : "asc";
      return { field, order: nextOrder };
    });
  };
  const SortIndicator = ({ field }: { field: string }) => {
    const isActive = sortConfig.field === field;
    if (!isActive) return <ChevronsUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />;
    return <ChevronUp className={`h-3 w-3 transition-transform ${sortConfig.order === "desc" ? "rotate-180" : ""} text-[#002187] dark:text-[#C4D600]`} />;
  };
  const sortedSegments = [...segments].sort((a, b) => {
    const dir = sortConfig.order === "asc" ? 1 : -1;
    switch (sortConfig.field) {
      case "nome":
        return dir * a.nome.localeCompare(b.nome, "pt-BR");
      case "pessoas":
        return dir * ((audienceCounts[a.id] ?? 0) - (audienceCounts[b.id] ?? 0));
      case "criterios":
        return dir * ((a.criterios?.length ?? 0) - (b.criterios?.length ?? 0));
      case "status":
        return dir * String(a.status ?? "").localeCompare(String(b.status ?? ""), "pt-BR");
      case "atualizado":
        return dir * new Date(a.atualizado ?? 0).getTime() - new Date(b.atualizado ?? 0).getTime();
      case "campanhas": {
        const aCamp = campaigns.filter((c) => c.publico === a.nome).length;
        const bCamp = campaigns.filter((c) => c.publico === b.nome).length;
        return dir * (aCamp - bCamp);
      }
      default:
        return 0;
    }
  });
  // Nome cadastrado da loja (já traz o código "LJ 12"); nomes antigos "Loja <n>" seguem resolvidos pelo id store-<n>.
  const storeCriteria: SegmentCriterion[] = stores
    .filter((store) => Number.isFinite(store.number))
    .map((store) => ({
      id: `store-${store.number}`,
      nome: storeDisplayName(store),
      tipo: "loja" as const,
      inativo: !store.active,
    }))
    .sort((a, b) => compareStoreNames(a.nome, b.nome));
  const isSystemCriterion = (criterion: SegmentCriterion) =>
    presetCriteria.some((preset) => preset.id === criterion.id) || criterion.id.startsWith("store-");
  const isStoreCriterion = (criterion: SegmentCriterion) => criterion.id.startsWith("store-");
  // Presets use their saved inactive flag; store criteria always mirror the store's active status.
  const criteriaOptions: SegmentCriterion[] = [
    ...presetCriteria.map((preset) => ({ ...preset, inativo: savedCriteriaOptions.find((saved) => saved.id === preset.id)?.inativo === true })),
    ...storeCriteria,
    ...savedCriteriaOptions.filter((saved) => !isSystemCriterion(saved)),
  ];
  const setCriteriaOptions = (options: SegmentCriterion[]) => setSavedCriteriaOptions(options);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<SegmentFilter>("Todos");
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [pendingDeleteSegment, setPendingDeleteSegment] = useState<Segment | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditingSegment, setIsEditingSegment] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "", criterios: "" });
  const [formError, setFormError] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("criterios");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
    const [contactFilter, setContactFilter] = useState<ContactFilter>("Todos");
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [isCriteriaMenuOpen, setIsCriteriaMenuOpen] = useState(false);
  const [criteriaSearchTerm, setCriteriaSearchTerm] = useState("");
  const [isCriteriaManagerOpen, setIsCriteriaManagerOpen] = useState(false);
  const [editingCriterionId, setEditingCriterionId] = useState<string | null>(null);
  const [criterionForm, setCriterionForm] = useState({ nome: "", tipo: "geral" as CriterionKind, regras: [] as SegmentRule[], combinar: "all" as RuleMatch });
  const audiencePreview = useAudiencePreview(criterionForm.regras, criterionForm.combinar);
  const [criteriaManagerError, setCriteriaManagerError] = useState("");
  const criteriaMenuRef = useRef<HTMLDivElement>(null);
  const criteriaTriggerRef = useRef<HTMLButtonElement>(null);
  const criteriaMenuPortalRef = useRef<HTMLDivElement>(null);
  const [criteriaMenuPosition, setCriteriaMenuPosition] = useState<CSSProperties>({});

  const [contactPickerView, setContactPickerView] = useState<ContactPickerView>("todos");
  const selectedContactIdsRef = useRef<string[]>([]);
  useEffect(() => { selectedContactIdsRef.current = selectedContactIds; }, [selectedContactIds]);
  const selectedContactIdSet = new Set(selectedContactIds);

  // Só a busca mais recente pode atualizar a lista: a anterior é cancelada e respostas atrasadas são ignoradas.
  const contactsRequestRef = useRef<{ seq: number; controller: AbortController | null }>({ seq: 0, controller: null });
  const loadContacts = async (page: number, search: string, view: ContactPickerView = contactPickerView) => {
    const tracker = contactsRequestRef.current;
    tracker.controller?.abort();
    const controller = new AbortController();
    const seq = ++tracker.seq;
    tracker.controller = controller;
    setContactsLoading(true);
    setContactsError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(CONTACTS_PAGE_SIZE), unique: "1" });
      if (search.trim()) params.set("q", search.trim());
      // "Selecionados": o servidor pagina e busca apenas dentro dos IDs marcados (funciona com milhares vindos de planilha).
      const response = view === "selecionados"
        ? await fetch("/api/contacts/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedContactIdsRef.current, q: search.trim(), page, limit: CONTACTS_PAGE_SIZE }),
          signal: controller.signal,
        })
        : await fetch(`/api/contacts/search?${params.toString()}`, { signal: controller.signal });
      const result = await response.json() as { data?: Contact[]; total?: number; totalPages?: number; error?: string };
      if (seq !== tracker.seq) return;
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os contatos.");
      setContacts(result.data ?? []);
      setContactsTotal(result.total ?? 0);
      setContactsTotalPages(Math.max(1, result.totalPages ?? 1));
      setContactsPage(page);
    } catch (error: unknown) {
      if (seq !== tracker.seq || controller.signal.aborted) return;
      setContactsError(error instanceof Error ? error.message : "Não foi possível carregar os contatos.");
    } finally {
      if (seq === tracker.seq) setContactsLoading(false);
    }
  };
  const loadContactsRef = useRef(loadContacts);
  useEffect(() => {
    loadContactsRef.current = loadContacts;
  });

  useEffect(() => {
    void loadContactsRef.current(1, "");
    const tracker = contactsRequestRef.current;
    return () => tracker.controller?.abort();
  }, []);

  useEffect(() => {
    if (!isContactPickerOpen) return;
    if (contactSearchDebounceRef.current) clearTimeout(contactSearchDebounceRef.current);
    // Mostra "carregando" já ao digitar, para não piscar a lista antiga ou o estado vazio durante a espera.
    setContactsLoading(true);
    contactSearchDebounceRef.current = setTimeout(() => {
      void loadContactsRef.current(1, contactSearchQuery, contactPickerView);
    }, 300);
    return () => {
      if (contactSearchDebounceRef.current) clearTimeout(contactSearchDebounceRef.current);
    };
  }, [contactSearchQuery, isContactPickerOpen, contactPickerView]);

  useEffect(() => {
    let active = true;
    fetch("/api/segments/audience")
      .then(async (response) => {
        const result = await response.json() as { data?: { number: number; active: boolean }[] };
        if (active && response.ok) setStores(result.data ?? []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);


  useEffect(() => {
    if (!selectedSegment && !isCreateOpen && !isCriteriaManagerOpen && !pendingDeleteSegment) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingDeleteSegment) {
          event.stopPropagation();
          setPendingDeleteSegment(null);
          return;
        }
        if (isCriteriaManagerOpen) {
          event.stopPropagation();
          setIsCriteriaManagerOpen(false);
          setEditingCriterionId(null);
          setCriteriaManagerError("");
          return;
        }
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
  }, [selectedSegment, isCreateOpen, isContactPickerOpen, isCriteriaManagerOpen, pendingDeleteSegment]);

  useEffect(() => {
    if (!isCriteriaMenuOpen) return;
    const updatePosition = () => {
      const trigger = criteriaTriggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const availableBelow = window.innerHeight - bounds.bottom - 12;
      const availableAbove = bounds.top - 12;
      const desiredHeight = Math.min(360, window.innerHeight - 24);
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

  const audienceKey = (criterionNames: string[]) => criterionNames.join("\n");
  const countByCriteria = (criterionNames: string[]) => audienceCounts[audienceKey(criterionNames)] ?? 0;
  const segmentMemberCount = (segment: Segment) => segment.modoPublico === "contatos"
    ? (segment.criterios?.length ? refinedCounts[segment.id] ?? segment.membros : segment.contatosSelecionados.length)
    : countByCriteria(segment.criterios);

  // Counts are computed by the server over the whole contact base, never from the paged contact list.
  const neededAudiences = [
    ...segments.filter((segment) => segment.modoPublico !== "contatos").map((segment) => segment.criterios),
    form.criterios.split("\n").map((criterion) => criterion.trim()).filter(Boolean),
  ].filter((names) => names.length > 0);
  const neededAudiencesSignature = JSON.stringify(neededAudiences);
  const criteriaOptionsSignature = JSON.stringify(criteriaOptions);
  useEffect(() => {
    const audiences = JSON.parse(neededAudiencesSignature) as string[][];
    const options = JSON.parse(criteriaOptionsSignature) as SegmentCriterion[];
    const groups: Record<string, SegmentCriterion[]> = {};
    for (const names of audiences) {
      const key = audienceKey(names);
      const resolved = names.map((name) => {
        const legacyName = name.replace(/^Loja:\s*/i, "Loja ");
        const option = options.find((candidate) => candidate.nome === name || candidate.nome === legacyName);
        if (option) return option;
        const deletedStore = /^Loja (\d+)$/i.exec(legacyName);
        return deletedStore
          ? { id: `store-${deletedStore[1]}`, nome: legacyName, tipo: "loja" as const }
          : undefined;
      });
      if (resolved.some((option) => !option)) continue;
      const signature = `${key}|${JSON.stringify(resolved)}`;
      if (requestedAudienceKeysRef.current.has(signature)) continue;
      requestedAudienceKeysRef.current.add(signature);
      groups[key] = resolved as SegmentCriterion[];
    }
    if (Object.keys(groups).length === 0) return;
    fetch("/api/segments/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    })
      .then(async (response) => {
        const result = await response.json() as { counts?: Record<string, number> };
        if (response.ok && result.counts) setAudienceCounts((current) => ({ ...current, ...result.counts }));
      })
      .catch(() => undefined);
  }, [neededAudiencesSignature, criteriaOptionsSignature]);

  // Interseção planilha × critérios: conta, no servidor, quantos contatos importados atendem aos critérios.
  const DRAFT_REFINE_KEY = "__draft__";
  const draftCriteria = form.criterios.split("\n").map((criterion) => criterion.trim()).filter(Boolean);
  const refineRequests = [
    ...segments
      .filter((segment) => segment.modoPublico === "contatos" && (segment.criterios?.length ?? 0) > 0)
      .map((segment) => ({ key: segment.id, ids: segment.contatosSelecionados, names: segment.criterios })),
    ...((isCreateOpen || isEditingSegment) && audienceMode === "contatos" && selectedContactIds.length > 0 && draftCriteria.length > 0
      ? [{ key: DRAFT_REFINE_KEY, ids: selectedContactIds, names: draftCriteria }]
      : []),
  ];
  const refineSignature = JSON.stringify(refineRequests);
  useEffect(() => {
    const requests = JSON.parse(refineSignature) as { key: string; ids: string[]; names: string[] }[];
    const options = JSON.parse(criteriaOptionsSignature) as SegmentCriterion[];
    const contactGroups: Record<string, string[]> = {};
    const contactCriteria: Record<string, SegmentCriterion[]> = {};
    for (const request of requests) {
      const resolved = resolveCriterionNames(request.names, options);
      if (!resolved) continue;
      contactGroups[request.key] = request.ids;
      contactCriteria[request.key] = resolved;
    }
    if (Object.keys(contactGroups).length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      // Some a contagem antiga da prévia enquanto a nova é calculada.
      setRefinedCounts((current) => {
        const next = { ...current };
        delete next[DRAFT_REFINE_KEY];
        return next;
      });
      fetch("/api/segments/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: {}, contactGroups, contactCriteria }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const result = await response.json() as { counts?: Record<string, number> };
          if (response.ok && result.counts) setRefinedCounts((current) => ({ ...current, ...result.counts }));
        })
        .catch(() => undefined);
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [refineSignature, criteriaOptionsSignature]);
  const draftRefinedCount = refinedCounts[DRAFT_REFINE_KEY];
  const draftMemberCount = audienceMode === "contatos" && draftCriteria.length > 0
    ? draftRefinedCount ?? selectedContactIds.length
    : selectedContactIds.length;

  const segmentCampaignCount = (segment: Segment) =>
    campaigns.filter((campaign) => campaign.publico.split(", ").includes(segment.nome)).length;

  const filteredSegments = sortedSegments.filter((segment) => {
    const selectedNames = contacts.filter((contact) => segment.contatosSelecionados.includes(contact.id)).map((contact) => contact.nome).join(" ");
    const matchesSearch = `${segment.nome} ${segment.descricao} ${segment.objetivo} ${segment.criterios.join(" ")} ${selectedNames}`.toLocaleLowerCase("pt-BR").includes(searchTerm.trim().toLocaleLowerCase("pt-BR"));
    return matchesSearch && (activeFilter === "Todos" || segment.status === activeFilter);
  });

  const activeCount = segments.filter((segment) => segment.status === "Ativo").length;
  const totalMembers = segments.reduce((total, segment) => total + segmentMemberCount(segment), 0);
  const connectedCampaigns = segments.reduce((total, segment) => total + segmentCampaignCount(segment), 0);
  const availableContacts = contacts.filter((contact) => {
    const matchesFilter = contactFilter === "Todos"
      || (contactFilter === "Clientes" && contact.compras > 0)
      || (contactFilter === "Leads" && contact.categoria === "lead")
      || (contactFilter === "NPS" && contact.categoria === "nps")
      || (contactFilter === "Inativos" && contact.categoria === "inativo");
    return matchesFilter;
  });
  const allVisibleContactsSelected = availableContacts.length > 0
    && availableContacts.every((contact) => selectedContactIdSet.has(contact.id));
  const selectedContactRecords = contacts.filter((contact) => selectedContactIds.includes(contact.id));
  const selectedCriteria = form.criterios.split("\n").map((criterion) => criterion.trim()).filter(Boolean);
  const normalizedCriteriaSearch = criteriaSearchTerm.trim().toLocaleLowerCase("pt-BR");
  const filteredCriteriaOptions = criteriaOptions.filter((criterion) =>
    (!criterion.inativo || selectedCriteria.includes(criterion.nome))
    && criterion.nome.toLocaleLowerCase("pt-BR").includes(normalizedCriteriaSearch));
  const toggleDraftCriterion = (name: string) => {
    setForm((current) => {
      const currentCriteria = current.criterios.split("\n").map((item) => item.trim()).filter(Boolean);
      return { ...current, criterios: (currentCriteria.includes(name) ? currentCriteria.filter((item) => item !== name) : [...currentCriteria, name]).join("\n") };
    });
    setFormError("");
  };
  // Refino da lista importada: critérios aplicados somente sobre os contatos da planilha.
  const refineBlock = (
    <div className="space-y-2.5 rounded-lg border border-[#002187]/15 bg-white p-3 dark:border-[#C4D600]/20 dark:bg-[#07194f]">
      {selectedContactIds.length > 0 && (
        <p className="rounded-md bg-[#002187]/5 px-2.5 py-1.5 text-[11px] text-[#051647] dark:bg-[#C4D600]/10 dark:text-[#C4D600]">
          📋 Filtrando sobre os <b>{selectedContactIds.length.toLocaleString("pt-BR")} contatos</b> importados da planilha
        </p>
      )}
      <div>
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Refinar com critérios <span className="font-normal text-slate-400">(opcional)</span></p>
        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Só entram os contatos da lista que atendem a todos os critérios. Sem critérios, a lista inteira é mantida.</p>
      </div>
      <select
        value=""
        onChange={(event) => { if (event.target.value) toggleDraftCriterion(event.target.value); }}
        aria-label="Adicionar critério de refino"
        className="h-9 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-[#C4D600]"
      >
        <option value="">Adicionar critério...</option>
        {criterionKinds.map((kind) => {
          const available = criteriaOptions.filter((criterion) => criterion.tipo === kind && !criterion.inativo && !selectedCriteria.includes(criterion.nome));
          return available.length === 0 ? null : (
            <optgroup key={kind} label={criterionKindLabels[kind]}>
              {available.map((criterion) => <option key={criterion.id} value={criterion.nome}>{criterion.nome}</option>)}
            </optgroup>
          );
        })}
      </select>
      {selectedCriteria.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selectedCriteria.map((criterion) => (
            <li key={criterion}>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#C4D600]/20 py-1 pl-2.5 pr-1.5 text-[10px] font-semibold text-[#051647] dark:text-[#C4D600]">
                <span className="truncate">{criterion}</span>
                <button type="button" onClick={() => toggleDraftCriterion(criterion)} aria-label={`Remover critério ${criterion}`} title="Remover critério" className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-[#C4D600]/30 cursor-pointer"><X className="h-3 w-3" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {selectedCriteria.length > 0 && selectedContactIds.length > 0 && (
        <p role="status" className="text-xs text-slate-700 dark:text-slate-200">
          🎯 {draftRefinedCount === undefined
            ? <span className="text-slate-400">Calculando quantos contatos atendem aos critérios...</span>
            : <><b>{draftRefinedCount.toLocaleString("pt-BR")} de {selectedContactIds.length.toLocaleString("pt-BR")} contatos</b> atendem aos critérios selecionados</>}
        </p>
      )}
      {(selectedCriteria.length > 0 || selectedContactIds.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {selectedCriteria.length > 0 && (
            <button type="button" onClick={() => { setForm((current) => ({ ...current, criterios: "" })); setFormError(""); }} className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer">
              Limpar critérios (manter planilha)
            </button>
          )}
          {selectedContactIds.length > 0 && (
            <button type="button" onClick={() => { setSelectedContactIds([]); if (selectedCriteria.length > 0) setAudienceMode("criterios"); setFormError(""); }} className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer">
              {selectedCriteria.length > 0 ? "Remover planilha (manter critérios)" : "Remover contatos da planilha"}
            </button>
          )}
        </div>
      )}
    </div>
  );
  const [managerSearch, setManagerSearch] = useState("");
  // Página atual de cada grupo da lista de critérios salvos (Geral / Loja) no modal de critérios.
  const [kindPages, setKindPages] = useState<Partial<Record<CriterionKind, number>>>({});
  const [collapsedKinds, setCollapsedKinds] = useState<CriterionKind[]>(criterionKinds);
  const highlightMatch = (text: string, term: string) => {
    const query = term.trim();
    if (!query) return text;
    const index = text.toLocaleLowerCase("pt-BR").indexOf(query.toLocaleLowerCase("pt-BR"));
    if (index < 0) return text;
    return (
      <>
        {text.slice(0, index)}
        <mark className="rounded bg-[#C4D600]/60 px-0.5 text-[#051647] dark:bg-[#C4D600] dark:text-[#051647]">{text.slice(index, index + query.length)}</mark>
        {text.slice(index + query.length)}
      </>
    );
  };
  const normalizedManagerSearch = managerSearch.trim().toLocaleLowerCase("pt-BR");
  const managerCriteria = criteriaOptions.filter((criterion) =>
    criterion.nome.toLocaleLowerCase("pt-BR").includes(normalizedManagerSearch));

  const saveCriteriaOptions = (nextCriteria: SegmentCriterion[]) => {
    setCriteriaOptions(nextCriteria);
    setCriteriaManagerError("");
    return true;
  };

  const toggleCriterionActive = (criterion: SegmentCriterion) => {
    const inativo = !criterion.inativo;
    const exists = savedCriteriaOptions.some((saved) => saved.id === criterion.id);
    saveCriteriaOptions(exists
      ? savedCriteriaOptions.map((saved) => saved.id === criterion.id ? { ...saved, inativo } : saved)
      : [...savedCriteriaOptions, { id: criterion.id, nome: criterion.nome, tipo: criterion.tipo, inativo }]);
    toast.success(inativo ? "Critério inativado" : "Critério ativado", `"${criterion.nome}" foi atualizado.`);
  };

  const resetCriterionForm = () => {
    setCriterionForm({ nome: "", tipo: "geral", regras: [], combinar: "all" });
    setEditingCriterionId(null);
    setCriteriaManagerError("");
  };

  const submitCriterion = () => {
    const nome = criterionForm.nome.trim();
    if (!nome) {
      setCriteriaManagerError("Informe o nome do critério.");
      return;
    }
    if (criteriaOptions.some((criterion) =>
      criterion.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR")
      && criterion.id !== editingCriterionId)) {
      setCriteriaManagerError("Já existe um critério com esse nome.");
      return;
    }
    if (criterionForm.regras.length === 0) {
      setCriteriaManagerError("Adicione ao menos uma regra para definir quem atende ao critério.");
      return;
    }
    const ruleError = criterionForm.regras.map(validateRule).find(Boolean);
    if (ruleError) {
      setCriteriaManagerError(ruleError);
      return;
    }
    const regras = criterionForm.regras.map((rule) => ({
      campo: rule.campo,
      operador: rule.operador,
      ...(rule.valor !== undefined && rule.valor !== "" ? { valor: rule.valor.trim() } : {}),
      ...(rule.valor2 ? { valor2: rule.valor2.trim() } : {}),
      ...(rule.filtros ? { filtros: rule.filtros } : {}),
    }));
    // OU só faz sentido com 2+ regras; com uma só, grava o padrão (E).
    const combinar: RuleMatch | undefined = regras.length > 1 && criterionForm.combinar === "any" ? "any" : undefined;

    if (editingCriterionId) {
      const existingCriterion = criteriaOptions.find((criterion) => criterion.id === editingCriterionId);
      if (!existingCriterion || isSystemCriterion(existingCriterion)) {
        setCriteriaManagerError("Critérios padrão do sistema não podem ser editados, apenas inativados.");
        return;
      }
      const updatedCriteria = savedCriteriaOptions.map((criterion) => criterion.id === editingCriterionId
        ? { ...criterion, nome, tipo: criterionForm.tipo, regras, combinar }
        : criterion);
      if (!saveCriteriaOptions(updatedCriteria)) return;
      toast.success("Critério atualizado", `"${nome}" foi salvo.`);
      if (existingCriterion.nome !== nome) {
        setSegments((current) => current.map((segment) => ({
          ...segment,
          criterios: segment.criterios.map((criterion) => criterion === existingCriterion.nome ? nome : criterion),
        })));
        setForm((current) => ({
          ...current,
          criterios: current.criterios.split("\n").map((criterion) => criterion.trim() === existingCriterion.nome ? nome : criterion).join("\n"),
        }));
        setSelectedSegment((current) => current ? {
          ...current,
          criterios: current.criterios.map((criterion) => criterion === existingCriterion.nome ? nome : criterion),
        } : current);
      }
    } else {
      const newCriterion: SegmentCriterion = {
        id: `criterion-${generateId()}`,
        nome,
        tipo: criterionForm.tipo,
        regras,
        ...(combinar ? { combinar } : {}),
      };
      if (!saveCriteriaOptions([...savedCriteriaOptions, newCriterion])) return;
      toast.success("Critério adicionado", `"${nome}" foi criado.`);
    }
    resetCriterionForm();
  };

  const deleteCriterion = (criterion: SegmentCriterion) => {
    if (isSystemCriterion(criterion)) return;
    if (!saveCriteriaOptions(savedCriteriaOptions.filter((item) => item.id !== criterion.id))) return;
    toast.success("Critério excluído", `"${criterion.nome}" foi removido.`);
    resetCriterionForm();
  };

  const metrics = [
    { label: "Segmentos", value: segments.length.toString(), detail: "na biblioteca", icon: Tags, color: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Ativos", value: activeCount.toString(), detail: "status dos segmentos", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    { label: "Contatos vinculados", value: totalMembers.toLocaleString("pt-BR"), detail: "soma dos públicos (pode haver repetição)", icon: Users, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
    { label: "Campanhas vinculadas", value: connectedCampaigns.toString(), detail: "associação pelo público salvo", icon: Target, color: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]" },
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

  /** Soma a planilha aos contatos já escolhidos (união sem repetidos); nunca substitui a lista anterior. */
  const handleSpreadsheetImport = (result: SpreadsheetImportResult): SpreadsheetMergeSummary => {
    const existing = new Set(selectedContactIds);
    const added = result.contactIds.filter((id) => !existing.has(id));
    const merged = Array.from(new Set([...selectedContactIds, ...added]));
    const summary = { added: added.length, alreadyIn: result.contactIds.length - added.length, total: merged.length };
    setAudienceMode("contatos");
    setSelectedContactIds((current) => Array.from(new Set([...current, ...result.contactIds])));
    // Nome e descrição só são preenchidos pelo arquivo quando ainda estão vazios.
    setForm((current) => ({
      ...current,
      nome: current.nome.trim() ? current.nome : segmentNameFromFile(result.fileName),
      descricao: current.descricao.trim() ? current.descricao : `Importado da planilha ${result.fileName}`,
    }));
    setFormError("");
    const format = (value: number) => value.toLocaleString("pt-BR");
    toast.success(
      "Planilha importada",
      `${format(summary.added)} contatos novos adicionados ao segmento | ${format(summary.alreadyIn)} já estavam na lista (duplicados ignorados) | ${format(result.notFound)} não encontrados na base do CRM | Total acumulado: ${format(summary.total)} contatos.`,
    );
    return summary;
  };

  const createSegment = () => {
    const criterios = form.criterios.split("\n").map((criterion) => criterion.trim()).filter(Boolean);
    const segment: Segment = {
      id: `seg-${generateId()}`,
      nome: form.nome.trim(),
      descricao: form.descricao.trim(),
      status: "Rascunho",
      membros: audienceMode === "contatos" ? draftMemberCount : countByCriteria(criterios),
      atualizado: "Criado agora",
      // No modo planilha, os critérios refinam a lista importada (interseção).
      criterios,
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
    setContactSearchQuery("");
    setContactFilter("Todos");
    setIsContactPickerOpen(false);
    setIsCreateOpen(false);
    toast.success("Segmento criado", segment.modoPublico === "contatos" ? `"${segment.nome}" foi adicionado com ${segment.membros.toLocaleString("pt-BR")} contatos vinculados.` : `"${segment.nome}" foi adicionado.`);
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
        ? draftMemberCount
        : countByCriteria(criterios),
      atualizado: "Atualizado agora",
      // No modo planilha, os critérios refinam a lista importada (interseção).
      criterios,
      modoPublico: audienceMode,
      contatosSelecionados: audienceMode === "contatos" ? [...selectedContactIds] : [],
    };
    setSegments((current) => current.map((segment) => segment.id === updatedSegment.id ? updatedSegment : segment));
    setSelectedSegment(updatedSegment);
    setIsEditingSegment(false);
    setFormError("");
    setIsCriteriaMenuOpen(false);
    setIsContactPickerOpen(false);
    toast.success("Segmento atualizado", updatedSegment.modoPublico === "contatos" ? `"${updatedSegment.nome}" foi salvo com ${updatedSegment.membros.toLocaleString("pt-BR")} contatos vinculados.` : `"${updatedSegment.nome}" foi salvo.`);
  };

  const deleteSegment = (segment: Segment) => {
    setSegments((current) => current.filter((item) => item.id !== segment.id));
    toast.success("Segmento excluído", `"${segment.nome}" foi removido.`);
    if (selectedSegment?.id === segment.id) {
      setSelectedSegment(null);
      setIsEditingSegment(false);
      setIsContactPickerOpen(false);
    }
  };

  const closeSegmentModals = () => {
    setSelectedSegment(null);
    setIsCreateOpen(false);
    setIsEditingSegment(false);
    setIsContactPickerOpen(false);
    setIsCriteriaManagerOpen(false);
    setIsCriteriaMenuOpen(false);
    setPendingDeleteSegment(null);
  };

  const closeOverlay = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeSegmentModals();
  };

  if (segmentsLoading) {
    return <LoadingSpinner fullScreen label="Carregando segmentos..." size={96} />;
  }

  return (
    <div>
      <div>

        <main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">
          {(segmentsError || criteriaDataError || contactsError || campaignsError) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{segmentsError || criteriaDataError || contactsError || campaignsError}</p>}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Segmentos</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Organize públicos por comportamento, compra e relacionamento.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void segmentsReload()} disabled={segmentsLoading} aria-label="Atualizar lista" title="Atualizar lista" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${segmentsLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <button type="button" onClick={() => { resetCriterionForm(); setCollapsedKinds(criterionKinds); setIsCriteriaManagerOpen(true); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer">
                <Tags className="h-4 w-4" />
                Gerenciar critérios
              </button>
              <button type="button" onClick={() => setIsCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#051647] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer">
                <Plus className="h-4 w-4" />
                Criar segmento
              </button>
            </div>
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

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <label className="relative block w-full sm:w-72 md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} aria-label="Buscar segmentos" placeholder="Buscar segmento ou critério" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
            </label>
            <div role="tablist" aria-label="Filtrar segmentos" className="flex flex-wrap gap-1.5">
              {filters.map((filter) => {
                const count = filter === "Todos" ? segments.length : segments.filter((segment) => segment.status === filter).length;
                return (
                  <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} onClick={() => setActiveFilter(filter)} className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${activeFilter === filter ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"}`}>
                    {filter}<span className={`text-[10px] ${activeFilter === filter ? "opacity-75" : "text-slate-400"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Biblioteca de segmentos</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filteredSegments.length} de {segments.length} segmentos</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800/40">
                  <tr>
                    <th className="px-5 py-3"><button type="button" onClick={() => handleSort("nome")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Segmento<SortIndicator field="nome" /></button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => handleSort("pessoas")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Pessoas<SortIndicator field="pessoas" /></button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => handleSort("criterios")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Critérios<SortIndicator field="criterios" /></button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => handleSort("status")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Status<SortIndicator field="status" /></button></th>
                    <th className="px-5 py-3"><button type="button" onClick={() => handleSort("atualizado")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Atualizado<SortIndicator field="atualizado" /></button></th>
                    <th className="px-4 py-3 text-right"><button type="button" onClick={() => handleSort("campanhas")} className="ml-auto inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Campanhas<SortIndicator field="campanhas" /></button></th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {segmentsLoading && (
                    <tr><td colSpan={7} className="px-5 py-8">
                      <LoadingSpinner label="Carregando segmentos..." className="w-full justify-center" />
                    </td></tr>
                  )}
                  {!segmentsLoading && filteredSegments.map((segment) => (
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
                      <td className="px-5 py-2 xl:py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><Tags className="h-4 w-4" /></span>
                          <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-900 group-hover:text-[#002187] dark:text-white dark:group-hover:text-[#C4D600]">{segment.nome}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{segment.descricao}</span></span>
                        </div>
                      </td>
                      <td className="px-4 py-2 xl:py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{segmentMemberCount(segment).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2 xl:py-3.5"><span className="inline-flex max-w-56 items-center gap-1.5 truncate text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />{segment.modoPublico === "contatos" ? `${segment.contatosSelecionados.length} contatos selecionados${segment.criterios?.length ? ` · refinado por ${segment.criterios.length} critério${segment.criterios.length === 1 ? "" : "s"}` : ""}` : segment.criterios[0] || "Sem critérios"}</span><span className="ml-1 text-[10px] text-slate-400">{segment.modoPublico === "criterios" && segment.criterios.length > 1 ? `+${segment.criterios.length - 1}` : ""}</span></td>
                      <td className="px-4 py-2 xl:py-3.5"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[segment.status]}`}>{segment.status}</span></td>
                      <td className="px-5 py-2 xl:py-3.5 text-xs text-slate-500 dark:text-slate-400">{segment.atualizado}</td>
                      <td className="px-4 py-2 xl:py-3.5 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">{segmentCampaignCount(segment)}</td>
                      <td className="px-4 py-2 xl:py-3.5 text-right whitespace-nowrap">
                        <Link
                          href={`/campanhas/nova?segmentoId=${encodeURIComponent(segment.id)}`}
                          aria-label={`Criar campanha com o segmento ${segment.nome}`}
                          title="Criar campanha com este segmento"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#002187] transition-colors hover:bg-[#002187]/5 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer"
                        >
                          <Megaphone className="h-3.5 w-3.5" />
                          <span className="sr-only sm:not-sr-only">Criar campanha</span>
                        </Link>
                        <button
                          type="button"
                          aria-label={`Excluir segmento ${segment.nome}`}
                          title="Excluir segmento"
                          onClick={(event) => { event.stopPropagation(); setPendingDeleteSegment(segment); }}
                          onKeyDown={(event) => event.stopPropagation()}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer hover:cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only sm:not-sr-only">Excluir</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!segmentsLoading && filteredSegments.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center"><Search className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum segmento encontrado</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente mudar a busca ou o filtro.</p></td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 dark:border-slate-800"><span>Mostrando {filteredSegments.length} de {segments.length} segmentos salvos</span><span>Banco de dados</span></footer>
          </section>
        </main>
      </div>

      {(selectedSegment || isCreateOpen) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#051647]/55 p-4 backdrop-blur-sm" onMouseDown={closeOverlay}>
          <section role="dialog" aria-modal="true" aria-labelledby="segment-dialog-title" className={`w-full ${isCreateOpen || isEditingSegment ? "max-w-xl flex h-[min(640px,90vh)] max-h-[90vh] flex-col overflow-hidden" : "max-w-lg"} rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#07194f] sm:p-6`}>
            <div className={`flex items-start justify-between gap-4 ${isCreateOpen || isEditingSegment ? "mb-5 shrink-0" : "mb-5"}`}>
              <div><h2 id="segment-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">{isCreateOpen ? "Criar segmento" : selectedSegment?.nome}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{isCreateOpen ? "Defina um público para usar nas campanhas." : isEditingSegment ? "Atualize os dados e o público deste segmento." : "Critérios e campanhas vinculadas a este público."}</p></div>
              <button type="button" onClick={closeSegmentModals} aria-label="Fechar" title="Fechar" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"><X className="h-4 w-4" /></button>
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
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Como definir o público?</h3>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Combine regras de compra, NPS, telefone e loja ou selecione contatos da base.</p>
                        </div>
                        <button type="button" onClick={() => { resetCriterionForm(); setCollapsedKinds(criterionKinds); setIsCriteriaManagerOpen(true); }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 transition-colors hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer hover:cursor-pointer">
                          <Tags className="h-3 w-3" />Gerenciar critérios
                        </button>
                      </div>
                      <div role="group" aria-label="Origem do público" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80">
                        <button type="button" aria-pressed={audienceMode === "criterios"} onClick={() => { setAudienceMode("criterios"); setFormError(""); setIsCriteriaMenuOpen(false); }} className={`h-8 rounded-md px-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${audienceMode === "criterios" ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>Usar critérios</button>
                        <button type="button" aria-pressed={audienceMode === "contatos"} onClick={() => { setAudienceMode("contatos"); setFormError(""); setIsCriteriaMenuOpen(false); }} className={`h-8 rounded-md px-2 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${audienceMode === "contatos" ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>Escolher contatos</button>
                      </div>
                      {audienceMode === "criterios" ? (
                        <div className="space-y-2.5">
                          <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                            A contagem usa os campos reais disponíveis: compras, respostas NPS, telefone e loja. Critérios personalizados sem campo correspondente não entram na contagem.
                          </p>
                          <div ref={criteriaMenuRef} className="relative space-y-1.5">
                            <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Critérios do público <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span>
                            <button
                              ref={criteriaTriggerRef}
                              type="button"
                              onClick={() => {
                                if (!isCriteriaMenuOpen) setCriteriaSearchTerm("");
                                setIsCriteriaMenuOpen((open) => !open);
                              }}
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
                                <label className="sticky top-0 z-10 block bg-white p-1 dark:bg-[#07194f]">
                                  <span className="sr-only">Buscar critérios</span>
                                  <span className="relative block">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                      type="search"
                                      autoFocus
                                      value={criteriaSearchTerm}
                                      onChange={(event) => setCriteriaSearchTerm(event.target.value)}
                                      aria-label="Buscar critérios"
                                      placeholder="Buscar critério..."
                                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                                    />
                                  </span>
                                </label>
                                {criterionKinds.map((kind) => {
                                  const groupedCriteria = filteredCriteriaOptions.filter((criterion) => criterion.tipo === kind);
                                  if (groupedCriteria.length === 0) return null;
                                  return (
                                    <div key={kind}>
                                      <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">{criterionKindLabels[kind]}</p>
                                      {groupedCriteria.map((criterion) => {
                                        const isSelected = selectedCriteria.includes(criterion.nome);
                                        return (
                                          <button
                                            key={criterion.id}
                                            type="button"
                                            role="menuitemcheckbox"
                                            aria-checked={isSelected}
                                            onClick={() => {
                                              setForm((current) => {
                                                const currentCriteria = current.criterios.split("\n").map((item) => item.trim()).filter(Boolean);
                                                return {
                                                  ...current,
                                                  criterios: (isSelected
                                                    ? currentCriteria.filter((item) => item !== criterion.nome)
                                                    : [...currentCriteria, criterion.nome]).join("\n"),
                                                };
                                              });
                                              setFormError("");
                                              setIsCriteriaMenuOpen(false);
                                            }}
                                            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
                                          >
                                            <span>{criterion.nome}</span>
                                            {isSelected && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                                {filteredCriteriaOptions.length === 0 && (
                                  <p className="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum critério encontrado.</p>
                                )}
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
                                setContactSearchQuery("");
                                setContactFilter("Todos");
                                setContactPickerView("todos");
                                setIsContactPickerOpen(true);
                              }}
                              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
                            >
                              <Users className="h-3.5 w-3.5" />
                              {selectedContactIds.length ? "Gerenciar contatos" : "Selecionar contatos"}
                            </button>
                          </div>
                          <SegmentSpreadsheetImport onImported={handleSpreadsheetImport} />
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
                          {refineBlock}
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
                        <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Público</dt><dd className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{audienceMode === "criterios" ? "Definido por critérios" : selectedCriteria.length > 0 ? `${draftMemberCount.toLocaleString("pt-BR")} de ${selectedContactIds.length.toLocaleString("pt-BR")} contatos da planilha (refinado por ${selectedCriteria.join(", ")})` : `${selectedContactIds.length} contatos selecionados`}</dd></div>
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
                      className="min-h-20 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
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
                            onClick={() => {
                              if (!isCriteriaMenuOpen) setCriteriaSearchTerm("");
                              setIsCriteriaMenuOpen((open) => !open);
                            }}
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
                              <label className="sticky top-0 z-10 block bg-white p-1 dark:bg-[#07194f]">
                                <span className="sr-only">Buscar critérios</span>
                                <span className="relative block">
                                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                  <input
                                    type="search"
                                    autoFocus
                                    value={criteriaSearchTerm}
                                    onChange={(event) => setCriteriaSearchTerm(event.target.value)}
                                    aria-label="Buscar critérios"
                                    placeholder="Buscar critério..."
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                                  />
                                </span>
                              </label>
                              {criterionKinds.map((kind) => {
                                const groupedCriteria = filteredCriteriaOptions.filter((criterion) => criterion.tipo === kind);
                                if (groupedCriteria.length === 0) return null;
                                return (
                                  <div key={kind}>
                                    <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">{criterionKindLabels[kind]}</p>
                                    {groupedCriteria.map((criterion) => {
                                      const isSelected = selectedCriteria.includes(criterion.nome);
                                      return (
                                        <button
                                          key={criterion.id}
                                          type="button"
                                          role="menuitemcheckbox"
                                          aria-checked={isSelected}
                                          onClick={() => {
                                            setForm((current) => {
                                              const currentCriteria = current.criterios.split("\n").map((item) => item.trim()).filter(Boolean);
                                              return {
                                                ...current,
                                                criterios: (isSelected
                                                  ? currentCriteria.filter((item) => item !== criterion.nome)
                                                  : [...currentCriteria, criterion.nome]).join("\n"),
                                              };
                                            });
                                            setFormError("");
                                            setIsCriteriaMenuOpen(false);
                                          }}
                                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-[#C4D600]/20 hover:text-[#051647] dark:text-slate-200 dark:hover:bg-[#C4D600]/15 dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer"
                                        >
                                          <span>{criterion.nome}</span>
                                          {isSelected && <Check className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                              {filteredCriteriaOptions.length === 0 && (
                                <p className="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum critério encontrado.</p>
                              )}
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
                            onClick={() => { setContactSearchQuery(""); setContactFilter("Todos"); setContactPickerView("todos"); setIsContactPickerOpen(true); }}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
                          >
                            <Users className="h-3.5 w-3.5" />
                            {selectedContactIds.length ? "Gerenciar contatos" : "Selecionar contatos"}
                          </button>
                        </div>
                        <SegmentSpreadsheetImport onImported={handleSpreadsheetImport} />
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
                        {refineBlock}
                      </div>
                    )}
                    {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                  </div>
                </div>
                <footer className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteSegment(selectedSegment)}
                    className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer hover:cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />Excluir segmento
                  </button>
                  <button type="button" onClick={closeSegmentModals} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
                  {selectedSegment && (
                    <Link href={`/campanhas/nova?segmentoId=${encodeURIComponent(selectedSegment.id)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#002187]/30 px-3 text-xs font-semibold text-[#002187] transition-colors hover:bg-[#002187]/5 dark:border-[#C4D600]/40 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer">
                      <Megaphone className="h-3.5 w-3.5" />Criar campanha
                    </Link>
                  )}
                  <button type="button" onClick={saveSegmentChanges} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer">
                    <Check className="h-3.5 w-3.5" />Salvar alterações
                  </button>
                </footer>
              </div>
            ) : selectedSegment && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[selectedSegment.status]}`}>{selectedSegment.status}</span><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><Users className="h-3.5 w-3.5" />{segmentMemberCount(selectedSegment).toLocaleString("pt-BR")} pessoas</span></div>
                <div className="mt-5"><h3 className="text-[10px] font-bold uppercase text-slate-400">Descrição</h3><p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{selectedSegment.descricao}</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{selectedSegment.objetivo}</p></div>
                {selectedSegment.modoPublico === "criterios" ? (
                  <section className="mt-5"><h3 className="text-[10px] font-bold uppercase text-slate-400">Critérios do público</h3><ul className="mt-2 space-y-2">{selectedSegment.criterios.map((criterion) => <li key={criterion} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />{criterion}</li>)}</ul></section>
                ) : (
                  <>
                  {selectedSegment.criterios?.length > 0 && (
                    <section className="mt-5">
                      <h3 className="text-[10px] font-bold uppercase text-slate-400">Refinado pelos critérios</h3>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">🎯 {(refinedCounts[selectedSegment.id] ?? selectedSegment.membros).toLocaleString("pt-BR")} de {selectedSegment.contatosSelecionados.length.toLocaleString("pt-BR")} contatos da planilha atendem aos critérios.</p>
                      <ul className="mt-2 space-y-1">{selectedSegment.criterios.map((criterion) => <li key={criterion} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />{criterion}</li>)}</ul>
                    </section>
                  )}
                  <section className="mt-5"><h3 className="text-[10px] font-bold uppercase text-slate-400">Contatos selecionados</h3><ul className="mt-2 space-y-2">{contacts.filter((contact) => selectedSegment.contatosSelecionados.includes(contact.id)).map((contact) => <li key={contact.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#C4D600]/20 text-[9px] font-bold text-[#051647] dark:text-[#C4D600]">{contact.iniciais}</span><span>{contact.nome}</span></li>)}</ul></section>
                  </>
                )}
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs dark:border-slate-800"><span className="text-slate-500 dark:text-slate-400">Campanhas vinculadas</span><span className="font-semibold text-slate-900 dark:text-white">{segmentCampaignCount(selectedSegment)}</span></div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="tablist" aria-label="Visão da lista de contatos" className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80">
                  {([
                    { id: "todos", label: "Todos os contatos" },
                    { id: "selecionados", label: `Selecionados (${selectedContactIds.length.toLocaleString("pt-BR")})` },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={contactPickerView === tab.id}
                      onClick={() => { if (contactPickerView !== tab.id) { setContactPickerView(tab.id); setContactFilter("Todos"); } }}
                      className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer ${contactPickerView === tab.id ? "bg-white text-[#051647] shadow-xs dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {contactPickerView === "selecionados" && selectedContactIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Desmarcar todos os ${selectedContactIds.length.toLocaleString("pt-BR")} contatos selecionados?`)) return;
                      setSelectedContactIds([]);
                      selectedContactIdsRef.current = [];
                      setFormError("");
                      void loadContacts(1, contactSearchQuery, "selecionados");
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />Limpar seleção
                  </button>
                )}
              </div>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {contactPickerView === "selecionados"
                    ? `Exibindo ${availableContacts.length} de ${contactsTotal.toLocaleString("pt-BR")} selecionados${contactSearchQuery.trim() ? " que casam com a busca" : ""} · Página ${contactsPage} de ${contactsTotalPages}`
                    : `Exibindo ${availableContacts.length} de ${contactsTotal} contatos · Página ${contactsPage} de ${contactsTotalPages}`}
                </p>
                <label className="relative block w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    autoFocus
                    value={contactSearchQuery}
                    onChange={(event) => setContactSearchQuery(event.target.value)}
                    aria-label="Buscar contatos"
                    placeholder={contactPickerView === "selecionados" ? "Buscar entre os selecionados" : "Buscar por nome, telefone ou e-mail"}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:focus:border-[#C4D600]"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="tablist" aria-label="Filtrar contatos por categoria" className="flex flex-wrap gap-1.5">
                  {contactFilters.map((filter) => {
                    const count = filter === "Todos" ? contacts.length
                      : filter === "Clientes" ? contacts.filter((contact) => contact.compras > 0).length
                      : filter === "Leads" ? contacts.filter((contact) => contact.categoria === "lead").length
                      : filter === "NPS" ? contacts.filter((contact) => contact.categoria === "nps").length
                      : contacts.filter((contact) => contact.categoria === "inativo").length;
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
              {contactsLoading ? (
                <li className="grid min-h-48 place-items-center px-5">
                  <LoadingSpinner label="Carregando contatos..." className="w-full justify-center" />
                </li>
              ) : availableContacts.length > 0 ? availableContacts.map((contact) => {
                const isSelected = selectedContactIdSet.has(contact.id);
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
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{contactPickerView === "selecionados" && selectedContactIds.length === 0 ? "Nenhum contato selecionado" : "Nenhum contato encontrado"}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{contactPickerView === "selecionados" && selectedContactIds.length === 0 ? "Marque contatos na aba Todos os contatos ou importe uma planilha." : "Tente mudar a busca ou o filtro."}</p>
                  </div>
                </li>
              )}
            </ul>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {selectedContactIds.length} {selectedContactIds.length === 1 ? "contato selecionado" : "contatos selecionados"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={contactsPage <= 1 || contactsLoading}
                  onClick={() => void loadContacts(contactsPage - 1, contactSearchQuery)}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
                >
                  Anterior
                </button>
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {contactsPage}/{contactsTotalPages}
                </span>
                <button
                  type="button"
                  disabled={contactsPage >= contactsTotalPages || contactsLoading}
                  onClick={() => void loadContacts(contactsPage + 1, contactSearchQuery)}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
                >
                  Próxima
                </button>
                <button
                  type="button"
                  onClick={() => setIsContactPickerOpen(false)}
                  className="inline-flex h-9 items-center rounded-lg bg-[#051647] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
                >
                  Concluir seleção
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
      {isCriteriaManagerOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#051647]/65 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsCriteriaManagerOpen(false);
              resetCriterionForm();
            }
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="criteria-manager-title" className="flex h-[min(860px,92vh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f9fc] shadow-2xl dark:border-slate-700 dark:bg-[#051647]">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-[#07194f] sm:px-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#002187] dark:text-[#C4D600]">Segmentação</p>
                <h2 id="criteria-manager-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{editingCriterionId ? "Editar critério" : "Novo critério de segmentação"}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ligue os filtros que definem o público. O contato entra quando atende a todos eles.</p>
                {(isCreateOpen || isEditingSegment) && audienceMode === "contatos" && selectedContactIds.length > 0 && (
                  <p className="mt-2 inline-flex rounded-lg bg-[#C4D600]/20 px-3 py-1.5 text-xs text-[#051647] dark:text-[#C4D600]">
                    📋 Filtrando sobre os&nbsp;<b>{selectedContactIds.length.toLocaleString("pt-BR")} contatos</b>&nbsp;importados da planilha
                    {selectedCriteria.length > 0 && draftRefinedCount !== undefined && <> · 🎯&nbsp;<b>{draftRefinedCount.toLocaleString("pt-BR")} de {selectedContactIds.length.toLocaleString("pt-BR")}</b>&nbsp;atendem aos critérios</>}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => { setIsCriteriaManagerOpen(false); setManagerSearch(""); resetCriterionForm(); }} aria-label="Fechar critérios de segmentação" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
            </header>
            {/* Altura fixa: só o corpo rola, então trocar de filtro não mexe no tamanho do modal nem nos botões do rodapé. */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 py-6 sm:px-8">
             <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div id="criterion-form" className="space-y-5">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07194f] sm:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nome do critério <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span>
                    <input
                      autoFocus
                      value={criterionForm.nome}
                      onChange={(event) => { setCriterionForm((current) => ({ ...current, nome: event.target.value })); setCriteriaManagerError(""); }}
                      placeholder="Ex.: Clientes VIP de Goiânia"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/10 dark:border-slate-700 dark:bg-[#051647] dark:text-slate-100 dark:focus:border-[#C4D600]"
                    />
                  </label>
                  <div className="block">
                    <FormSelect
                      label="Categoria"
                      value={criterionKindLabels[criterionForm.tipo]}
                      options={criterionKinds.map((kind) => criterionKindLabels[kind])}
                      onChange={(label) => {
                        const tipo = criterionKinds.find((kind) => criterionKindLabels[kind] === label);
                        if (tipo) setCriterionForm((current) => ({ ...current, tipo }));
                      }}
                    />
                  </div>
                </div>
                <CriterionBuilder
                  rules={criterionForm.regras}
                  onChange={(regras) => { setCriterionForm((current) => ({ ...current, regras })); setCriteriaManagerError(""); }}
                  match={criterionForm.combinar}
                  onMatchChange={(combinar) => setCriterionForm((current) => ({ ...current, combinar }))}
                />
                <AudiencePreviewList preview={audiencePreview} />
              </div>
              <aside aria-label="Critérios salvos" className="space-y-3 xl:sticky xl:top-0 xl:self-start">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={managerSearch}
                  onChange={(event) => { setManagerSearch(event.target.value); setKindPages({}); }}
                  placeholder="Buscar critério ou loja (ex.: LJ 12)..."
                  aria-label="Pesquisar critérios"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs font-medium text-slate-700 shadow-xs outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:focus:border-[#C4D600]"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Critérios salvos</h3>
                  <span className="text-xs text-slate-400">{criteriaOptions.length} critérios</span>
                </div>
                <p className="mb-3 text-[11px] leading-relaxed text-slate-400">Padrões do sistema só podem ser ligados ou desligados. Inativos somem das novas seleções, mas continuam valendo nos segmentos que já os usam.</p>
                <div className="space-y-5">
                  {criterionKinds.map((kind) => {
                    const groupedCriteria = managerCriteria.filter((criterion) => criterion.tipo === kind);
                    if (!groupedCriteria.length) return null;
                    const isSearching = normalizedManagerSearch.length > 0;
                    const isExpanded = isSearching || !collapsedKinds.includes(kind);
                    // Paginado: a lista de lojas tem dezenas de itens e o modal tem altura fixa.
                    const pageCount = Math.ceil(groupedCriteria.length / MANAGER_PAGE_SIZE);
                    const page = Math.min(kindPages[kind] ?? 0, pageCount - 1);
                    const pageStart = page * MANAGER_PAGE_SIZE;
                    const pageCriteria = groupedCriteria.slice(pageStart, pageStart + MANAGER_PAGE_SIZE);
                    return (
                      <section key={kind} aria-label={criterionKindLabels[kind]}>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setCollapsedKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind])}
                          className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
                        >
                          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                            {criterionKindLabels[kind]}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">{groupedCriteria.length}</span>
                          </span>
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                        </button>
                        {isExpanded && <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                          {pageCriteria.map((criterion) => {
                            const system = isSystemCriterion(criterion);
                            return (
                              <li key={criterion.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${isSearching ? "bg-[#C4D600]/10 dark:bg-[#C4D600]/5" : ""}`}>
                                <span className="flex min-w-0 flex-col gap-0.5">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className={`truncate text-sm ${criterion.inativo ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`}>{highlightMatch(criterion.nome, managerSearch)}</span>
                                    {system && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Padrão</span>}
                                  </span>
                                  {!system && (criterion.regras?.length
                                    ? <span className="text-xs text-slate-400">{criterion.regras.map(describeRule).join(criterion.combinar === "any" ? " OU " : " • ")}</span>
                                    : <span className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">Sem regras: nenhum contato atende. Edite para definir.</span>)}
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  {!system && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCriterionForm({ nome: criterion.nome, tipo: criterion.tipo, regras: criterion.regras ?? [], combinar: criterion.combinar ?? "all" });
                                          setEditingCriterionId(criterion.id);
                                          setCriteriaManagerError("");
                                          document.getElementById("criterion-form")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                                        }}
                                        aria-label={`Editar critério ${criterion.nome}`}
                                        className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#002187] hover:bg-[#002187]/5 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer hover:cursor-pointer"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteCriterion(criterion)}
                                        aria-label={`Remover critério ${criterion.nome}`}
                                        className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer hover:cursor-pointer"
                                      >
                                        Remover
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={!criterion.inativo}
                                    aria-label={isStoreCriterion(criterion) ? `Status da loja para ${criterion.nome}` : `${criterion.inativo ? "Ativar" : "Inativar"} critério ${criterion.nome}`}
                                    title={isStoreCriterion(criterion) ? "Status definido pelo cadastro da loja" : criterion.inativo ? "Inativo: não aparece para seleção" : "Ativo"}
                                    disabled={isStoreCriterion(criterion)}
                                    onClick={() => toggleCriterionActive(criterion)}
                                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${isStoreCriterion(criterion) ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:cursor-pointer"} ${criterion.inativo ? "bg-slate-300 dark:bg-slate-600" : "bg-[#002187] dark:bg-[#C4D600]"}`}
                                  >
                                    <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${criterion.inativo ? "" : "translate-x-5 dark:bg-[#051647]"}`} />
                                  </button>
                                </span>
                              </li>
                            );
                          })}
                        </ul>}
                        {isExpanded && pageCount > 1 && (
                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <span className="tabular-nums">Mostrando {pageStart + 1}–{Math.min(pageStart + MANAGER_PAGE_SIZE, groupedCriteria.length)} de {groupedCriteria.length}</span>
                            <span className="flex items-center gap-1">
                              <button type="button" disabled={page === 0} onClick={() => setKindPages((current) => ({ ...current, [kind]: page - 1 }))} aria-label={`Página anterior de ${criterionKindLabels[kind]}`} className="inline-flex h-7 items-center gap-0.5 rounded-md px-2 font-semibold transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 cursor-pointer">
                                <ChevronLeft className="h-3.5 w-3.5" />Anterior
                              </button>
                              <button type="button" disabled={page >= pageCount - 1} onClick={() => setKindPages((current) => ({ ...current, [kind]: page + 1 }))} aria-label={`Próxima página de ${criterionKindLabels[kind]}`} className="inline-flex h-7 items-center gap-0.5 rounded-md px-2 font-semibold transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 cursor-pointer">
                                Próxima<ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </div>
                        )}
                      </section>
                    );
                  })}
                  {managerCriteria.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhum critério encontrado.</p>}
                </div>
              </div>
              </aside>
             </div>
            </div>
            <footer className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-8px_24px_-16px_rgba(5,22,71,0.25)] dark:border-slate-800 dark:bg-[#07194f] sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <AudienceCounter preview={audiencePreview} />
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {criteriaManagerError && <p role="alert" className="mr-2 max-w-xs text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{criteriaManagerError}</p>}
                <button type="button" disabled={criterionForm.regras.length === 0} onClick={() => { setCriterionForm((current) => ({ ...current, regras: [] })); setCriteriaManagerError(""); }} className="h-10 rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer">Limpar filtros</button>
                <button type="button" onClick={() => { if (editingCriterionId) { resetCriterionForm(); } else { setIsCriteriaManagerOpen(false); setManagerSearch(""); resetCriterionForm(); } }} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer">{editingCriterionId ? "Cancelar edição" : "Cancelar"}</button>
                <button type="button" onClick={submitCriterion} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#051647] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer">
                  {editingCriterionId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingCriterionId ? "Salvar critério" : "Criar critério"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
      {pendingDeleteSegment && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#051647]/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDeleteSegment(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-segment-title"
            aria-describedby="delete-segment-description"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-[#07194f]"
          >
            <h2 id="delete-segment-title" className="text-base font-bold text-slate-900 dark:text-white">Excluir segmento?</h2>
            <p id="delete-segment-description" className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Tem certeza de que deseja excluir &quot;{pendingDeleteSegment.nome}&quot;? Esta ação não pode ser desfeita.
            </p>
            {segmentCampaignCount(pendingDeleteSegment) > 0 && (
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                {segmentCampaignCount(pendingDeleteSegment)} campanha(s) vinculada(s) permanecerão salvas com o público registrado.
              </p>
            )}
            <footer className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteSegment(null)}
                className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteSegment(pendingDeleteSegment);
                  setPendingDeleteSegment(null);
                }}
                className="h-9 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 cursor-pointer hover:cursor-pointer"
              >
                Excluir segmento
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
