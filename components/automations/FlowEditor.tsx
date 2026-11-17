"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
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
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle, ArrowLeft, Bell, Bot, CheckCircle2, ChevronRight, Clock, Copy, GitBranch, Globe, History, Kanban, Loader2, MessageCircle, MessageSquare, Pause, Play, PlusCircle, Save, ShieldOff, Tag, Tags, Timer, Trash2, UserPlus, UserX, Webhook, Workflow, X, XCircle, Zap,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { NODE_DEF, NODE_DEFS, STAGE_OPTIONS, isTrigger, type FieldDef, type FlowEdge, type FlowNode, type NodeCategory, type NodeType } from "@/lib/automations/nodes";

type FlowStatus = "draft" | "active" | "paused";
type FlowData = { id: string; name: string; description: string; status: FlowStatus; webhookToken: string; nodes: FlowNode[]; edges: FlowEdge[] };
type Options = { queues: { id: string; name: string }[]; users: { id: string; name: string }[] };
type NodeData = { kind: NodeType; config: Record<string, unknown> };
type CanvasNode = Node<NodeData, "automation">;
type Step = { id: string; nodeId: string; nodeType: string; status: string; message: string; createdAt: string };
type Execution = { id: string; status: string; currentNodeId: string | null; resumeAt: string | null; error: string | null; startedAt: string; finishedAt: string | null; conversationId: string | null; contact: { id: string; name: string; phone: string | null }; steps: Step[] };

const ICONS: Record<NodeType, typeof Zap> = {
  trigger_message: MessageCircle, trigger_stage: Kanban, trigger_tag: Tag, trigger_inactive: UserX, trigger_webhook: Webhook,
  send_whatsapp: MessageSquare, delay: Timer, ai_agent: Bot, move_stage: Kanban, create_opportunity: PlusCircle, add_tag: Tags, remove_tag: Tag, assign: UserPlus, notify: Bell, opt_out: ShieldOff, condition: GitBranch, http: Globe,
};
const CATEGORIES: { id: NodeCategory; label: string }[] = [
  { id: "gatilho", label: "Gatilhos" },
  { id: "mensagem", label: "Mensagem e tempo" },
  { id: "crm", label: "CRM e funil" },
  { id: "logica", label: "Lógica e integração" },
];
const HEADER: Record<NodeCategory, string> = {
  gatilho: "bg-[#C4D600] text-[#051647]",
  mensagem: "bg-[#002187] text-white",
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
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "");

/** Resumo de uma linha da configuração, mostrado no cartão do nó. */
function summary(kind: NodeType, config: Record<string, unknown>, options: Options): string {
  const stage = (value: unknown) => STAGE_OPTIONS.find((item) => item.value === value)?.label ?? String(value ?? "");
  switch (kind) {
    case "trigger_message": return config.mode === "keywords" ? `Palavras: ${(Array.isArray(config.keywords) ? config.keywords : []).join(", ") || "(nenhuma)"}` : "Qualquer mensagem";
    case "trigger_stage": case "move_stage": return stage(config.stage);
    case "trigger_tag": case "add_tag": case "remove_tag": return String(config.tag || "(sem tag)");
    case "trigger_inactive": return `${Number(config.days) || 0} dias sem contato`;
    case "trigger_webhook": return "POST na URL do fluxo";
    case "send_whatsapp": return String(config.text || "(mensagem vazia)");
    case "delay": return `${Number(config.amount) || 0} ${config.unit === "minutes" ? "min" : config.unit === "days" ? "dia(s)" : "hora(s)"}${config.businessHours ? " · horário comercial" : ""}`;
    case "ai_agent": return String(config.objective || "Atendimento pela IA");
    case "assign": return options.queues.find((queue) => queue.id === config.queueId)?.name ?? "(escolha a fila)";
    case "notify": return String(config.title || "Notificação");
    case "condition": return `${String(config.field)} ${String(config.operator)} ${String(config.value ?? "")}`.trim();
    case "http": return `${String(config.method)} ${String(config.url || "(sem URL)")}`;
    case "create_opportunity": return "Novo lead (se não houver aberta)";
    case "opt_out": return "Fora das campanhas (LGPD)";
    default: return "";
  }
}

const OptionsContext = { current: { queues: [], users: [] } as Options };

const AutomationNode = memo(function AutomationNode({ data, selected }: NodeProps<CanvasNode>) {
  const def = NODE_DEF[data.kind];
  const Icon = ICONS[data.kind] ?? Zap;
  return (
    <div className={`w-[240px] rounded-xl border bg-white shadow-md dark:bg-[#07194f] ${selected ? "border-[#002187] ring-2 ring-[#002187]/30 dark:border-[#C4D600] dark:ring-[#C4D600]/30" : "border-slate-200 dark:border-slate-700"}`}>
      {!isTrigger(data.kind) && <Handle type="target" position={Position.Top} className={handleCls} />}
      <div className={`flex items-center gap-2 rounded-t-[11px] px-3 py-1.5 text-[11px] font-bold ${HEADER[def.category]}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{def.label}</span>
        {isTrigger(data.kind) && <span className="ml-auto rounded bg-white/40 px-1 text-[9px] uppercase">início</span>}
      </div>
      <p className="line-clamp-2 break-words px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">{summary(data.kind, data.config, OptionsContext.current)}</p>
      {data.kind === "condition" ? (
        <>
          <Handle id="true" type="source" position={Position.Bottom} style={{ left: "28%" }} className="!h-3 !w-3 !border-2 !border-white !bg-emerald-500" />
          <Handle id="false" type="source" position={Position.Bottom} style={{ left: "72%" }} className="!h-3 !w-3 !border-2 !border-white !bg-red-500" />
          <div className="flex justify-between px-6 pb-1 text-[9px] font-bold uppercase"><span className="text-emerald-600">Sim</span><span className="text-red-600">Não</span></div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className={handleCls} />
      )}
    </div>
  );
});

const nodeTypes = { automation: AutomationNode };
const edgeStyle = { markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 }, style: { strokeWidth: 2 } };

let nodeSeq = 0;
const newNodeId = (kind: NodeType) => `${kind.replace(/_/g, "-")}-${Date.now().toString(36)}${(nodeSeq += 1).toString(36)}`;

const toCanvas = (node: FlowNode): CanvasNode => ({ id: node.id, type: "automation", position: node.position, data: { kind: node.type, config: node.data.config } });
const toCanvasEdge = (edge: FlowEdge): Edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? null, ...edgeStyle, ...(edge.sourceHandle ? { label: edge.sourceHandle === "true" ? "Sim" : "Não" } : {}) });

function Field({ field, value, onChange, options }: { field: FieldDef; value: unknown; onChange: (value: unknown) => void; options: Options }) {
  const label = <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">{field.label}</span>;
  const hint = field.hint ? <span className="block text-[10px] text-slate-400">{field.hint}</span> : null;
  if (field.kind === "boolean") {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{field.label}</span>
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 cursor-pointer accent-[#002187]" />
      </label>
    );
  }
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
  return <label className="block space-y-1">{label}<input type={field.kind === "number" ? "number" : "text"} value={String(value ?? "")} placeholder={"placeholder" in field ? field.placeholder : undefined} onChange={(event) => onChange(field.kind === "number" ? Number(event.target.value) : event.target.value)} className={input} />{hint}</label>;
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
  const label = (nodeId: string, type: string) => (NODE_DEF[type as NodeType]?.label ?? (nodes.find((node) => node.id === nodeId) ? NODE_DEF[nodes.find((node) => node.id === nodeId)!.data.kind].label : type));
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
                        {step.status === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : step.status === "waiting" ? <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" /> : step.status === "cancelled" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F7915E]" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
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

function Editor({ flowId }: { flowId: string }) {
  const toast = useToast();
  const flowApi = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [options, setOptions] = useState<Options>({ queues: [], users: [] });
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"editor" | "execucoes">("editor");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetch(`/api/automations/${flowId}`).then(async (response) => { const data = (await response.json()) as { flow?: FlowData; error?: string }; if (!response.ok || !data.flow) throw new Error(data.error ?? "Automação não encontrada."); return data.flow; }), fetch("/api/automations/options").then((response) => response.json() as Promise<Options>).catch(() => ({ queues: [], users: [] }))])
      .then(([data, opts]) => {
        if (!active) return;
        OptionsContext.current = opts;
        setOptions(opts);
        setFlow(data);
        setName(data.name);
        setNodes(data.nodes.map(toCanvas));
        setEdges(data.edges.map(toCanvasEdge));
        setSaved(JSON.stringify({ name: data.name, nodes: data.nodes, edges: data.edges }));
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Erro ao carregar."); });
    return () => { active = false; };
  }, [flowId, setEdges, setNodes]);

  const graph = useMemo(() => ({
    nodes: nodes.map((node) => ({ id: node.id, type: node.data.kind, position: { x: Math.round(node.position.x), y: Math.round(node.position.y) }, data: { config: node.data.config } })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? null })),
  }), [nodes, edges]);
  const dirty = !!flow && JSON.stringify({ name, ...graph }) !== saved;
  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  const onConnect = useCallback((connection: Connection) => {
    // Cada saída leva a um só passo (na condição, um para Sim e um para Não): nova conexão substitui a anterior.
    setEdges((current) => addEdge({ ...connection, id: `${connection.source}-${connection.sourceHandle ?? "out"}-${connection.target}`, ...edgeStyle, ...(connection.sourceHandle ? { label: connection.sourceHandle === "true" ? "Sim" : "Não" } : {}) }, current.filter((edge) => !(edge.source === connection.source && (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null)))));
  }, [setEdges]);

  const addNode = (kind: NodeType, position?: { x: number; y: number }) => {
    if (isTrigger(kind) && nodes.some((node) => isTrigger(node.data.kind))) {
      toast.error("Um gatilho por fluxo", "Remova o gatilho atual para trocar.");
      return;
    }
    const bounds = wrapper.current?.getBoundingClientRect();
    const at = position ?? flowApi.screenToFlowPosition({ x: (bounds?.left ?? 0) + (bounds?.width ?? 600) / 2 - 120, y: (bounds?.top ?? 0) + (bounds?.height ?? 400) / 3 });
    const id = newNodeId(kind);
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), { id, type: "automation", position: at, selected: true, data: { kind, config: { ...NODE_DEF[kind].defaults } } }]);
    setSelectedId(id);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/x-automation-node") as NodeType;
    if (kind && NODE_DEF[kind]) addNode(kind, flowApi.screenToFlowPosition({ x: event.clientX - 120, y: event.clientY - 20 }));
  };
  const updateConfig = (key: string, value: unknown) => setNodes((current) => current.map((node) => (node.id === selectedId ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } } : node)));
  const removeSelected = () => {
    if (!selectedId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId));
    setSelectedId(null);
  };

  const save = async (status?: FlowStatus) => {
    if (!flow) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/automations/${flow.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, ...graph, ...(status ? { status } : {}) }) });
      const data = (await response.json()) as { flow?: FlowData; error?: string; problems?: string[] };
      if (!response.ok || !data.flow) throw new Error(data.problems?.join(" ") ?? data.error ?? "Não foi possível salvar.");
      setFlow(data.flow);
      setSaved(JSON.stringify({ name: data.flow.name, nodes: data.flow.nodes, edges: data.flow.edges }));
      toast.success(status === "active" ? "Automação ativada" : status === "paused" ? "Automação pausada" : "Automação salva", data.flow.name);
    } catch (cause) {
      toast.error("Não foi possível salvar", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">{error} <Link href="/automacoes" className="font-semibold underline">Voltar</Link></p>;
  if (!flow) return <p className="flex items-center gap-2 py-10 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando automação...</p>;
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/automations/webhook/${flow.id}?token=${flow.webhookToken}` : "";

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/automacoes" title="Voltar" aria-label="Voltar para automações" className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"><ArrowLeft className="h-4 w-4" /></Link>
        <Workflow className="h-5 w-5 text-[#002187] dark:text-[#C4D600]" />
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Nome da automação" className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-lg font-bold text-[#051647] outline-none hover:border-slate-200 focus:border-[#002187] sm:max-w-md dark:text-white dark:hover:border-slate-700" maxLength={120} />
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${flow.status === "active" ? "bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]" : flow.status === "paused" ? "bg-[#F7915E]/15 text-[#9a4a1c] dark:text-[#F7915E]" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"}`}>{STATUS_LABEL[flow.status]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
            <button type="button" onClick={() => setView("editor")} className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${view === "editor" ? "bg-white text-[#051647] shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500"}`}><Workflow className="h-3.5 w-3.5" />Editor</button>
            <button type="button" onClick={() => setView("execucoes")} className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${view === "execucoes" ? "bg-white text-[#051647] shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500"}`}><History className="h-3.5 w-3.5" />Execuções</button>
          </div>
          <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5">
            {dirty && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#F7915E]" />}<Save className="h-3.5 w-3.5" />Salvar
          </button>
          {flow.status === "active" ? (
            <button type="button" disabled={saving} onClick={() => void save("paused")} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#F7915E] px-3 text-xs font-bold text-[#051647] hover:brightness-105 disabled:opacity-50"><Pause className="h-3.5 w-3.5" />Pausar</button>
          ) : (
            <button type="button" disabled={saving} onClick={() => void save("active")} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-3 text-xs font-bold text-[#051647] hover:brightness-105 disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Salvar e ativar</button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900/40">
        {view === "execucoes" ? <div className="min-w-0 flex-1"><Executions flowId={flow.id} nodes={nodes} /></div> : (
          <>
            <aside className="hidden w-56 shrink-0 space-y-3 overflow-y-auto border-r border-slate-200/70 p-3 md:block dark:border-slate-800" aria-label="Paleta de nós">
              {CATEGORIES.map((category) => (
                <div key={category.id}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{category.label}</p>
                  <div className="space-y-1">
                    {NODE_DEFS.filter((def) => def.category === category.id).map((def) => {
                      const Icon = ICONS[def.type];
                      return (
                        <button key={def.type} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-automation-node", def.type); event.dataTransfer.effectAllowed = "move"; }} onClick={() => addNode(def.type)} title={def.description} className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-[#C4D600]">
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded ${HEADER[def.category]}`}><Icon className="h-3 w-3" /></span><span className="min-w-0 truncate">{def.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </aside>
            <div ref={wrapper} className="relative min-w-0 flex-1" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={onDrop}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onSelectionChange={({ nodes: picked }) => setSelectedId(picked[0]?.id ?? null)}
                onPaneClick={() => setSelectedId(null)}
                deleteKeyCode={["Delete", "Backspace"]}
                fitView
                fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={edgeStyle}
              >
                <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable className="!hidden sm:!block" nodeColor={(node) => (isTrigger((node.data as NodeData).kind) ? "#C4D600" : "#002187")} />
              </ReactFlow>
              {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
                  <p className="max-w-xs text-xs text-slate-400">Arraste um <b>gatilho</b> da paleta (ou clique nele) para começar. Depois ligue os passos pelos pontos de conexão.</p>
                </div>
              )}
            </div>
            {selected && (
              <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200/70 dark:border-slate-800" aria-label="Configuração do nó">
                <div className={`flex items-center gap-2 px-3 py-2 text-xs font-bold ${HEADER[NODE_DEF[selected.data.kind].category]}`}>
                  {(() => { const Icon = ICONS[selected.data.kind]; return <Icon className="h-4 w-4" />; })()}
                  <span className="min-w-0 flex-1 truncate">{NODE_DEF[selected.data.kind].label}</span>
                  <button type="button" onClick={() => setSelectedId(null)} aria-label="Fechar painel" className="grid h-6 w-6 cursor-pointer place-items-center rounded hover:bg-white/20"><X className="h-4 w-4" /></button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{NODE_DEF[selected.data.kind].description}</p>
                  {selected.data.kind === "trigger_webhook" && (
                    <div className="space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">URL do webhook (POST)</span>
                      <div className="flex gap-1">
                        <input readOnly value={webhookUrl} className={`${input} font-mono text-[10px]`} />
                        <button type="button" title="Copiar URL" aria-label="Copiar URL" onClick={() => { void navigator.clipboard?.writeText(webhookUrl); toast.success("URL copiada", "Envie { \"telefone\": \"...\" } no corpo."); }} className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><Copy className="h-4 w-4" /></button>
                      </div>
                      <span className="block text-[10px] text-slate-400">Corpo JSON: {"{ \"telefone\": \"62999990000\", \"campo\": \"valor\" }"}. Campos viram {"{{campo}}"}.</span>
                    </div>
                  )}
                  {NODE_DEF[selected.data.kind].fields.map((field) => (
                    (field.key === "keywords" && selected.data.config.mode !== "keywords") ? null :
                      <Field key={field.key} field={field} value={selected.data.config[field.key]} options={options} onChange={(value) => updateConfig(field.key, value)} />
                  ))}
                </div>
                <div className="border-t border-slate-200/70 p-3 dark:border-slate-800">
                  <button type="button" onClick={removeSelected} className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />Remover passo</button>
                </div>
              </aside>
            )}
          </>
        )}
      </div>
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
