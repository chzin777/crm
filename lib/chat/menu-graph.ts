import { newMenuOption, removeFromTree, updateTree, type ChatMenuSettings, type MenuOption } from "@/lib/chat/settings";

/**
 * Leitura do menu como grafo. A árvore de `settings.options` continua sendo a fonte da verdade:
 * cada opção é uma linha do menu pai e, se tiver destino, também o nó de destino (mesmo id).
 */
export const START_NODE = "start";
export const ROOT_NODE = "root";

export type NodePosition = { x: number; y: number };
export type GraphNode =
  | { id: string; kind: "start"; position: NodePosition }
  | { id: string; kind: "menu"; position: NodePosition; option: MenuOption | null; rows: MenuOption[]; prefix: string; draft: boolean }
  | { id: string; kind: "action"; position: NodePosition; option: MenuOption; prefix: string; draft: boolean };
export type GraphEdge = { id: string; source: string; sourceHandle: string; target: string };

const COLUMN = 400;
const GAP = 40;
const NODE_HEIGHT = { start: 120, action: 130 };
const menuHeight = (rows: number) => 120 + rows * 40;

const heightOf = (option: MenuOption) => (option.action === "submenu" ? menuHeight(option.options.length) : NODE_HEIGHT.action);

/** Árvore em colunas: cada menu fica centrado na altura dos seus destinos. */
export function autoLayout(settings: ChatMenuSettings): Record<string, NodePosition> {
  const positions: Record<string, NodePosition> = {};

  const place = (id: string, height: number, children: MenuOption[], column: number, top: number): number => {
    const targets = children.filter((child) => child.action !== "none");
    let cursor = top;
    for (const child of targets) {
      cursor = place(child.id, heightOf(child), child.action === "submenu" ? child.options : [], column + 1, cursor);
    }
    const used = cursor - top - (targets.length ? GAP : 0);
    positions[id] = { x: column * COLUMN, y: top + Math.max(0, (used - height) / 2) };
    return top + Math.max(used, height) + GAP;
  };

  let bottom = place(ROOT_NODE, menuHeight(settings.options.length), settings.options, 1, 0);
  positions[START_NODE] = { x: 0, y: positions[ROOT_NODE].y };
  for (const draft of settings.canvas.drafts) {
    bottom = place(draft.id, heightOf(draft), draft.action === "submenu" ? draft.options : [], 1, bottom);
  }
  return positions;
}

export function buildGraph(settings: ChatMenuSettings) {
  const layout = autoLayout(settings);
  const positionOf = (id: string) => settings.canvas.positions[id] ?? layout[id] ?? { x: 0, y: 0 };
  const nodes: GraphNode[] = [
    { id: START_NODE, kind: "start", position: positionOf(START_NODE) },
    { id: ROOT_NODE, kind: "menu", position: positionOf(ROOT_NODE), option: null, rows: settings.options, prefix: "", draft: false },
  ];
  const edges: GraphEdge[] = [{ id: `edge-${ROOT_NODE}`, source: START_NODE, sourceHandle: START_NODE, target: ROOT_NODE }];

  const addTarget = (option: MenuOption, prefix: string, draft: boolean) => {
    const position = positionOf(option.id);
    if (option.action === "submenu") {
      nodes.push({ id: option.id, kind: "menu", position, option, rows: option.options, prefix, draft });
      addRows(option.id, option.options, `${prefix}.`);
    } else {
      nodes.push({ id: option.id, kind: "action", position, option, prefix, draft });
    }
  };

  const addRows = (parentId: string, rows: MenuOption[], prefix: string) => {
    rows.forEach((option, index) => {
      if (option.action === "none") return;
      edges.push({ id: `edge-${option.id}`, source: parentId, sourceHandle: option.id, target: option.id });
      addTarget(option, `${prefix}${index + 1}`, false);
    });
  };

  addRows(ROOT_NODE, settings.options, "");
  settings.canvas.drafts.forEach((draft) => addTarget(draft, "", true));
  return { nodes, edges };
}

function findIn(options: MenuOption[], id: string): MenuOption | null {
  for (const option of options) {
    if (option.id === id) return option;
    const nested = findIn(option.options, id);
    if (nested) return nested;
  }
  return null;
}

export const findOption = (settings: ChatMenuSettings, id: string) => findIn(settings.options, id) ?? findIn(settings.canvas.drafts, id);

const isDraft = (settings: ChatMenuSettings, id: string) => settings.canvas.drafts.some((draft) => draft.id === id);

/** Aplica a mudança nas duas florestas: menu publicado e etapas soltas. */
function patchOption(settings: ChatMenuSettings, id: string, patch: Partial<MenuOption>): ChatMenuSettings {
  return {
    ...settings,
    options: updateTree(settings.options, id, patch),
    canvas: { ...settings.canvas, drafts: updateTree(settings.canvas.drafts, id, patch) },
  };
}

export const updateOption = patchOption;

export function removeOption(settings: ChatMenuSettings, id: string): ChatMenuSettings {
  return {
    ...settings,
    options: removeFromTree(settings.options, id),
    canvas: { ...settings.canvas, drafts: removeFromTree(settings.canvas.drafts, id) },
  };
}

const payloadOf = ({ action, text, queueId, assigneeId, tagTarget, tagMode, tagValue, options }: MenuOption) => ({ action, text, queueId, assigneeId, tagTarget, tagMode, tagValue, options });

const EMPTY_PAYLOAD = { action: "none", text: "", queueId: null, assigneeId: null, tagTarget: "tag", tagMode: "add", tagValue: "", options: [] } satisfies ReturnType<typeof payloadOf>;

function resolvedPositions(settings: ChatMenuSettings) {
  return { ...autoLayout(settings), ...settings.canvas.positions };
}

/** Tira o destino da opção e o deixa solto no canvas, na mesma posição. */
function detach(settings: ChatMenuSettings, optionId: string): ChatMenuSettings {
  const option = findOption(settings, optionId);
  if (!option || option.action === "none") return settings;
  const positions = resolvedPositions(settings);
  const draft = newMenuOption(payloadOf(option));
  const cleared = patchOption(settings, optionId, EMPTY_PAYLOAD);
  const next = { ...positions, [draft.id]: positions[optionId] };
  delete next[optionId];
  return { ...cleared, canvas: { positions: next, drafts: [...cleared.canvas.drafts, draft] } };
}

export type ConnectResult = { settings: ChatMenuSettings; error?: undefined } | { settings?: undefined; error: string };

/** Puxa a seta: a opção herda o destino; o que ela apontava antes fica solto no canvas. */
export function connectOption(settings: ChatMenuSettings, sourceId: string, targetId: string): ConnectResult {
  const target = findOption(settings, targetId);
  if (!findOption(settings, sourceId) || !target) return { error: "Essa etapa não pode receber a conexão." };
  if (sourceId === targetId) return { settings };
  if (findIn(target.options, sourceId)) return { error: "Uma etapa não pode apontar para o próprio caminho." };

  const positions = resolvedPositions(settings);
  const position = positions[targetId];
  const payload = payloadOf(target);
  const withoutTarget = isDraft(settings, targetId)
    ? { ...settings, canvas: { ...settings.canvas, drafts: settings.canvas.drafts.filter((draft) => draft.id !== targetId) } }
    : patchOption(settings, targetId, EMPTY_PAYLOAD);
  const free = detach(withoutTarget, sourceId);
  const connected = patchOption(free, sourceId, payload);
  const next = { ...resolvedPositions(free), [sourceId]: position };
  delete next[targetId];
  return { settings: { ...connected, canvas: { ...connected.canvas, positions: next } } };
}

/** Apagar a seta preserva a etapa: ela só fica solta. */
export const disconnectOption = detach;

/** Apagar o nó remove a etapa; a opção que levava até ele continua no menu, sem destino. */
export function removeNode(settings: ChatMenuSettings, id: string): ChatMenuSettings {
  if (isDraft(settings, id)) return { ...settings, canvas: { ...settings.canvas, drafts: settings.canvas.drafts.filter((draft) => draft.id !== id) } };
  return patchOption(settings, id, EMPTY_PAYLOAD);
}

export function addDraft(settings: ChatMenuSettings, kind: "menu" | "action", position: NodePosition) {
  const draft = newMenuOption({ action: kind === "menu" ? "submenu" : "reply" });
  return {
    id: draft.id,
    settings: { ...settings, canvas: { positions: { ...settings.canvas.positions, [draft.id]: position }, drafts: [...settings.canvas.drafts, draft] } },
  };
}

export const organizeNodes = (settings: ChatMenuSettings): ChatMenuSettings => ({ ...settings, canvas: { ...settings.canvas, positions: autoLayout(settings) } });
