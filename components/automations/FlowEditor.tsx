"use client";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { compactCount, percent, type FlowMetrics, type NodeMetrics } from "@/lib/automations/metrics";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Star, ExternalLink, ShieldAlert,
  AlertTriangle, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, ArrowLeft, ArrowRightLeft, Award, BadgeCheck, Bell, Bot, Cake, CalendarClock, Glasses, ShoppingBag, CheckCircle2, ChevronDown, ChevronRight, Clock, Copy, Filter, FlaskConical, GitBranch, Globe, History, Kanban, Loader2, MessageCircle, Mic, Upload, Hourglass, Split, Flag, Settings2, Shuffle, Radio, Grid3x3, Users, TrendingUp, MousePointerClick, Gauge, Gem, PenLine, MessageSquare, Pause, Play, Plus, PlusCircle, Redo2, Save, Scan, Search, ShieldOff, SkipForward, StickyNote, Tag, Tags, Timer, Trash2, Undo2, UserPlus, UserX, Webhook, Workflow, X, XCircle, Zap, ZoomIn, ZoomOut,
} from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { TIER_META, type Tier } from "@/lib/scoring";
import { describeRfvpTrigger, RFVP_SEGMENTS } from "@/lib/rfvp";
import { useToast } from "@/components/ToastProvider";
import {
  readDistribute, MAX_ATTRIBUTION_DAYS, AUDIO_STORAGE_PREFIX, CONVERSION_KINDS, describeBusinessWindow, handleLabel, MAX_AB_VARIANTS, outputHandles, readVariants, variantLetter, WEEKDAY_LABELS, type ConversionKind, type FlowSettings, type OutputHandle,
  CONDITION_FIELDS, describeCondition, ERP_TRIGGER_VARIABLES, isErpTrigger, describeFilters, durationLabel, FILTER_KINDS, NODE_CATEGORIES, NOTE_TARGETS, operatorsFor, NODE_DEF, NODE_DEFS, readDuration, readFilters, STAGE_OPTIONS, isTrigger,
  type FieldDef, type FilterKind, type FilterRule, type FlowEdge, type FlowNode, type NodeCategory, type NodeFilters, type NodeType,
  readNodeTemplate, sendsOutsideWindow,
} from "@/lib/automations/nodes";
import { CampaignTemplatePicker, type CampaignTemplate } from "@/components/CampaignTemplatePicker";
import { NPS_SURVEY_LABELS, NPS_TEMPLATES, isNpsSurveyType, npsTemplateParams } from "@/lib/nps-scale";

type FlowStatus = "draft" | "active" | "paused";
type FlowData = { id: string; name: string; description: string; status: FlowStatus; webhookToken: string; settings?: FlowSettings; nodes: FlowNode[]; edges: FlowEdge[] };
type Options = { queues: { id: string; name: string }[]; users: { id: string; name: string }[]; flows?: { id: string; name: string; status: string }[]; fields?: { key: string; label: string }[] };
type NodeData = { kind: NodeType; config: Record<string, unknown>; dir?: "LR" };
type CanvasNode = Node<NodeData, "automation">;
type Step = { id: string; nodeId: string; nodeType: string; status: string; message: string; createdAt: string };
type Execution = { id: string; status: string; currentNodeId: string | null; resumeAt: string | null; error: string | null; startedAt: string; finishedAt: string | null; conversationId: string | null; contact: { id: string; name: string; phone: string | null }; steps: Step[] };
type Snapshot = { nodes: CanvasNode[]; edges: Edge[] };

const ICONS: Record<NodeType, typeof Zap> = {
  trigger_rfvp: Grid3x3, distribute_lead: Shuffle, trigger_link_click: MousePointerClick, trigger_score: Gauge, trigger_tier: Gem, change_score: Gauge, update_field: PenLine,
  trigger_message: MessageCircle, trigger_stage: Kanban, trigger_tag: Tag, trigger_inactive: UserX, trigger_webhook: Webhook, trigger_ai_handoff: ArrowRightLeft,
  trigger_erp_sale: ShoppingBag, trigger_erp_after_sale: CalendarClock, trigger_erp_return: Undo2, trigger_erp_overdue: AlertTriangle, trigger_erp_due_soon: CalendarClock,
  trigger_erp_paid: BadgeCheck, trigger_erp_good_payer: Award, trigger_erp_birthday: Cake, trigger_erp_no_purchase: UserX, trigger_erp_lab_ready: Glasses,
  send_whatsapp: MessageSquare, send_nps: Star, delay: Timer, business_hours: Clock, wait_reply: Hourglass, ab_split: Split, end_flow: Flag, ai_agent: Bot, move_stage: Kanban, create_opportunity: PlusCircle, add_tag: Tags, remove_tag: Tag, assign: UserPlus, notify: Bell, add_note: StickyNote, opt_out: ShieldOff, condition: GitBranch, http: Globe,
};
const HEADER: Record<NodeCategory, string> = {
  gatilho_crm: "bg-[#C4D600] text-[#051647]",
  gatilho_whatsapp: "bg-[#C4D600] text-[#051647]",
  erp_vendas: "bg-[#F7915E] text-[#051647]",
  erp_financeiro: "bg-[#F7915E] text-[#051647]",
  mensagem: "bg-[#002187] text-white",
  ia: "bg-[#002187] text-[#C4D600]",
  crm: "bg-[#051647] text-white",
  logica: "bg-[#F7915E] text-[#051647]",
};
const STATUS_LABEL: Record<FlowStatus, string> = { active: "Ativo", paused: "Pausado", draft: "Rascunho" };
const EXEC_LABEL: Record<string, { label: string; cls: string }> = {
  running: { label: "Rodando", cls: "bg-[#002187]/10 text-[#002187] dark:bg-white/10 dark:text-slate-200" },
  waiting: { label: "Aguardando", cls: "bg-[#002187]/10 text-[#002187] dark:bg-white/10 dark:text-slate-200" },
  completed: { label: "Concluída", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  failed: { label: "Erro", cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  cancelled: { label: "Interrompida", cls: "bg-[#F7915E]/15 text-[#9a4a1c] dark:text-[#F7915E]" },
};
const input = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#C4D600]";
const handleCls = "!h-3 !w-3 !border-2 !border-white !bg-[#002187] dark:!border-[#07194f] dark:!bg-[#C4D600]";
const toolBtn = "grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-white/10";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "");
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Expande/recolhe com transição suave de altura (grid 0fr → 1fr). */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-all duration-200 ease-in-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!open} inert={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** Resumo de uma linha da configuração, mostrado no cartão do nó. */
function summary(kind: NodeType, config: Record<string, unknown>, options: Options): string {
  const stage = (value: unknown) => STAGE_OPTIONS.find((item) => item.value === value)?.label ?? String(value ?? "");
  switch (kind) {
    case "trigger_message": return config.mode === "keywords" ? `Palavras: ${(Array.isArray(config.keywords) ? config.keywords : []).join(", ") || "(nenhuma)"}` : "Qualquer mensagem";
    case "trigger_stage": case "move_stage": return stage(config.stage);
    case "trigger_tag": case "add_tag": case "remove_tag": return String(config.tag || "(sem tag)");
    case "trigger_inactive": { const { amount, unit } = readDuration(config, "days"); return `${durationLabel(amount, unit)} sem contato${config.businessHours ? " · horário comercial" : ""}`; }
    case "trigger_webhook": return config.phoneField ? `Lead externo · telefone em ${String(config.phoneField)}` : "Lead externo (Meta, Google, Typeform, landing page)";
    case "trigger_ai_handoff": return options.queues.find((queue) => queue.id === config.queueId)?.name ?? "Qualquer fila";
    case "trigger_erp_sale": case "trigger_erp_return": case "trigger_erp_after_sale": {
      const parts = [
        kind === "trigger_erp_after_sale" ? `${durationLabel(Number(config.amount) || 0, (config.unit as Parameters<typeof durationLabel>[1]) || "days")} após a venda` : kind === "trigger_erp_return" ? "Devolução no VMSet" : "Venda no VMSet",
        config.customerType === "first" ? "primeira compra" : config.customerType === "repeat" ? "recompra" : "",
        Number(config.minAmount) > 0 ? `a partir de R$ ${Number(config.minAmount).toLocaleString("pt-BR")}` : "",
        String(config.store || ""), String(config.category || ""),
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "trigger_erp_overdue": return `Parcela vencida há ${durationLabel(Number(config.amount) || 0, (config.unit as Parameters<typeof durationLabel>[1]) || "days")}${Number(config.minAmount) > 0 ? ` · a partir de R$ ${Number(config.minAmount).toLocaleString("pt-BR")}` : ""}`;
    case "trigger_erp_due_soon": return Number(config.amount) > 0 ? `${Number(config.amount)} dia(s) antes do vencimento` : "No dia do vencimento";
    case "trigger_erp_paid": return config.mode === "settled" ? "Quitou o carnê / crediário" : "Qualquer parcela paga";
    case "trigger_erp_good_payer": return `Em dia há ${durationLabel(Number(config.amount) || 0, (config.unit as Parameters<typeof durationLabel>[1]) || "months")}`;
    case "trigger_erp_birthday": return Number(config.amount) > 0 ? `${Number(config.amount)} dia(s) antes do aniversário` : "No dia do aniversário";
    case "trigger_erp_no_purchase": return `Sem comprar há ${durationLabel(Number(config.amount) || 0, (config.unit as Parameters<typeof durationLabel>[1]) || "months")}`;
    case "trigger_erp_lab_ready": return String(config.store || "Todas as lojas");
    case "send_whatsapp": { const template = readNodeTemplate(config); return template ? `Modelo: ${template.name}` : String(config.text || (config.audio ? "Nota de voz" : "(mensagem vazia)")); }
    case "send_nps": { const template = readNodeTemplate(config); return `${config.surveyType === "PRODUTO_ADAPTACAO" ? "Produto e adaptação" : "Atendimento"} · ${template ? `modelo ${template.name}` : "sem modelo da Meta"}`; }
    case "business_hours": return describeBusinessWindow(config);
    case "wait_reply": { const { amount, unit } = readDuration(config, "days"); return `Até ${durationLabel(amount, unit)} pela resposta`; }
    case "ab_split": return readVariants(config).map((percent, index) => `${variantLetter(index)} ${percent}%`).join(" / ");
    case "end_flow": return config.mode === "goto" ? `Ir para: ${options.flows?.find((item) => item.id === config.flowId)?.name ?? "(escolha a automação)"}` : "Encerrar este fluxo";
    case "delay": { const { amount, unit } = readDuration(config, "hours"); return `${durationLabel(amount, unit)}${config.businessHours ? " · horário comercial" : ""}`; }
    case "ai_agent": return String(config.objective || "Atendimento pela IA");
    case "assign": return options.queues.find((queue) => queue.id === config.queueId)?.name ?? "(escolha a fila)";
    case "distribute_lead": {
      const rule = readDistribute(config);
      const pool = rule.pool === "queue" ? options.queues.find((queue) => queue.id === rule.queueId)?.name ?? "(escolha a fila)" : `${rule.userIds.length} vendedor(es)`;
      return `${rule.mode === "least_load" ? "Menor carga" : "Rodízio"} · ${pool}${rule.onlyOnline ? " · online" : ""}${rule.respectShift ? " · turno" : ""}${rule.maxActive ? ` · até ${rule.maxActive}` : ""}`;
    }
    case "notify": return String(config.title || "Notificação");
    case "condition": return describeCondition(config);
    case "add_note": return `${NOTE_TARGETS.find((item) => item.value === config.target)?.label ?? NOTE_TARGETS[0].label}: ${String(config.text || "(sem texto)")}`;
    case "http": return `${String(config.method)} ${String(config.url || "(sem URL)")}`;
    case "create_opportunity": return "Novo lead (se não houver aberta)";
    case "opt_out": return "Fora das campanhas (LGPD)";
    case "trigger_link_click": return config.urlContains ? `Destino contém "${String(config.urlContains)}"` : "Qualquer link rastreado";
    case "trigger_score": return `Chegou a ${Number(config.amount) || 0} pontos`;
    case "trigger_rfvp": return describeRfvpTrigger(config);
    case "trigger_tier": return `${config.tier === "any" || !config.tier ? "Qualquer nível" : TIER_META[config.tier as Tier]?.label ?? String(config.tier)} · ${config.direction === "down" ? "caiu" : config.direction === "any" ? "subiu ou caiu" : "subiu"}`;
    case "change_score": return `${config.operation === "subtract" ? "−" : "+"}${Number(config.amount) || 0} pts${config.reason ? ` · ${String(config.reason)}` : ""}`;
    case "update_field": return config.fieldKey ? `${options.fields?.find((item) => item.key === config.fieldKey)?.label ?? String(config.fieldKey)} = ${String(config.value || "(vazio)")}` : "(escolha o campo)";
    default: return "";
  }
}

const OptionsContext = { current: { queues: [], users: [] } as Options, flowId: "" };
const queueNames = () => Object.fromEntries(OptionsContext.current.queues.map((queue) => [queue.id, queue.name]));

/** Métricas do fluxo para os cards do canvas (null = carregando ou oculto). */
const MetricsContext = createContext<FlowMetrics | null>(null);

const BADGE = "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold leading-none";

/** Badges compactos do nó: entraram, passaram, erros, entregues/responderam (envios) e vendas atribuídas. */
function NodeBadges({ metrics, kind }: { metrics: NodeMetrics; kind: NodeType }) {
  const message = kind === "send_whatsapp";
  const money = metrics.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  return (
    <div className="mx-3 mt-1.5 flex flex-wrap gap-1" aria-label="Métricas do passo">
      <span className={`${BADGE} bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300`} title={`${metrics.entered} entraram neste passo`}><Users className="h-2.5 w-2.5" />{compactCount(metrics.entered)}</span>
      <span className={`${BADGE} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300`} title={`${metrics.completed} passaram (${percent(metrics.completed, metrics.entered)}%)`}><CheckCircle2 className="h-2.5 w-2.5" />{compactCount(metrics.completed)}</span>
      {metrics.errors > 0 && <span className={`${BADGE} bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300`} title={`${metrics.errors} com erro`}><XCircle className="h-2.5 w-2.5" />{compactCount(metrics.errors)}</span>}
      {message && <span className={`${BADGE} bg-[#002187]/10 text-[#002187] dark:bg-white/10 dark:text-[#C4D600]`} title={`${metrics.delivered} de ${metrics.sent} mensagens entregues (${percent(metrics.delivered, metrics.sent)}%)`}><CheckCircle2 className="h-2.5 w-2.5" />{percent(metrics.delivered, metrics.sent)}% entr.</span>}
      {message && <span className={`${BADGE} bg-[#C4D600]/30 text-[#051647] dark:text-[#C4D600]`} title={`${metrics.replied} de ${metrics.sent} responderam (${percent(metrics.replied, metrics.sent)}%)`}><MessageCircle className="h-2.5 w-2.5" />{percent(metrics.replied, metrics.sent)}% resp.</span>}
      {metrics.sales > 0 && <span className={`${BADGE} bg-[#F7915E]/20 text-[#9a4a1c] dark:text-[#F7915E]`} title={`${metrics.sales} venda(s) no VMSet atribuída(s) · ${money}`}><ShoppingBag className="h-2.5 w-2.5" />{metrics.sales} · {money}</span>}
    </div>
  );
}

const AutomationNode = memo(function AutomationNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const flowMetrics = useContext(MetricsContext);
  const nodeMetrics = flowMetrics?.nodes[id] ?? null;
  const def = NODE_DEF[data.kind];
  const Icon = ICONS[data.kind] ?? Zap;
  const horizontal = data.dir === "LR";
  const filters = readFilters(data.config);
  return (
    <div className={`w-[240px] rounded-xl border bg-white shadow-md dark:bg-[#07194f] ${selected ? "border-[#002187] ring-2 ring-[#002187]/30 dark:border-[#C4D600] dark:ring-[#C4D600]/30" : "border-slate-200 dark:border-slate-700"}`}>
      {!isTrigger(data.kind) && <Handle type="target" position={horizontal ? Position.Left : Position.Top} className={handleCls} />}
      <div className={`flex items-center gap-2 rounded-t-[11px] px-3 py-1.5 text-[11px] font-bold ${HEADER[def.category]}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{def.label}</span>
        {isTrigger(data.kind) && <span className="ml-auto rounded bg-white/40 px-1 text-[9px] uppercase">início</span>}
      </div>
      <p className="line-clamp-2 break-words px-3 pt-2 text-[11px] text-slate-600 dark:text-slate-300">{summary(data.kind, data.config, OptionsContext.current)}</p>
      {filters.rules.length > 0 ? (
        <p className="mx-3 mt-1.5 flex items-center gap-1 truncate rounded bg-[#002187]/5 px-1.5 py-0.5 text-[10px] font-medium text-[#002187] dark:bg-white/10 dark:text-[#C4D600]" title={describeFilters(filters, { queues: queueNames() })}>
          <Filter className="h-3 w-3 shrink-0" /><span className="truncate">{filters.rules.length} regra{filters.rules.length === 1 ? "" : "s"} ({filters.combinator === "or" ? "OU" : "E"})</span>
        </p>
      ) : null}
      {flowMetrics && <NodeBadges metrics={nodeMetrics ?? { entered: 0, completed: 0, errors: 0, sent: 0, delivered: 0, replied: 0, sales: 0, revenue: 0 }} kind={data.kind} />}
      <div className="h-2" />
      <NodeOutputs outputs={outputHandles(data.kind, data.config)} horizontal={horizontal} />
    </div>
  );
});

const TONE_CHIP: Record<OutputHandle["tone"], string> = {
  yes: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  no: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
  warn: "bg-[#F7915E]/15 text-[#9a4a1c] ring-[#F7915E]/40 dark:text-[#F7915E]",
  variant: "bg-[#002187]/10 text-[#002187] ring-[#002187]/20 dark:bg-white/10 dark:text-[#C4D600] dark:ring-white/20",
};
const TONE_HANDLE: Record<OutputHandle["tone"], string> = { yes: "!bg-emerald-500", no: "!bg-red-500", warn: "!bg-[#F7915E]", variant: "!bg-[#002187]" };
const TONE_ICON: Record<OutputHandle["tone"], typeof Zap> = { yes: CheckCircle2, no: XCircle, warn: Clock, variant: Split };

/**
 * Saídas do nó: uma comum, nenhuma (Encerrar) ou rotuladas (Sim/Não, Respondeu/Timeout, Variante A/B...), cada
 * rótulo com o seu ponto de conexão alinhado.
 */
function NodeOutputs({ outputs, horizontal }: { outputs: OutputHandle[] | null; horizontal: boolean }) {
  if (outputs === null) return <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} className={handleCls} />;
  if (!outputs.length) return <p className="mx-3 mb-2 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300"><Flag className="h-3 w-3" />Fim do fluxo</p>;
  return (
    <>
      <div className={`flex gap-1.5 border-t border-slate-100 px-2 pb-2.5 pt-2 dark:border-slate-800 ${horizontal ? "flex-col items-end" : "justify-between"}`}>
        {outputs.map((output) => {
          const Icon = TONE_ICON[output.tone];
          return <span key={output.id} className={`inline-flex min-w-0 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${TONE_CHIP[output.tone]}`}><Icon className="h-3 w-3 shrink-0" /><span className="truncate">{output.label}</span></span>;
        })}
      </div>
      {outputs.map((output, index) => (
        <Handle
          key={output.id}
          id={output.id}
          type="source"
          title={output.label}
          position={horizontal ? Position.Right : Position.Bottom}
          style={horizontal ? { top: "auto", bottom: 10 + (outputs.length - 1 - index) * 24 } : { left: `${((index + 0.5) / outputs.length) * 100}%` }}
          className={`!h-3.5 !w-3.5 !border-2 !border-white ${TONE_HANDLE[output.tone]}`}
        />
      ))}
    </>
  );
}

const nodeTypes = { automation: AutomationNode };
const edgeStyle = { markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 }, style: { strokeWidth: 2 } };

let nodeSeq = 0;
const newNodeId = (kind: NodeType) => `${kind.replace(/_/g, "-")}-${Date.now().toString(36)}${(nodeSeq += 1).toString(36)}`;

const toCanvas = (node: FlowNode): CanvasNode => ({ id: node.id, type: "automation", position: node.position, data: { kind: node.type, config: node.data.config, ...(node.data.dir ? { dir: node.data.dir } : {}) } });
/** Ramo de saída rotulada: aresta colorida (Sim/Respondeu verde, Não vermelha, Timeout laranja, Variante azul) com selo. */
function branchStyle(handle: string | null | undefined): Partial<Edge> {
  const label = handleLabel(handle);
  if (!label) return edgeStyle;
  const color = handle === "true" || handle === "replied" ? "#10b981" : handle === "false" ? "#ef4444" : handle === "timeout" ? "#F7915E" : "#002187";
  return {
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
    style: { strokeWidth: 2, stroke: color },
    label,
    labelStyle: { fill: "#fff", fontSize: 10, fontWeight: 700 },
    labelBgStyle: { fill: color },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 999,
  };
}
const toCanvasEdge = (edge: FlowEdge): Edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? null, ...branchStyle(edge.sourceHandle) });

/**
 * Auto-organizar: camadas pela distância a partir dos gatilhos (e nós sem entrada), na vertical (de cima para baixo)
 * ou na horizontal (da esquerda para a direita); dentro da camada mantém a ordem atual.
 */
function autoLayout(nodes: CanvasNode[], edges: Edge[], dir: "TB" | "LR"): CanvasNode[] {
  const depth = new Map<string, number>();
  const incoming = new Set(edges.map((edge) => edge.target));
  for (const node of nodes) if (isTrigger(node.data.kind) || !incoming.has(node.id)) depth.set(node.id, 0);
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const from = depth.get(edge.source);
      if (from === undefined) continue;
      const next = Math.min(from + 1, nodes.length);
      if ((depth.get(edge.target) ?? -1) < next) { depth.set(edge.target, next); changed = true; }
    }
    if (!changed) break;
  }
  const layers = new Map<number, CanvasNode[]>();
  for (const node of nodes) {
    const level = depth.get(node.id) ?? 0;
    layers.set(level, [...(layers.get(level) ?? []), node]);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [level, items] of layers) {
    items.sort((a, b) => (dir === "TB" ? a.position.x - b.position.x : a.position.y - b.position.y));
    items.forEach((node, index) => {
      const offset = index - (items.length - 1) / 2;
      positions.set(node.id, dir === "TB" ? { x: Math.round(offset * 290), y: level * 180 } : { x: level * 330, y: Math.round(offset * 160) });
    });
  }
  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position, data: dir === "LR" ? { ...node.data, dir: "LR" } : { kind: node.data.kind, config: node.data.config } }));
}

/** Nota de voz do nó Enviar WhatsApp: upload (.mp3/.ogg/.opus) para o armazenamento ou URL http(s). */
function AudioField({ label, hint, value, placeholder, onChange }: { label: ReactNode; hint: ReactNode; value: string; placeholder?: string; onChange: (value: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const stored = value.startsWith(AUDIO_STORAGE_PREFIX);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!/\.(mp3|ogg|opus|m4a|wav)$/i.test(file.name) && !file.type.startsWith("audio/")) { setError("Envie um arquivo de áudio (.mp3, .ogg ou .opus)."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("files", file.type.startsWith("audio/") ? file : new File([file], file.name, { type: /\.mp3$/i.test(file.name) ? "audio/mpeg" : "audio/ogg" }));
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as { files?: { key: string }[]; error?: string } | null;
      if (!response.ok || !body?.files?.[0]?.key) throw new Error(body?.error ?? "Falha no upload do áudio.");
      onChange(`${AUDIO_STORAGE_PREFIX}${body.files[0].key}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha no upload do áudio.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="space-y-1">
      {label}
      {stored ? (
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700">
          <Mic className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
          <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">{value.split("/").pop()}</span>
          <button type="button" onClick={() => onChange("")} aria-label="Remover áudio" className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={input} aria-label="URL do áudio" />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Enviar
          </button>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.ogg,.opus" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
        </div>
      )}
      {error ? <span role="alert" className="block text-[10px] text-red-600">{error}</span> : hint}
    </div>
  );
}

/**
 * Modelo aprovado da Meta no passo (mesmo seletor de Campanhas). Na Pesquisa NPS, ao trocar o modelo, as variáveis já
 * vêm preenchidas: {{1}} primeiro nome, {{2}} Óticas Brasil e {{3}} o assunto da pesquisa.
 */
function NodeTemplateField({ field, value, onChange, nodeConfig, nodeKind }: { field: Extract<FieldDef, { kind: "template" }>; value: unknown; onChange: (value: unknown) => void; nodeConfig?: Record<string, unknown>; nodeKind?: NodeType }) {
  const current = value && typeof value === "object" ? (value as CampaignTemplate) : null;
  const surveyType = nodeKind === "send_nps" && isNpsSurveyType(nodeConfig?.surveyType) ? nodeConfig.surveyType : nodeKind === "send_nps" ? "ATENDIMENTO" : null;
  return (
    <div className="space-y-1">
      <CampaignTemplatePicker
        value={current}
        label={field.label}
        emptyLabel={field.required ? "Escolha o modelo aprovado" : "Sem modelo (texto livre, só com a janela de 24 h aberta)"}
        onChange={(next) => {
          const changed = next && (!current || current.name !== next.name || current.language !== next.language);
          onChange(next && changed && surveyType ? { ...next, params: npsTemplateParams(surveyType, next.params.length) } : next);
        }}
      />
      {field.hint && <span className="block text-[10px] text-slate-400">{field.hint}</span>}
    </div>
  );
}

function Field({ field, value, onChange, options, nodeConfig, nodeKind }: { field: FieldDef; value: unknown; onChange: (value: unknown) => void; options: Options; nodeConfig?: Record<string, unknown>; nodeKind?: NodeType }) {
  const label = <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">{field.label}</span>;
  const hint = field.hint ? <span className="block text-[10px] text-slate-400">{field.hint}</span> : null;
  if (field.kind === "template") return <NodeTemplateField field={field} value={value} onChange={onChange} nodeConfig={nodeConfig} nodeKind={nodeKind} />;
  if (field.kind === "boolean") {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{field.label}</span>
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 cursor-pointer accent-[#002187]" />
      </label>
    );
  }
  if (field.kind === "weekdays") {
    const days = Array.isArray(value) ? value.map(Number) : [];
    const toggle = (day: number) => onChange(days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort((a, b) => a - b));
    return (
      <div className="space-y-1">
        {label}
        <div className="flex flex-wrap gap-1">
          {WEEKDAY_LABELS.map((name, day) => (
            <button key={name} type="button" aria-pressed={days.includes(day)} onClick={() => toggle(day)} className={`h-8 min-w-[2.5rem] cursor-pointer rounded-lg px-2 text-[11px] font-semibold ${days.includes(day) ? "bg-[#002187] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"}`}>{name}</button>
          ))}
        </div>
        {hint}
      </div>
    );
  }
  if (field.kind === "time") return <label className="block space-y-1">{label}<input type="time" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} className={`${input} cursor-pointer`} />{hint}</label>;
  if (field.kind === "variants") {
    const variants = Array.isArray(value) ? value.map((item) => Number(item) || 0) : [50, 50];
    const total = variants.reduce((sum, item) => sum + item, 0);
    const set = (next: number[]) => onChange(next);
    const even = (count: number) => Array.from({ length: count }, (_, index) => Math.floor(100 / count) + (index < 100 % count ? 1 : 0));
    return (
      <div className="space-y-1.5">
        {label}
        {variants.map((percent, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] font-semibold text-[#002187] dark:text-[#C4D600]">Variante {variantLetter(index)}</span>
            <input type="number" min={0} max={100} aria-label={`Percentual da variante ${variantLetter(index)}`} value={percent} onChange={(event) => set(variants.map((item, position) => (position === index ? Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0))) : item)))} className={input} />
            <span className="text-xs text-slate-400">%</span>
            {variants.length > 2 && <button type="button" onClick={() => set(even(variants.length - 1))} aria-label={`Remover variante ${variantLetter(index)}`} className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-white/10"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-semibold ${total === 100 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600"}`}>Soma: {total}%{total === 100 ? "" : " (precisa ser 100%)"}</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => set(even(variants.length))} className="h-7 cursor-pointer rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Dividir igual</button>
            {variants.length < MAX_AB_VARIANTS && <button type="button" onClick={() => set(even(variants.length + 1))} className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5"><Plus className="h-3 w-3" />Variante</button>}
          </div>
        </div>
        {hint}
      </div>
    );
  }
  if (field.kind === "audio") return <AudioField label={label} hint={hint} value={String(value ?? "")} placeholder={field.placeholder} onChange={onChange} />;
  if (field.kind === "textarea") return <label className="block space-y-1">{label}<textarea rows={4} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} className={`${input} h-auto resize-y py-2`} />{hint}</label>;
  if (field.kind === "list") return <label className="block space-y-1">{label}<input value={(Array.isArray(value) ? value : []).join(", ")} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} className={input} />{hint ?? <span className="block text-[10px] text-slate-400">Separe por vírgula.</span>}</label>;
  const select = (items: { value: string; label: string }[], empty?: string) => (
    <label className="block space-y-1">{label}
      <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} className={`${input} cursor-pointer`}>
        {empty !== undefined && <option value="">{empty}</option>}
        {items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>{hint}
    </label>
  );
  if (field.kind === "select") return select(field.options);
  if (field.kind === "stage") return select(STAGE_OPTIONS);
  if (field.kind === "contact_field") {
    return (
      <div className="space-y-1">
        {select((options.fields ?? []).map((item) => ({ value: item.key, label: `${item.label} (${item.key})` })), options.fields?.length ? "Escolha o campo" : "Nenhum campo criado")}
        {!options.fields?.length && <span className="block text-[10px] text-slate-400">Crie os campos em Contatos › Campos personalizados.</span>}
      </div>
    );
  }
  if (field.kind === "flow") return select((options.flows ?? []).filter((item) => item.id !== OptionsContext.flowId).map((item) => ({ value: item.id, label: `${item.name}${item.status === "active" ? "" : " (inativa)"}` })), "Escolha a automação");
  if (field.kind === "queue") return select(options.queues.map((queue) => ({ value: queue.id, label: queue.name })), "Escolha a fila");
  if (field.kind === "user") return select(options.users.map((user) => ({ value: user.id, label: user.name })), "Ninguém (só a fila)");
  if (field.kind === "users") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="space-y-1">{label}
        <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1.5 dark:border-slate-700">
          {options.users.map((user) => (
            <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5">
              <input type="checkbox" checked={selected.includes(user.id)} onChange={(event) => onChange(event.target.checked ? [...selected, user.id] : selected.filter((id) => id !== user.id))} className="cursor-pointer accent-[#002187]" />{user.name}
            </label>
          ))}
        </div>{hint ?? <span className="block text-[10px] text-slate-400">Nenhum marcado: avisa os supervisores.</span>}
      </div>
    );
  }
  return <label className="block space-y-1">{label}<input type={field.kind === "number" ? "number" : "text"} min={field.kind === "number" ? 0 : undefined} value={String(value ?? "")} placeholder={"placeholder" in field ? field.placeholder : undefined} onChange={(event) => onChange(field.kind === "number" ? Number(event.target.value) : event.target.value)} className={input} />{hint}</label>;
}

/** Campo de texto que recebe a variável clicada, por tipo de nó. */
const VAR_TARGET: Partial<Record<NodeType, string>> = { send_whatsapp: "text", add_note: "text", notify: "message", ai_agent: "objective" };

/** Variáveis disponíveis para os passos: as do contato + as que os gatilhos do fluxo entregam (VMSet, mensagem, IA). */
function VariablesPicker({ triggers, onPick }: { triggers: NodeType[]; onPick: (variable: string) => void }) {
  const groups: { label: string; vars: string[] }[] = [{ label: "Contato", vars: ["nome", "nome_completo", "cidade", "telefone"] }, { label: "Matriz RFV-P", vars: ["rfvp.codigo", "rfvp.segmento", "rfvp.r", "rfvp.f", "rfvp.v", "rfvp.p"] }, { label: "Roleta de vendedores", vars: ["vendedor"] }];
  for (const kind of [...new Set(triggers)]) {
    if (kind === "trigger_rfvp") groups.push({ label: NODE_DEF[kind].label, vars: ["rfvp.anterior.codigo", "rfvp.anterior.segmento"] });
    if (kind === "trigger_webhook") groups.push({ label: NODE_DEF[kind].label, vars: ["nome_lead", "email", "origem", "telefone_lead", "utm_source", "utm_campaign"] });
    if (kind === "trigger_message") groups.push({ label: NODE_DEF[kind].label, vars: ["mensagem.texto"] });
    else if (kind === "trigger_ai_handoff") groups.push({ label: NODE_DEF[kind].label, vars: ["fila", "motivo"] });
    else if (kind === "trigger_link_click") groups.push({ label: NODE_DEF[kind].label, vars: ["link"] });
    else if (kind === "trigger_score" || kind === "trigger_tier") groups.push({ label: NODE_DEF[kind].label, vars: ["pontuacao", "nivel", "nivel_anterior"] });
    else if (isErpTrigger(kind)) groups.push({ label: `VMSet · ${NODE_DEF[kind].label}`, vars: ERP_TRIGGER_VARIABLES[kind] });
  }
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
      <p className="text-[11px] font-bold text-[#051647] dark:text-white">Variáveis disponíveis</p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">Clique para inserir no texto. Variável sem valor no evento fica vazia.</p>
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
          <div className="flex flex-wrap gap-1">
            {group.vars.map((variable) => (
              <button key={variable} type="button" onClick={() => onPick(variable)} className="cursor-pointer rounded bg-[#002187]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#002187] hover:bg-[#002187]/20 dark:bg-white/10 dark:text-[#C4D600] dark:hover:bg-white/20">{`{{${variable}}}`}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Painel da Condição: Campo/variável → Operador → Valor, com a frase final e os dois caminhos explicados. */
function ConditionEditor({ config, onChange }: { config: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const field = String(config.field ?? "reply");
  const operators = operatorsFor(field);
  const operator = operators.find((item) => item.value === config.operator) ?? operators[0];
  const label = (text: string) => <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">{text}</span>;
  const changeField = (next: string) => {
    onChange("field", next);
    // Operador incompatível com o novo campo volta para o primeiro válido.
    const valid = operatorsFor(next);
    if (!valid.some((item) => item.value === config.operator)) onChange("operator", valid[0].value);
    if (next === "stage" && !STAGE_OPTIONS.some((item) => item.value === config.value)) onChange("value", STAGE_OPTIONS[0].value);
  };
  return (
    <div className="space-y-2.5">
      <label className="block space-y-1">{label("Campo / variável")}
        <select value={field} onChange={(event) => changeField(event.target.value)} className={`${input} cursor-pointer`}>
          {CONDITION_FIELDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {field === "variable" && (
        <label className="block space-y-1">{label("Nome da variável")}
          <input value={String(config.variable ?? "")} placeholder="origem" onChange={(event) => onChange("variable", event.target.value.replace(/[{}\s]/g, ""))} className={`${input} font-mono`} />
          <span className="block text-[10px] text-slate-400">Campo do webhook, {"{{fila}}"}, {"{{motivo}}"}, {"{{http.campo}}"}...</span>
        </label>
      )}
      {field !== "none" && (
        <>
          <label className="block space-y-1">{label("Operador")}
            <select value={operator.value} onChange={(event) => onChange("operator", event.target.value)} className={`${input} cursor-pointer`}>
              {operators.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {(operator.needsValue || (operator.value === "exists" && String(config.value ?? "").trim())) && (
            <label className="block space-y-1">{label("Valor")}
              {field === "stage" ? (
                <select value={String(config.value ?? "")} onChange={(event) => onChange("value", event.target.value)} className={`${input} cursor-pointer`}>
                  {STAGE_OPTIONS.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                </select>
              ) : field === "rfvp_segment" ? (
                <select value={String(config.value ?? "")} onChange={(event) => onChange("value", event.target.value)} className={`${input} cursor-pointer`}>
                  <option value="">Escolha o segmento</option>
                  {RFVP_SEGMENTS.map((segment) => <option key={segment.key} value={segment.key}>{segment.label}</option>)}
                </select>
              ) : field.startsWith("rfvp_") && field !== "rfvp_code" ? (
                <select value={String(config.value ?? "")} onChange={(event) => onChange("value", event.target.value)} className={`${input} cursor-pointer`}>
                  <option value="">Nota</option>
                  {[1, 2, 3, 4, 5].map((score) => <option key={score} value={String(score)}>{score}</option>)}
                </select>
              ) : (
                <input type={field === "hour" ? "number" : "text"} min={field === "hour" ? 0 : undefined} max={field === "hour" ? 23 : undefined} value={String(config.value ?? "")} placeholder={field === "hour" ? "18" : field === "rfvp_code" ? "555-5" : field === "tag" ? "vip" : field === "city" ? "Goiânia" : "texto"} onChange={(event) => onChange("value", event.target.value)} className={input} />
              )}
            </label>
          )}
        </>
      )}
      <div className="space-y-1.5 rounded-lg bg-slate-50 p-2.5 text-[11px] dark:bg-white/5">
        <p className="font-semibold text-[#051647] dark:text-white">Se {describeCondition(config)}</p>
        <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />segue pela saída <b>Sim / Verdadeiro</b> (verde)</p>
        <p className="flex items-center gap-1.5 text-red-700 dark:text-red-300"><XCircle className="h-3.5 w-3.5 shrink-0" />senão, pela saída <b>Não / Falso</b> (vermelha)</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">Para combinar várias regras com E / OU, use Regras & Filtros abaixo: elas entram no Sim junto com esta verificação.</p>
      </div>
    </div>
  );
}

/** Regras & Filtros de Execução de qualquer nó (E/OU, fila, tipo de contato, etapa, tag, cidade, receita). */
function FiltersEditor({ kind, filters, onChange, options }: { kind: NodeType; filters: NodeFilters; onChange: (filters: NodeFilters) => void; options: Options }) {
  const [open, setOpen] = useState(filters.rules.length > 0);
  const setRule = (index: number, rule: FilterRule) => onChange({ ...filters, rules: filters.rules.map((item, position) => (position === index ? rule : item)) });
  const addRule = () => { setOpen(true); onChange({ ...filters, rules: [...filters.rules, { kind: "queue", op: "none" }] }); };
  const trigger = isTrigger(kind);
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-[11px] font-bold text-[#051647] dark:text-white">
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ease-in-out ${open ? "rotate-180" : ""}`} />
        <Filter className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
        <span className="flex-1">Regras & Filtros de Execução</span>
        {filters.rules.length > 0 && <span className="rounded-full bg-[#002187]/10 px-1.5 text-[10px] text-[#002187] dark:bg-white/10 dark:text-[#C4D600]">{filters.rules.length}</span>}
      </button>
      <Collapse open={open}>
        <div className="space-y-2 border-t border-slate-100 p-2.5 dark:border-slate-800">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {trigger ? "Se as regras não forem atendidas, este gatilho é ignorado." : kind === "condition" ? "As regras entram no Sim/Não junto com a verificação acima." : "Se as regras não forem atendidas, o passo é pulado ou o ramo é encerrado (com registro no histórico)."} Contatos com opt-out (LGPD) são sempre bloqueados.
          </p>
          <select aria-label="Combinar regras" value={filters.combinator} onChange={(event) => onChange({ ...filters, combinator: event.target.value === "or" ? "or" : "and" })} className={`${input} cursor-pointer`}>
            <option value="and">Todas as regras (E)</option>
            <option value="or">Qualquer regra (OU)</option>
          </select>
          {filters.rules.map((rule, index) => {
            const def = FILTER_KINDS.find((item) => item.kind === rule.kind) ?? FILTER_KINDS[0];
            const op = def.ops.find((item) => item.value === rule.op) ?? def.ops[0];
            return (
              <div key={index} className="space-y-1.5 rounded-lg bg-slate-50 p-2 dark:bg-white/5">
                <div className="flex gap-1">
                  <select aria-label="Tipo de regra" value={rule.kind} onChange={(event) => { const next = FILTER_KINDS.find((item) => item.kind === event.target.value) ?? FILTER_KINDS[0]; setRule(index, { kind: next.kind as FilterKind, op: next.ops[0].value }); }} className={`${input} cursor-pointer`}>
                    {FILTER_KINDS.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
                  </select>
                  <button type="button" aria-label="Remover regra" title="Remover regra" onClick={() => onChange({ ...filters, rules: filters.rules.filter((_, position) => position !== index) })} className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <select aria-label="Operador da regra" value={op.value} onChange={(event) => setRule(index, { kind: rule.kind, op: event.target.value, ...(rule.value ? { value: rule.value } : {}) })} className={`${input} cursor-pointer`}>
                  {def.ops.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                {op.needsValue === "queue" && (
                  <select aria-label="Fila" value={rule.value ?? ""} onChange={(event) => setRule(index, { ...rule, value: event.target.value })} className={`${input} cursor-pointer`}>
                    <option value="">Escolha a fila</option>
                    {options.queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                  </select>
                )}
                {op.needsValue === "stage" && (
                  <select aria-label="Etapa" value={rule.value ?? ""} onChange={(event) => setRule(index, { ...rule, value: event.target.value })} className={`${input} cursor-pointer`}>
                    <option value="">Escolha a etapa</option>
                    {STAGE_OPTIONS.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                  </select>
                )}
                {op.needsValue === "text" && <input aria-label="Valor da regra" value={rule.value ?? ""} placeholder={rule.kind === "tag" ? "vip" : "Goiânia"} onChange={(event) => setRule(index, { ...rule, value: event.target.value })} className={input} />}
              </div>
            );
          })}
          <button type="button" onClick={addRule} className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 text-[11px] font-semibold text-[#002187] hover:border-[#002187] dark:border-slate-600 dark:text-[#C4D600]"><Plus className="h-3.5 w-3.5" />Adicionar regra</button>
          {!trigger && kind !== "condition" && filters.rules.length > 0 && (
            <label className="block space-y-1"><span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">Se não atender</span>
              <select value={filters.onFail} onChange={(event) => onChange({ ...filters, onFail: event.target.value === "stop" ? "stop" : "skip" })} className={`${input} cursor-pointer`}>
                <option value="skip">Pular este passo e seguir o fluxo</option>
                <option value="stop">Encerrar o ramo aqui</option>
              </select>
            </label>
          )}
        </div>
      </Collapse>
    </div>
  );
}

/** Testar fluxo: simula para um contato real, sem enviar mensagens nem gravar nada. */
function TestDialog({ flowId, graph, triggers, onClose }: { flowId: string; graph: { nodes: FlowNode[]; edges: FlowEdge[] }; triggers: CanvasNode[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; nome: string; telefone: string }[]>([]);
  const [contact, setContact] = useState<{ id: string; nome: string; telefone: string } | null>(null);
  const [triggerId, setTriggerId] = useState(triggers[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<{ status: string; error: string | null; steps: { nodeId: string; label: string; status: string; message: string }[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/contacts/search?q=${encodeURIComponent(query.trim())}&limit=8&withPhone=1`)
        .then((response) => response.json())
        .then((data: { data?: { id: string; nome: string; telefone: string }[] }) => { if (active) setResults(data.data ?? []); })
        .catch(() => { if (active) setResults([]); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  const run = async () => {
    if (!contact) return;
    setRunning(true);
    setError("");
    try {
      const response = await fetch(`/api/automations/${flowId}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: contact.id, triggerNodeId: triggerId, ...graph }) });
      const data = (await response.json()) as { status?: string; error?: string | null; steps?: { nodeId: string; label: string; status: string; message: string }[] };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível simular.");
      setOutcome({ status: data.status ?? "completed", error: data.error ?? null, steps: data.steps ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível simular.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <EntityDialog titleId="testar-fluxo" title="Testar fluxo" description="Simula o fluxo atual (mesmo sem salvar) para um contato real: regras, condições e dados são reais; nenhuma mensagem é enviada e nada é gravado. As esperas são puladas." onClose={onClose} size="md">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <label className="block space-y-1"><span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">Contato</span>
          {contact ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
              <span className="min-w-0 flex-1 truncate font-semibold text-[#051647] dark:text-white">{contact.nome} · {contact.telefone}</span>
              <button type="button" onClick={() => { setContact(null); setOutcome(null); }} className="cursor-pointer text-[11px] font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">Trocar</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim().length < 2) setResults([]); }} placeholder="Buscar por nome ou telefone" className={`${input} pl-8`} />
            </div>
          )}
        </label>
        {!contact && results.length > 0 && (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {results.map((item) => (
              <li key={item.id}><button type="button" onClick={() => { setContact(item); setResults([]); }} className="w-full cursor-pointer px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/5"><span className="font-semibold text-[#051647] dark:text-white">{item.nome}</span> <span className="text-slate-500">{item.telefone}</span></button></li>
            ))}
          </ul>
        )}
        {triggers.length > 1 && (
          <label className="block space-y-1"><span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">Começar pelo gatilho</span>
            <select value={triggerId} onChange={(event) => setTriggerId(event.target.value)} className={`${input} cursor-pointer`}>
              {triggers.map((node) => <option key={node.id} value={node.id}>{NODE_DEF[node.data.kind].label} — {summary(node.data.kind, node.data.config, OptionsContext.current)}</option>)}
            </select>
          </label>
        )}
        <button type="button" disabled={!contact || running} onClick={() => void run()} className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#002187] text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}Simular execução
        </button>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
        {outcome && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#051647] dark:text-white">Resultado: {EXEC_LABEL[outcome.status]?.label ?? outcome.status}{outcome.error ? ` — ${outcome.error}` : ""}</p>
            <ol className="space-y-1 rounded-lg bg-slate-50 p-3 dark:bg-white/5">
              {outcome.steps.map((step, index) => (
                <li key={`${step.nodeId}-${index}`} className="flex items-start gap-2 text-[11px]">
                  {step.status === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : step.status === "waiting" ? <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" /> : step.status === "skipped" ? <SkipForward className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /> : step.status === "cancelled" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F7915E]" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
                  <span className="min-w-0 break-words"><span className="font-semibold text-slate-700 dark:text-slate-200">{step.label}</span>{step.message ? <span className="text-slate-500 dark:text-slate-400"> — {step.message}</span> : null}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </EntityDialog>
  );
}

function Executions({ flowId, nodes }: { flowId: string; nodes: CanvasNode[] }) {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Execution[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => fetch(`/api/automations/${flowId}/executions${filter ? `?status=${filter}` : ""}`).then((response) => response.json()).then((data: { executions?: Execution[] }) => { if (active) setRows(data.executions ?? []); }).catch(() => { if (active) setRows([]); });
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [flowId, filter]);
  const label = (nodeId: string, type: string) => (type === "conversion" ? "Conversão do cliente" : NODE_DEF[type as NodeType]?.label ?? (nodes.find((node) => node.id === nodeId) ? NODE_DEF[nodes.find((node) => node.id === nodeId)!.data.kind].label : type));
  return (
    <div className="h-full space-y-3 overflow-y-auto p-4">
      <div className="flex flex-wrap gap-1.5">
        {[["", "Todas"], ["running", "Em andamento"], ["completed", "Concluídas"], ["failed", "Erros"], ["cancelled", "Interrompidas"]].map(([value, text]) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] font-semibold ${filter === value ? "border-[#051647] bg-[#051647] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{text}</button>
        ))}
        <span className="ml-auto self-center text-[10px] text-slate-400">Atualiza a cada 10 s</span>
      </div>
      {!rows ? <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</p> : rows.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-700">Nenhuma execução ainda.</p> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/70 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/40">
          {rows.map((row) => {
            const status = EXEC_LABEL[row.status] ?? EXEC_LABEL.running;
            const expanded = open === row.id;
            return (
              <li key={row.id}>
                <button type="button" onClick={() => setOpen(expanded ? null : row.id)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                  <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[#051647] dark:text-white">{row.contact.name}{row.contact.phone ? ` · ${row.contact.phone}` : ""}</span>
                    <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">Início {when(row.startedAt)}{row.status === "waiting" && row.resumeAt ? ` · retoma ${when(row.resumeAt)}` : ""}{row.finishedAt ? ` · fim ${when(row.finishedAt)}` : ""}{row.error ? ` · ${row.error}` : ""}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
                </button>
                {expanded && (
                  <ol className="space-y-1 border-t border-slate-100 bg-slate-50/60 px-4 py-2 dark:border-slate-800 dark:bg-white/[0.03]">
                    {row.steps.map((step) => (
                      <li key={step.id} className="flex items-start gap-2 text-[11px]">
                        {step.status === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : step.status === "waiting" ? <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" /> : step.status === "skipped" ? <SkipForward className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /> : step.status === "cancelled" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F7915E]" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
                        <span className="min-w-0 flex-1 break-words"><span className="font-semibold text-slate-700 dark:text-slate-200">{label(step.nodeId, step.nodeType)}</span>{step.message ? <span className="text-slate-500 dark:text-slate-400"> — {step.message}</span> : null}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{when(step.createdAt)}</span>
                      </li>
                    ))}
                    {row.conversationId && <li><Link href={`/chat?c=${row.conversationId}`} className="cursor-pointer text-[11px] font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">Abrir conversa</Link></li>}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Paleta lateral: categorias recolhíveis com animação e busca rápida de nós. */
function Palette({ onAdd }: { onAdd: (kind: NodeType) => void }) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<NodeCategory>>(() => new Set());
  const term = plain(query.trim());
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/70 md:flex dark:border-slate-800" aria-label="Paleta de nós">
      <div className="border-b border-slate-200/70 p-2 dark:border-slate-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nó" aria-label="Buscar nó" className={`${input} h-8 pl-7`} />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {NODE_CATEGORIES.map((category) => {
          const defs = NODE_DEFS.filter((def) => def.category === category.id && (!term || plain(`${def.label} ${def.description}`).includes(term)));
          if (!defs.length) return null;
          const open = !!term || !closed.has(category.id);
          return (
            <div key={category.id}>
              <button type="button" aria-expanded={open} onClick={() => setClosed((current) => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })} className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-[#051647] dark:text-slate-400 dark:hover:text-white">
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ease-in-out ${open ? "" : "-rotate-90"}`} />{category.label}<span className="ml-auto font-medium normal-case">{defs.length}</span>
              </button>
              <Collapse open={open}>
                <div className="space-y-1 pb-1.5">
                  {defs.map((def) => {
                    const Icon = ICONS[def.type];
                    return (
                      <button key={def.type} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-automation-node", def.type); event.dataTransfer.effectAllowed = "move"; }} onClick={() => onAdd(def.type)} title={def.description} className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-[#C4D600]">
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded ${HEADER[def.category]}`}><Icon className="h-3 w-3" /></span><span className="min-w-0 truncate">{def.label}</span>
                      </button>
                    );
                  })}
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function Editor({ flowId }: { flowId: string }) {
  const toast = useToast();
  const flowApi = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [options, setOptions] = useState<Options>({ queues: [], users: [] });
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<FlowSettings>({ cancelOnConversion: [], attributionDays: 7 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metrics, setMetrics] = useState<FlowMetrics | null>(null);
  const [showBadges, setShowBadges] = useState(true);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"editor" | "execucoes">("editor");
  const [testing, setTesting] = useState(false);
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  // Desfazer/refazer: fotos do canvas antes de cada mudança (edições seguidas no mesmo campo viram uma só).
  const latest = useRef<Snapshot>({ nodes: [], edges: [] });
  const history = useRef<{ past: Snapshot[]; future: Snapshot[]; key: string; at: number }>({ past: [], future: [], key: "", at: 0 });
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });

  useEffect(() => { latest.current = { nodes, edges }; }, [nodes, edges]);

  // Métricas do canvas: carregam ao abrir e atualizam a cada 30 s.
  useEffect(() => {
    let active = true;
    const load = () => fetch(`/api/automations/${flowId}/metrics`, { cache: "no-store" }).then((response) => (response.ok ? (response.json() as Promise<FlowMetrics>) : null)).then((body) => { if (active && body) setMetrics(body); }).catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [flowId]);

  useEffect(() => {
    let active = true;
    Promise.all([fetch(`/api/automations/${flowId}`).then(async (response) => { const data = (await response.json()) as { flow?: FlowData; error?: string }; if (!response.ok || !data.flow) throw new Error(data.error ?? "Automação não encontrada."); return data.flow; }), fetch("/api/automations/options").then((response) => response.json() as Promise<Options>).catch(() => ({ queues: [], users: [] }))])
      .then(([data, opts]) => {
        if (!active) return;
        OptionsContext.current = opts;
        OptionsContext.flowId = data.id;
        setOptions(opts);
        setFlow(data);
        setName(data.name);
        setSettings(data.settings ?? { cancelOnConversion: [], attributionDays: 7 });
        setNodes(data.nodes.map(toCanvas));
        setEdges(data.edges.map(toCanvasEdge));
        setSaved(JSON.stringify({ name: data.name, nodes: data.nodes, edges: data.edges, settings: data.settings ?? { cancelOnConversion: [], attributionDays: 7 } }));
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Erro ao carregar."); });
    return () => { active = false; };
  }, [flowId, setEdges, setNodes]);

  const record = useCallback((key = "") => {
    const now = Date.now();
    const current = history.current;
    if (key && key === current.key && now - current.at < 1500) { current.at = now; return; }
    current.past = [...current.past.slice(-49), latest.current];
    current.future = [];
    current.key = key;
    current.at = now;
    setHistorySize({ past: current.past.length, future: 0 });
  }, []);
  const undo = useCallback(() => {
    const current = history.current;
    const previous = current.past.at(-1);
    if (!previous) return;
    current.past = current.past.slice(0, -1);
    current.future = [...current.future, latest.current];
    current.key = "";
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setHistorySize({ past: current.past.length, future: current.future.length });
  }, [setEdges, setNodes]);
  const redo = useCallback(() => {
    const current = history.current;
    const next = current.future.at(-1);
    if (!next) return;
    current.future = current.future.slice(0, -1);
    current.past = [...current.past, latest.current];
    current.key = "";
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistorySize({ past: current.past.length, future: current.future.length });
  }, [setEdges, setNodes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === "y" || (key === "z" && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    if (changes.some((change) => change.type === "remove")) record();
    onNodesChangeBase(changes);
  }, [onNodesChangeBase, record]);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    if (changes.some((change) => change.type === "remove")) record();
    onEdgesChangeBase(changes);
  }, [onEdgesChangeBase, record]);

  const graph = useMemo(() => ({
    nodes: nodes.map((node) => ({ id: node.id, type: node.data.kind, position: { x: Math.round(node.position.x), y: Math.round(node.position.y) }, data: { config: node.data.config, ...(node.data.dir ? { dir: node.data.dir } : {}) } })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? null })),
  }), [nodes, edges]);
  const dirty = !!flow && JSON.stringify({ name, ...graph, settings }) !== saved;
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const triggers = nodes.filter((node) => isTrigger(node.data.kind));
  // Envios que podem sair fora da janela de 24 h (exigem modelo aprovado da Meta).
  const outsideWindow = useMemo(() => sendsOutsideWindow(graph), [graph]);
  const direction = nodes.some((node) => node.data.dir === "LR") ? "LR" : undefined;

  const onConnect = useCallback((connection: Connection) => {
    record();
    // Cada saída leva a um só passo (na condição, um para Sim e um para Não): nova conexão substitui a anterior.
    setEdges((current) => addEdge({ ...connection, id: `${connection.source}-${connection.sourceHandle ?? "out"}-${connection.target}`, ...branchStyle(connection.sourceHandle) }, current.filter((edge) => !(edge.source === connection.source && (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null)))));
  }, [setEdges, record]);

  // Vários gatilhos por fluxo: qualquer um que disparar inicia a execução a partir dele.
  const addNode = (kind: NodeType, position?: { x: number; y: number }) => {
    record();
    const bounds = wrapper.current?.getBoundingClientRect();
    const at = position ?? flowApi.screenToFlowPosition({ x: (bounds?.left ?? 0) + (bounds?.width ?? 600) / 2 - 120, y: (bounds?.top ?? 0) + (bounds?.height ?? 400) / 3 });
    const id = newNodeId(kind);
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), { id, type: "automation", position: at, selected: true, data: { kind, config: { ...NODE_DEF[kind].defaults }, ...(direction ? { dir: direction } : {}) } }]);
    setSelectedId(id);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/x-automation-node") as NodeType;
    if (kind && NODE_DEF[kind]) addNode(kind, flowApi.screenToFlowPosition({ x: event.clientX - 120, y: event.clientY - 20 }));
  };
  const updateConfig = (key: string, value: unknown) => {
    record(`cfg:${selectedId}:${key}`);
    setNodes((current) => current.map((node) => (node.id === selectedId ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } } : node)));
  };
  const removeSelected = () => {
    if (!selectedId) return;
    record();
    setNodes((current) => current.filter((node) => node.id !== selectedId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId));
    setSelectedId(null);
  };
  const organize = (dir: "TB" | "LR") => {
    record();
    setNodes((current) => autoLayout(current, latest.current.edges, dir));
    window.setTimeout(() => void flowApi.fitView({ padding: 0.3, maxZoom: 1, duration: 300 }), 50);
  };

  const save = async (status?: FlowStatus) => {
    if (!flow) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/automations/${flow.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, ...graph, settings, ...(status ? { status } : {}) }) });
      const data = (await response.json()) as { flow?: FlowData; error?: string; problems?: string[] };
      if (!response.ok || !data.flow) throw new Error(data.problems?.join(" ") ?? data.error ?? "Não foi possível salvar.");
      setFlow(data.flow);
      setSettings(data.flow.settings ?? { cancelOnConversion: [], attributionDays: 7 });
      setSaved(JSON.stringify({ name: data.flow.name, nodes: data.flow.nodes, edges: data.flow.edges, settings: data.flow.settings ?? { cancelOnConversion: [], attributionDays: 7 } }));
      toast.success(status === "active" ? "Automação ativada" : status === "paused" ? "Automação pausada" : "Automação salva", data.flow.name);
    } catch (cause) {
      toast.error("Não foi possível salvar", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  // Voltar / fechar o editor: volta para a lista na mesma guia "Automações"; com alterações não salvas, confirma antes.
  const exitEditor = () => (dirty ? setLeaving(true) : router.push("/automacoes"));
  const closePanel = () => {
    setSelectedId(null);
    setNodes((current) => current.map((node) => (node.selected ? { ...node, selected: false } : node)));
  };

  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">{error} <Link href="/automacoes" className="font-semibold underline">Voltar</Link></p>;
  if (!flow) return <p className="flex items-center gap-2 py-10 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando automação...</p>;
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/automacoes/${flow.webhookToken}` : "";
  const selectedFields = selected ? NODE_DEF[selected.data.kind].fields.filter((field) => {
    if (field.key === "keywords" && selected.data.config.mode !== "keywords") return false;
    if (selected.data.kind === "condition" && (field.key === "operator" || field.key === "value") && selected.data.config.field === "none") return false;
    if (field.key === "presenceSeconds" && selected.data.config.presenceMode !== "custom") return false;
    // Com modelo da Meta, o conteúdo é o do modelo: texto, mídia, áudio, links e digitando não se aplicam.
    if (selected.data.kind === "send_whatsapp" && readNodeTemplate(selected.data.config) && ["text", "mediaUrl", "audio", "trackLinks", "presenceMode", "presenceSeconds"].includes(field.key)) return false;
    if (field.key === "flowId" && selected.data.config.mode !== "goto") return false;
    if (selected.data.kind === "distribute_lead" && field.key === "userIds" && selected.data.config.pool !== "users") return false;
    if (selected.data.kind === "trigger_rfvp") {
      const mode = String(selected.data.config.mode ?? "segment");
      if (field.key === "segment" && mode !== "segment") return false;
      if (["pillar", "operator", "value"].includes(field.key) && mode !== "pillar") return false;
      if (field.key === "code" && mode !== "code") return false;
    }
    return true;
  }) : [];

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={exitEditor} title="Voltar para a lista de automações" aria-label="Voltar para automações" className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Automações</span></button>
        <Workflow className="h-5 w-5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Nome da automação" className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-lg font-bold text-[#051647] outline-none hover:border-slate-200 focus:border-[#002187] sm:max-w-md dark:text-white dark:hover:border-slate-700" maxLength={120} />
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${flow.status === "active" ? "bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]" : flow.status === "paused" ? "bg-[#F7915E]/15 text-[#9a4a1c] dark:text-[#F7915E]" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"}`}>{STATUS_LABEL[flow.status]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
            <button type="button" onClick={() => setView("editor")} className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${view === "editor" ? "bg-white text-[#051647] shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500"}`}><Workflow className="h-3.5 w-3.5" />Editor</button>
            <button type="button" onClick={() => setView("execucoes")} className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${view === "execucoes" ? "bg-white text-[#051647] shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500"}`}><History className="h-3.5 w-3.5" />Execuções</button>
          </div>
          {flow.status === "active" ? (
            <button type="button" disabled={saving} onClick={() => void save("paused")} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#F7915E] px-3 text-xs font-bold text-[#051647] hover:brightness-105 disabled:opacity-50"><Pause className="h-3.5 w-3.5" />Pausar</button>
          ) : (
            <button type="button" disabled={saving} onClick={() => void save("active")} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-3 text-xs font-bold text-[#051647] hover:brightness-105 disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Salvar e ativar</button>
          )}
          <button type="button" onClick={exitEditor} title="Fechar editor" aria-label="Fechar editor e voltar para automações" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <MetricsSummary metrics={metrics} visible={showBadges} onToggle={() => setShowBadges((value) => !value)} />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900/40">
        {view === "execucoes" ? <div className="min-w-0 flex-1"><Executions flowId={flow.id} nodes={nodes} /></div> : (
          <>
            <Palette onAdd={(kind) => addNode(kind)} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div role="toolbar" aria-label="Ferramentas do canvas" className="flex flex-wrap items-center gap-0.5 border-b border-slate-200/70 px-2 py-1 dark:border-slate-800">
                <button type="button" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!historySize.past} onClick={undo} className={toolBtn}><Undo2 className="h-4 w-4" /></button>
                <button type="button" title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled={!historySize.future} onClick={redo} className={toolBtn}><Redo2 className="h-4 w-4" /></button>
                <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
                <button type="button" title="Aumentar zoom" aria-label="Aumentar zoom" onClick={() => void flowApi.zoomIn({ duration: 200 })} className={toolBtn}><ZoomIn className="h-4 w-4" /></button>
                <button type="button" title="Diminuir zoom" aria-label="Diminuir zoom" onClick={() => void flowApi.zoomOut({ duration: 200 })} className={toolBtn}><ZoomOut className="h-4 w-4" /></button>
                <button type="button" title="Centralizar" aria-label="Centralizar" onClick={() => void flowApi.fitView({ padding: 0.3, maxZoom: 1, duration: 300 })} className={toolBtn}><Scan className="h-4 w-4" /></button>
                <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
                <button type="button" title="Auto-organizar na vertical" aria-label="Auto-organizar na vertical" disabled={!nodes.length} onClick={() => organize("TB")} className={toolBtn}><AlignVerticalSpaceAround className="h-4 w-4" /></button>
                <button type="button" title="Auto-organizar na horizontal" aria-label="Auto-organizar na horizontal" disabled={!nodes.length} onClick={() => organize("LR")} className={toolBtn}><AlignHorizontalSpaceAround className="h-4 w-4" /></button>
                <div className="ml-auto flex items-center gap-1.5">
                  <button type="button" onClick={() => setSettingsOpen(true)} title="Configurações da automação" className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5"><Settings2 className="h-3.5 w-3.5" />Configurações{settings.cancelOnConversion.length ? <span className="rounded-full bg-[#C4D600] px-1.5 text-[10px] text-[#051647]">{settings.cancelOnConversion.length}</span> : null}</button>
                  <button type="button" disabled={!triggers.length} onClick={() => setTesting(true)} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-[#002187] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5"><FlaskConical className="h-3.5 w-3.5" />Testar fluxo</button>
                  <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[#002187] px-3 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                    {dirty && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#F7915E]" />}{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Salvar
                  </button>
                </div>
              </div>
              <div ref={wrapper} className="relative min-h-0 flex-1" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={onDrop}>
                <MetricsContext.Provider value={showBadges ? metrics : null}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeDragStart={() => record()}
                  onSelectionChange={({ nodes: picked }) => setSelectedId(picked[0]?.id ?? null)}
                  onPaneClick={() => setSelectedId(null)}
                  deleteKeyCode={["Delete", "Backspace"]}
                  fitView
                  fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
                  proOptions={{ hideAttribution: true }}
                  defaultEdgeOptions={edgeStyle}
                >
                  <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} />
                  <MiniMap pannable zoomable className="!hidden sm:!block" nodeColor={(node) => (isTrigger((node.data as NodeData).kind) ? "#C4D600" : "#002187")} />
                </ReactFlow>
                </MetricsContext.Provider>
                {nodes.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
                    <p className="max-w-xs text-xs text-slate-400">Arraste um ou mais <b>gatilhos</b> da paleta (ou clique neles) para começar. Depois ligue os passos pelos pontos de conexão.</p>
                  </div>
                )}
              </div>
            </div>
            {selected && (
              <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200/70 dark:border-slate-800" aria-label="Configuração do nó">
                <div className={`flex items-center gap-2 px-3 py-2 text-xs font-bold ${HEADER[NODE_DEF[selected.data.kind].category]}`}>
                  {(() => { const Icon = ICONS[selected.data.kind]; return <Icon className="h-4 w-4" />; })()}
                  <span className="min-w-0 flex-1 truncate">{NODE_DEF[selected.data.kind].label}</span>
                  <button type="button" onClick={closePanel} aria-label="Fechar painel do passo" title="Fechar painel" className="grid h-6 w-6 cursor-pointer place-items-center rounded hover:bg-white/20"><X className="h-4 w-4" /></button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{NODE_DEF[selected.data.kind].description}</p>
                  {selected.data.kind === "trigger_webhook" && (
                    <div className="space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">URL única do webhook (POST)</span>
                      <div className="flex gap-1">
                        <input readOnly value={webhookUrl} aria-label="URL do webhook" className={`${input} font-mono text-[10px]`} />
                        <button type="button" title="Copiar URL" aria-label="Copiar URL" onClick={() => { void navigator.clipboard?.writeText(webhookUrl); toast.success("URL copiada", "Cole no Meta Ads, Google Ads, Typeform, Zapier ou na landing page."); }} className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><Copy className="h-4 w-4" /></button>
                      </div>
                      <span className="block text-[10px] text-slate-400">Aceita JSON ou formulário. O token na URL é o segredo: não publique. Campos viram {"{{campo}}"} ({"{{utm_source}}"}, {"{{email}}"}, {"{{origem}}"}...).</span>
                      <WebhookListener key={selected.id} flowId={flow.id} config={selected.data.config} onMap={(key, path) => updateConfig(key, path)} />
                    </div>
                  )}
                  {selected.data.kind === "condition" ? (
                    <ConditionEditor config={selected.data.config} onChange={updateConfig} />
                  ) : selectedFields.map((field) => (
                    <Field key={field.key} field={field} value={selected.data.config[field.key]} options={options} nodeConfig={selected.data.config} nodeKind={selected.data.kind} onChange={(value) => updateConfig(field.key, value)} />
                  ))}
                  {((selected.data.kind === "send_whatsapp" && outsideWindow.has(selected.id)) || selected.data.kind === "send_nps") && !readNodeTemplate(selected.data.config) && (
                    <div role="alert" className="space-y-2 rounded-lg border border-[#F7915E]/50 bg-[#F7915E]/10 p-2.5 text-[11px] text-[#9a3d12] dark:text-[#F7915E]">
                      <p className="flex items-start gap-1.5 font-semibold"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />Modelo oficial da Meta obrigatório</p>
                      <p>{selected.data.kind === "send_nps" ? "Com a janela de 24 h aberta, a pesquisa sai como lista interativa (botão “Avaliar agora”); fechada, sai pelo modelo oficial" : `Este envio pode sair fora da janela de 24 h: ${outsideWindow.get(selected.id)}`}. A Meta bloqueia texto livre fora da janela, então a automação só pode ser ativada com um modelo aprovado vinculado acima.</p>
                      <p className="flex flex-wrap gap-x-3 gap-y-1">
                        <a href={selected.data.kind === "send_nps" ? `/modelos?preset=${NPS_TEMPLATES[isNpsSurveyType(selected.data.config.surveyType) ? selected.data.config.surveyType : "ATENDIMENTO"].name}` : "/modelos"} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold underline cursor-pointer"><ExternalLink className="h-3 w-3" />{selected.data.kind === "send_nps" ? `Criar o modelo pronto de NPS (${NPS_SURVEY_LABELS[isNpsSurveyType(selected.data.config.surveyType) ? selected.data.config.surveyType : "ATENDIMENTO"].toLowerCase()})` : "Criar modelo em Modelos"}</a>
                        <span>Depois da aprovação, clique em “Atualizar lista” no seletor.</span>
                      </p>
                    </div>
                  )}
                  {VAR_TARGET[selected.data.kind] && (
                    <VariablesPicker triggers={triggers.map((node) => node.data.kind)} onPick={(variable) => { const key = VAR_TARGET[selected.data.kind]!; const current = String(selected.data.config[key] ?? ""); updateConfig(key, `${current}${current && !current.endsWith(" ") ? " " : ""}{{${variable}}}`); }} />
                  )}
                  <FiltersEditor key={selected.id} kind={selected.data.kind} filters={readFilters(selected.data.config)} options={options} onChange={(filters) => updateConfig("filters", filters)} />
                </div>
                <div className="border-t border-slate-200/70 p-3 dark:border-slate-800">
                  <button type="button" onClick={removeSelected} className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />Remover passo</button>
                </div>
              </aside>
            )}
          </>
        )}
      </div>
      {testing && <TestDialog flowId={flow.id} graph={graph} triggers={triggers} onClose={() => setTesting(false)} />}
      {settingsOpen && (
        <EntityDialog titleId="config-fluxo" title="Configurações da automação" description="Valem para todos os contatos deste fluxo. Salve a automação para aplicar." onClose={() => setSettingsOpen(false)} size="md">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[#051647] dark:text-white">Cancelar automaticamente se o cliente converter</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Assim que a conversão acontece, os passos futuros (esperas, follow-ups) do contato são abortados e a execução aparece como Interrompida no histórico.</p>
            {CONVERSION_KINDS.map((kind) => {
              const checked = settings.cancelOnConversion.includes(kind.value);
              return (
                <label key={kind.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5">
                  <input type="checkbox" checked={checked} onChange={() => setSettings((current) => ({ ...current, cancelOnConversion: checked ? current.cancelOnConversion.filter((item) => item !== kind.value) : [...current.cancelOnConversion, kind.value as ConversionKind] }))} className="h-4 w-4 cursor-pointer accent-[#002187]" />
                  {kind.label}
                </label>
              );
            })}
            <div className="space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="text-xs font-semibold text-[#051647] dark:text-white">Janela de atribuição de vendas</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Uma venda faturada no VMSet conta para os passos por onde o cliente passou nos dias anteriores à compra (badge Vendas no canvas).</p>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                <input type="number" min={1} max={MAX_ATTRIBUTION_DAYS} value={settings.attributionDays} onChange={(event) => setSettings((current) => ({ ...current, attributionDays: Math.min(MAX_ATTRIBUTION_DAYS, Math.max(1, Math.round(Number(event.target.value) || 1))) }))} aria-label="Dias da janela de atribuição" className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                dias após a interação na automação
              </label>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setSettingsOpen(false)} className="h-9 cursor-pointer rounded-lg bg-[#002187] px-4 text-xs font-semibold text-white hover:bg-[#051647]">Concluir</button>
            </div>
          </div>
        </EntityDialog>
      )}
      {leaving && <ConfirmDialog variant="destructive" title="Sair sem salvar?" description="Há alterações no fluxo que ainda não foram salvas. Se sair agora, elas serão descartadas." confirmLabel="Descartar e sair" cancelLabel="Continuar editando" onClose={() => setLeaving(false)} onConfirm={() => { setLeaving(false); router.push("/automacoes"); }} />}
    </div>
  );
}

type WebhookSampleResponse = { sample: { receivedAt: string; fields: Record<string, string> } | null; guess: Record<"phone" | "name" | "email" | "source", string> | null };
const MAP_TARGETS = [
  { key: "phoneField", guess: "phone", label: "Telefone" },
  { key: "nameField", guess: "name", label: "Nome" },
  { key: "emailField", guess: "email", label: "E-mail" },
  { key: "sourceField", guess: "source", label: "Origem / UTM" },
] as const;

/**
 * "Escutar evento de teste": limpa a amostra, espera o próximo POST na URL (até 3 min) e mostra os campos do JSON
 * para mapear telefone, nome, e-mail e origem com um clique (o palpite automático já vem marcado).
 */
function WebhookListener({ flowId, config, onMap }: { flowId: string; config: Record<string, unknown>; onMap: (key: string, path: string) => void }) {
  const toast = useToast();
  const [listening, setListening] = useState(false);
  const [data, setData] = useState<WebhookSampleResponse | null>(null);
  const latestMap = useRef({ config, onMap });
  useEffect(() => { latestMap.current = { config, onMap }; });

  useEffect(() => {
    void fetch(`/api/automations/${flowId}/webhook-sample`, { cache: "no-store" }).then((response) => (response.ok ? (response.json() as Promise<WebhookSampleResponse>) : null)).then((body) => body && setData(body)).catch(() => undefined);
  }, [flowId]);

  useEffect(() => {
    if (!listening) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 3 * 60 * 1000) { setListening(false); toast.error("Nenhum evento recebido", "Envie um lead de teste para a URL e tente de novo."); return; }
      const body = await fetch(`/api/automations/${flowId}/webhook-sample`, { cache: "no-store" }).then((response) => (response.ok ? (response.json() as Promise<WebhookSampleResponse>) : null)).catch(() => null);
      if (!body?.sample) return;
      setData(body);
      setListening(false);
      // Palpite automático só onde o campo ainda não foi mapeado.
      for (const target of MAP_TARGETS) if (!String(latestMap.current.config[target.key] ?? "") && body.guess?.[target.guess]) latestMap.current.onMap(target.key, body.guess[target.guess]);
      toast.success("Evento de teste recebido", `${Object.keys(body.sample.fields).length} campos. Confira o mapeamento e salve.`);
    }, 2500);
    return () => clearInterval(timer);
  }, [listening, flowId, toast]);

  const listen = async () => {
    await fetch(`/api/automations/${flowId}/webhook-sample`, { method: "DELETE" }).catch(() => undefined);
    setData(null);
    setListening(true);
  };

  const fields = data?.sample ? Object.entries(data.sample.fields) : [];
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
      <button type="button" onClick={() => (listening ? setListening(false) : void listen())} className={`inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold ${listening ? "bg-[#F7915E]/20 text-[#9a4a1c] dark:text-[#F7915E]" : "bg-[#002187] text-white hover:bg-[#051647]"}`}>
        {listening ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Escutando... envie um lead de teste (parar)</> : <><Radio className="h-3.5 w-3.5" />Escutar evento de teste</>}
      </button>
      {data?.sample && (
        <>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Último evento: {new Date(data.sample.receivedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Clique no rótulo para mapear o campo.</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {fields.map(([path, value]) => (
              <li key={path} className="min-w-0 rounded border border-slate-100 px-1.5 py-1 dark:border-slate-800">
                <p className="break-words font-mono text-[10px] font-semibold text-[#051647] dark:text-white">{path}</p>
                <p className="break-words text-[10px] text-slate-500 dark:text-slate-400">{value.slice(0, 120) || "(vazio)"}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {MAP_TARGETS.map((target) => {
                    const active = String(config[target.key] ?? "") === path;
                    return <button key={target.key} type="button" onClick={() => onMap(target.key, active ? "" : path)} aria-pressed={active} className={`cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-bold ${active ? "bg-[#C4D600] text-[#051647]" : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"}`}>{target.label}</button>;
                  })}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Resumo consolidado do fluxo no topo do editor (leads, ativos, entregas, respostas, vendas e receita). */
function MetricsSummary({ metrics, visible, onToggle }: { metrics: FlowMetrics | null; visible: boolean; onToggle: () => void }) {
  const summary = metrics?.summary;
  const money = (summary?.revenue ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const items = summary ? [
    { icon: Users, label: "Leads", value: compactCount(summary.leads), title: `${summary.leads} contatos entraram no fluxo (${summary.executions} execuções)` },
    { icon: Hourglass, label: "Em andamento", value: compactCount(summary.active), title: "Execuções rodando ou aguardando" },
    { icon: CheckCircle2, label: "Concluídos", value: compactCount(summary.completed), title: `${summary.failed} com erro` },
    { icon: MessageSquare, label: "Entregues", value: compactCount(summary.delivered), title: "Mensagens do fluxo entregues no WhatsApp" },
    { icon: MessageCircle, label: "Responderam", value: `${compactCount(summary.replied)} (${percent(summary.replied, summary.leads)}%)`, title: "Contatos que responderam a uma mensagem do fluxo" },
    { icon: ShoppingBag, label: "Vendas", value: `${summary.sales} · ${money}`, title: `Vendas do VMSet até ${summary.attributionDays} dias após a interação` },
  ] : [];
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/70 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900/40" aria-label="Resumo do fluxo">
      <TrendingUp className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
      {!summary ? <span className="text-[11px] text-slate-400">Carregando métricas...</span> : items.map((item) => (
        <span key={item.label} title={item.title} className="inline-flex min-w-0 items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-white/5 dark:text-slate-300">
          <item.icon className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />{item.label}<b className="text-[#051647] dark:text-white">{item.value}</b>
        </span>
      ))}
      <button type="button" onClick={onToggle} aria-pressed={visible} className="ml-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-[#002187] hover:bg-slate-50 dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5">{visible ? "Ocultar badges" : "Mostrar badges"}</button>
    </div>
  );
}

/** Editor visual da automação (canvas estilo n8n) com histórico de execuções. */
export function FlowEditor({ flowId }: { flowId: string }) {
  return (
    <ReactFlowProvider>
      <Editor flowId={flowId} />
    </ReactFlowProvider>
  );
}
