"use client";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronDown, ChevronUp, LayoutGrid, ListTree, MessageCircle, Play, Plus, Save, Trash2, X, Zap } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { MessageField, SwitchRow, fieldClass, labelClass } from "@/components/chat/MenuFormParts";
import { CUSTOMER_VARIABLES, MenuOptionFields, menuActionSummary, type MenuPeople } from "@/components/chat/MenuOptionFields";
import { ROOT_NODE, START_NODE, addDraft, buildGraph, connectOption, disconnectOption, findOption, organizeNodes, removeNode, removeOption, updateOption, type GraphNode } from "@/lib/chat/menu-graph";
import { addToTree, moveInTree, newMenuOption, type ChatMenuSettings, type MenuOption } from "@/lib/chat/settings";

const BRAND_GREEN = "#C4D600";
const MAX_OPTIONS = 20;
const handleClass = "!h-3 !w-3 !border-2 !border-white !bg-[#C4D600] dark:!border-[#07194f]";
// Sem overflow-hidden no cartão: os pontos de saída ficam metade para fora dele.
const card = "w-[300px] rounded-xl border bg-white shadow-md dark:bg-[#07194f]";
const header = "flex items-center gap-2 rounded-t-[11px] bg-[#051647] px-3 py-2 text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]";
const toolButton = "inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/10";

const cardBorder = (selected: boolean, draft: boolean) =>
  `${selected ? "border-[#C4D600] ring-2 ring-[#C4D600]/40" : "border-slate-200 dark:border-slate-700"} ${draft ? "border-dashed" : ""}`;

type StartData = { kind: "start"; greeting: string };
type MenuData = { kind: "menu"; title: string; text: string; rows: MenuOption[]; prefix: string; draft: boolean };
type ActionData = { kind: "action"; option: MenuOption; prefix: string; draft: boolean };
type FlowNode = Node<StartData, "start"> | Node<MenuData, "menu"> | Node<ActionData, "action">;

const PeopleContext = createContext<{ queues: MenuPeople; agents: MenuPeople }>({ queues: [], agents: [] });

const StartNode = memo(function StartNode({ data, selected }: NodeProps<Node<StartData, "start">>) {
  return (
    <div className={`${card} ${cardBorder(selected, false)}`}>
      <div className={header}><Play className="h-3.5 w-3.5 text-[#C4D600] dark:text-[#051647]" />Início</div>
      <p className="line-clamp-4 whitespace-pre-wrap p-3 text-xs text-slate-700 dark:text-slate-200">{data.greeting || "Saudação vazia"}</p>
      <Handle type="source" id={START_NODE} position={Position.Right} isConnectable={false} className={handleClass} />
    </div>
  );
});

const MenuNode = memo(function MenuNode({ id, data, selected }: NodeProps<Node<MenuData, "menu">>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const rowIds = data.rows.map((row) => row.id).join();
  useEffect(() => updateNodeInternals(id), [id, rowIds, updateNodeInternals]);

  return (
    <div className={`${card} ${cardBorder(selected, data.draft)}`}>
      <Handle type="target" position={Position.Left} isConnectable={id !== ROOT_NODE} className={handleClass} />
      <div className={header}><ListTree className="h-3.5 w-3.5" /><span className="truncate">{data.prefix && `${data.prefix} · `}{data.title}</span></div>
      {data.text && <p className="line-clamp-2 whitespace-pre-wrap px-3 pt-2 text-xs text-slate-600 dark:text-slate-300">{data.text}</p>}
      {data.rows.length === 0 ? (
        <p className="p-3 text-xs text-slate-500 dark:text-slate-400">Sem opções. Clique para adicionar.</p>
      ) : (
        <ul className="py-1">
          {data.rows.map((row, index) => (
            <li key={row.id} className="relative flex h-10 items-center gap-2 px-3 text-xs text-slate-800 dark:text-slate-100">
              <span className="grid h-5 min-w-5 place-items-center rounded bg-[#C4D600]/30 font-bold text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{row.label || "Sem rótulo"}</span>
              {row.action === "none" && <span className="shrink-0 text-[10px] font-semibold text-[#F7915E]">sem destino</span>}
              <Handle type="source" id={row.id} position={Position.Right} className={handleClass} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

const ActionNode = memo(function ActionNode({ data, selected }: NodeProps<Node<ActionData, "action">>) {
  const { queues, agents } = useContext(PeopleContext);
  const { option } = data;
  return (
    <div className={`${card} ${cardBorder(selected, data.draft)}`}>
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className={header}><Zap className="h-3.5 w-3.5" /><span className="truncate">{data.prefix && `${data.prefix} · `}{option.label || "Ação"}</span></div>
      <div className="space-y-1 p-3">
        <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{menuActionSummary(option, queues, agents)}</p>
        {option.text && <p className="line-clamp-2 flex gap-1.5 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300"><MessageCircle className="mt-0.5 h-3 w-3 shrink-0" style={{ color: BRAND_GREEN }} />{option.text}</p>}
      </div>
    </div>
  );
});

const nodeTypes = { start: StartNode, menu: MenuNode, action: ActionNode };

function toFlowNode(node: GraphNode, settings: ChatMenuSettings): FlowNode {
  const base = { id: node.id, position: node.position };
  if (node.kind === "start") return { ...base, type: "start", deletable: false, data: { kind: "start", greeting: settings.greeting } };
  if (node.kind === "menu") {
    return {
      ...base,
      type: "menu",
      deletable: node.id !== ROOT_NODE,
      data: { kind: "menu", title: node.option ? node.option.label || "Submenu" : "Menu principal", text: node.option?.text ?? "", rows: node.rows, prefix: node.prefix, draft: node.draft },
    };
  }
  return { ...base, type: "action", data: { kind: "action", option: node.option, prefix: node.prefix, draft: node.draft } };
}

const useDarkMode = () =>
  useSyncExternalStore(
    (notify) => {
      const observer = new MutationObserver(notify);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

type Props = {
  settings: ChatMenuSettings;
  queues: MenuPeople;
  agents: MenuPeople;
  saving: boolean;
  onChange: (next: ChatMenuSettings) => void;
  onSave: () => void;
};

function MenuRows({ settings, parentId, rows, onChange }: { settings: ChatMenuSettings; parentId: string; rows: MenuOption[]; onChange: Props["onChange"] }) {
  const move = (id: string, step: number) =>
    onChange({ ...settings, options: moveInTree(settings.options, id, step), canvas: { ...settings.canvas, drafts: moveInTree(settings.canvas.drafts, id, step) } });
  const add = () => {
    const option = newMenuOption({ action: "none" });
    if (parentId === ROOT_NODE) onChange({ ...settings, options: [...settings.options, option] });
    else onChange({ ...settings, options: addToTree(settings.options, parentId, option), canvas: { ...settings.canvas, drafts: addToTree(settings.canvas.drafts, parentId, option) } });
  };
  return (
    <div>
      <p className={labelClass}>Opções</p>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-center gap-1">
            <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-500 dark:text-slate-400">{index + 1}</span>
            <input aria-label={`Rótulo da opção ${index + 1}`} value={row.label} placeholder="Ex.: Falar com vendas" onChange={(event) => onChange(updateOption(settings, row.id, { label: event.target.value }))} className={`${fieldClass} min-w-0 flex-1`} />
            <button type="button" title="Subir" aria-label={`Subir opção ${index + 1}`} disabled={index === 0} onClick={() => move(row.id, -1)} className="cursor-pointer rounded p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" title="Descer" aria-label={`Descer opção ${index + 1}`} disabled={index === rows.length - 1} onClick={() => move(row.id, 1)} className="cursor-pointer rounded p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" title="Excluir" aria-label={`Excluir opção ${index + 1}`} onClick={() => onChange(removeOption(settings, row.id))} className="cursor-pointer rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={rows.length >= MAX_OPTIONS} onClick={add} className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#002187] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#C4D600] dark:hover:bg-slate-800"><Plus className="h-3.5 w-3.5" />Adicionar opção</button>
    </div>
  );
}

function NodeEditor({ nodeId, settings, queues, agents, onChange, onClose, onDelete }: { nodeId: string; settings: ChatMenuSettings; queues: MenuPeople; agents: MenuPeople; onChange: Props["onChange"]; onClose: () => void; onDelete: () => void }) {
  const option = findOption(settings, nodeId);
  if (nodeId !== START_NODE && nodeId !== ROOT_NODE && !option) return null;
  const isDraft = settings.canvas.drafts.some((draft) => draft.id === nodeId);
  const title = nodeId === START_NODE ? "Início" : nodeId === ROOT_NODE ? "Menu principal" : option?.action === "submenu" ? "Submenu" : "Ação";

  return (
    <aside aria-label={`Editar ${title}`} className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[380px] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#07194f]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
        <button type="button" title="Fechar painel" aria-label="Fechar painel" onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {nodeId === START_NODE && (
          <>
            <SwitchRow title="Menu automático" description={settings.enabled ? "Conversas novas começam no menu." : "Desligado: conversas novas vão direto para a primeira fila."} checked={settings.enabled} onChange={(value) => onChange({ ...settings, enabled: value })} />
            <MessageField id="flow-greeting" label="Saudação" rows={5} value={settings.greeting} onChange={(value) => onChange({ ...settings, greeting: value })} variables={[...CUSTOMER_VARIABLES, { mark: "{menu}", label: "Lista de opções" }]} hint="Sem a lista de opções no texto, ela entra no fim." />
          </>
        )}
        {nodeId === ROOT_NODE && (
          <>
            <MenuRows settings={settings} parentId={ROOT_NODE} rows={settings.options} onChange={onChange} />
            <MessageField id="flow-footer" label="Rodapé da lista" rows={1} value={settings.footer} onChange={(value) => onChange({ ...settings, footer: value })} />
          </>
        )}
        {option && (
          <>
            {isDraft ? (
              <p className="rounded-lg bg-[#F7915E]/10 px-3 py-2 text-xs text-slate-700 dark:text-slate-200">Etapa solta: puxe a seta de uma opção até ela para entrar no menu.</p>
            ) : (
              <div>
                <label htmlFor={`flow-label-${option.id}`} className={labelClass}>Rótulo que o cliente lê</label>
                <input id={`flow-label-${option.id}`} value={option.label} onChange={(event) => onChange(updateOption(settings, option.id, { label: event.target.value }))} className={fieldClass} />
              </div>
            )}
            <MenuOptionFields option={option} queues={queues} agents={agents} onPatch={(patch) => onChange(updateOption(settings, option.id, patch))} />
            {option.action === "submenu" && <MenuRows settings={settings} parentId={option.id} rows={option.options} onChange={onChange} />}
            <button type="button" onClick={onDelete} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />Excluir etapa</button>
          </>
        )}
      </div>
    </aside>
  );
}

function Canvas({ settings, queues, agents, saving, onChange, onSave }: Props) {
  const toast = useToast();
  const dark = useDarkMode();
  const { fitView, screenToFlowPosition } = useReactFlow<FlowNode, Edge>();
  const graph = useMemo(() => buildGraph(settings), [settings]);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncedGraph, setSyncedGraph] = useState<typeof graph | null>(null);

  // Toda mudança nos dados redesenha o canvas. Mantém `measured` e seleção: sem eles o React Flow esconderia os nós até medir de novo.
  if (graph !== syncedGraph) {
    setSyncedGraph(graph);
    const knownNodes = new Map(nodes.map((node) => [node.id, node]));
    const selectedEdges = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id));
    setNodes(
      graph.nodes.map((node) => {
        const next = toFlowNode(node, settings);
        const previous = knownNodes.get(node.id);
        return (previous ? { ...next, measured: previous.measured, selected: previous.selected } : next) as FlowNode;
      }),
    );
    setEdges(
      graph.edges.map((edge) => ({
        ...edge,
        selected: selectedEdges.has(edge.id),
        deletable: edge.target !== ROOT_NODE,
        reconnectable: edge.target !== ROOT_NODE,
        animated: edge.target === ROOT_NODE,
        markerEnd: { type: MarkerType.ArrowClosed, color: BRAND_GREEN },
        style: { stroke: BRAND_GREEN, strokeWidth: 2 },
      })),
    );
  }

  // Enquadra só depois de medir todos os nós; antes disso o fluxo abre cortado.
  const nodesReady = useNodesInitialized();
  const framed = useRef(false);
  useEffect(() => {
    if (!nodesReady || framed.current) return;
    framed.current = true;
    void fitView({ padding: 0.15, maxZoom: 1 });
  }, [nodesReady, fitView]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)), []);

  const connect = (connection: Connection) => {
    if (!connection.sourceHandle) return;
    const result = connectOption(settings, connection.sourceHandle, connection.target);
    if (result.error !== undefined) toast.error(result.error);
    else onChange(result.settings);
  };

  // Soltar a seta em qualquer ponto do cartão vale; o React Flow só aceita em cima do ponto de entrada.
  const connectOnNodeBody: OnConnectEnd = (event, state) => {
    if (state.isValid || !state.fromHandle?.id) return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    const target = document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>(".react-flow__node")?.dataset.id;
    if (!target || target === ROOT_NODE || target === START_NODE || target === state.fromNode?.id) return;
    connect({ source: state.fromNode?.id ?? "", sourceHandle: state.fromHandle.id, target, targetHandle: null });
  };

  const handleDelete = ({ nodes: removedNodes, edges: removedEdges }: { nodes: FlowNode[]; edges: Edge[] }) => {
    const removed = new Set(removedNodes.map((node) => node.id));
    let next = settings;
    // Apagar um nó também lista as setas dele: só as setas apagadas sozinhas soltam a etapa.
    for (const edge of removedEdges) {
      if (edge.sourceHandle && !removed.has(edge.source) && !removed.has(edge.target)) next = disconnectOption(next, edge.sourceHandle);
    }
    for (const id of removed) next = removeNode(next, id);
    onChange(next);
    if (selectedId && removed.has(selectedId)) setSelectedId(null);
  };

  const addAtCenter = (kind: "menu" | "action") => {
    const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const result = addDraft(settings, kind, position);
    onChange(result.settings);
    setSelectedId(result.id);
  };

  const organize = () => {
    onChange(organizeNodes(settings));
    window.setTimeout(() => void fitView({ padding: 0.15, duration: 300 }), 50);
  };

  const storePositions = (dragged: FlowNode[]) => {
    const moved = Object.fromEntries(dragged.map((node) => [node.id, node.position]));
    onChange({ ...settings, canvas: { ...settings.canvas, positions: { ...Object.fromEntries(nodes.map((node) => [node.id, node.position])), ...moved } } });
  };

  return (
    <PeopleContext.Provider value={{ queues, agents }}>
      <div className="relative h-[calc(100vh-220px)] min-h-[560px] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]">
        <ReactFlow<FlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode={dark ? "dark" : "light"}
          minZoom={0.2}
          deleteKeyCode={["Backspace", "Delete"]}
          ariaLabelConfig={{ "controls.zoomIn.ariaLabel": "Aproximar", "controls.zoomOut.ariaLabel": "Afastar", "controls.fitView.ariaLabel": "Enquadrar fluxo" }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          isValidConnection={(connection) => connection.target !== ROOT_NODE && connection.target !== START_NODE}
          onConnect={connect}
          onConnectEnd={connectOnNodeBody}
          onReconnect={(_, connection) => connect(connection)}
          onDelete={handleDelete}
          onNodeDragStop={(_, __, dragged) => storePositions(dragged)}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={dark ? "#C4D600" : "#051647"} className="!h-24 !w-36" />
          <Panel position="top-center" className="flex max-w-[calc(100%-32px)] flex-wrap items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-[#07194f]">
            <button type="button" onClick={() => addAtCenter("menu")} className={toolButton}><Plus className="h-4 w-4" />Novo Menu</button>
            <button type="button" onClick={() => addAtCenter("action")} className={toolButton}><Plus className="h-4 w-4" />Nova Ação</button>
            <button type="button" onClick={organize} className={toolButton}><LayoutGrid className="h-4 w-4" />Auto Organizar Nós</button>
            <button type="button" onClick={onSave} disabled={saving} className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#051647] px-3 text-xs font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar Fluxo"}</button>
          </Panel>
        </ReactFlow>
        {selectedId && (
          <NodeEditor
            nodeId={selectedId}
            settings={settings}
            queues={queues}
            agents={agents}
            onChange={onChange}
            onClose={() => setSelectedId(null)}
            onDelete={() => {
              onChange(removeNode(settings, selectedId));
              setSelectedId(null);
            }}
          />
        )}
      </div>
    </PeopleContext.Provider>
  );
}

export function MenuFlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
