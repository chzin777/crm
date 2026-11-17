/**
 * Catálogo dos nós do construtor de automações (/automacoes). Puro: usado pela tela, pelo motor e pelos testes.
 */

export const TRIGGER_TYPES = ["trigger_message", "trigger_stage", "trigger_tag", "trigger_inactive", "trigger_webhook"] as const;
export const ACTION_TYPES = ["send_whatsapp", "delay", "ai_agent", "move_stage", "create_opportunity", "add_tag", "remove_tag", "assign", "notify", "opt_out", "condition", "http"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];
export type NodeType = TriggerType | (typeof ACTION_TYPES)[number];
export type NodeCategory = "gatilho" | "mensagem" | "crm" | "logica";

export type FieldDef =
  | { key: string; label: string; kind: "text" | "textarea" | "number" | "url"; placeholder?: string; hint?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; hint?: string }
  | { key: string; label: string; kind: "boolean"; hint?: string }
  | { key: string; label: string; kind: "list"; placeholder?: string; hint?: string }
  | { key: string; label: string; kind: "stage" | "queue" | "user" | "users"; hint?: string };

export type NodeDef = { type: NodeType; category: NodeCategory; label: string; description: string; fields: FieldDef[]; defaults: Record<string, unknown> };

export const STAGE_OPTIONS = [
  { value: "novo-lead", label: "Novo lead" },
  { value: "em-atendimento", label: "Em atendimento" },
  { value: "fechamento", label: "Fechamento" },
  { value: "ganho", label: "Ganho" },
  { value: "pos-venda", label: "Pós-venda" },
  { value: "recompra", label: "Recompra" },
  { value: "reativacao", label: "Reativação" },
];

export const NODE_DEFS: NodeDef[] = [
  { type: "trigger_message", category: "gatilho", label: "Mensagem recebida", description: "Cliente mandou mensagem no WhatsApp (qualquer uma ou com palavra-chave).", fields: [{ key: "mode", label: "Quando", kind: "select", options: [{ value: "any", label: "Qualquer mensagem" }, { value: "keywords", label: "Contém palavra-chave" }] }, { key: "keywords", label: "Palavras-chave / intenção", kind: "list", placeholder: "orçamento, preço, receita" }], defaults: { mode: "keywords", keywords: [] } },
  { type: "trigger_stage", category: "gatilho", label: "Lead entrou na etapa", description: "Oportunidade entrou numa etapa do funil (Kanban, IA ou atendimento).", fields: [{ key: "stage", label: "Etapa", kind: "stage" }], defaults: { stage: "em-atendimento" } },
  { type: "trigger_tag", category: "gatilho", label: "Tag adicionada", description: "Uma tag foi aplicada na conversa do contato.", fields: [{ key: "tag", label: "Tag", kind: "text", placeholder: "vip" }], defaults: { tag: "" } },
  { type: "trigger_inactive", category: "gatilho", label: "Cliente inativo por tempo", description: "Contato sem mandar mensagem há X dias (verificado de hora em hora).", fields: [{ key: "days", label: "Dias sem contato", kind: "number" }], defaults: { days: 90 } },
  { type: "trigger_webhook", category: "gatilho", label: "Webhook externo", description: "Sistema externo chama a URL do fluxo com { telefone } e variáveis.", fields: [], defaults: {} },

  { type: "send_whatsapp", category: "mensagem", label: "Enviar WhatsApp", description: "Texto com variáveis e imagem opcional (janela de 24 h aberta).", fields: [{ key: "text", label: "Mensagem", kind: "textarea", placeholder: "Oi {{nome}}, tudo bem?", hint: "Variáveis: {{nome}}, {{nome_completo}}, {{cidade}}, {{telefone}} e campos do webhook." }, { key: "mediaUrl", label: "URL da imagem (opcional)", kind: "url", placeholder: "https://..." }], defaults: { text: "", mediaUrl: "" } },
  { type: "delay", category: "mensagem", label: "Aguardar", description: "Pausa o fluxo por minutos, horas ou dias.", fields: [{ key: "amount", label: "Quanto tempo", kind: "number" }, { key: "unit", label: "Unidade", kind: "select", options: [{ value: "minutes", label: "Minutos" }, { value: "hours", label: "Horas" }, { value: "days", label: "Dias" }] }, { key: "businessHours", label: "Retomar só em horário comercial", kind: "boolean" }], defaults: { amount: 1, unit: "hours", businessHours: false } },
  { type: "ai_agent", category: "mensagem", label: "Acionar agente de IA", description: "Passa o atendimento para a IA com um objetivo.", fields: [{ key: "objective", label: "Objetivo da IA", kind: "textarea", placeholder: "Qualificar cidade e faixa de preço" }], defaults: { objective: "" } },

  { type: "move_stage", category: "crm", label: "Mover etapa no pipeline", description: "Move a oportunidade do contato para outra etapa.", fields: [{ key: "stage", label: "Etapa", kind: "stage" }], defaults: { stage: "em-atendimento" } },
  { type: "create_opportunity", category: "crm", label: "Criar oportunidade", description: "Abre a oportunidade do contato em Novo lead (se não houver aberta).", fields: [], defaults: {} },
  { type: "add_tag", category: "crm", label: "Adicionar tag", description: "Aplica uma tag na conversa do contato.", fields: [{ key: "tag", label: "Tag", kind: "text" }], defaults: { tag: "" } },
  { type: "remove_tag", category: "crm", label: "Remover tag", description: "Tira uma tag da conversa do contato.", fields: [{ key: "tag", label: "Tag", kind: "text" }], defaults: { tag: "" } },
  { type: "assign", category: "crm", label: "Atribuir atendente / fila", description: "Coloca a conversa numa fila e, se quiser, com um atendente.", fields: [{ key: "queueId", label: "Fila", kind: "queue" }, { key: "assigneeId", label: "Atendente (opcional)", kind: "user" }], defaults: { queueId: "", assigneeId: "" } },
  { type: "notify", category: "crm", label: "Notificar usuário / equipe", description: "Notificação interna no CRM e alerta opcional no WhatsApp.", fields: [{ key: "userIds", label: "Usuários (vazio = supervisores)", kind: "users" }, { key: "title", label: "Título", kind: "text" }, { key: "message", label: "Mensagem", kind: "textarea" }, { key: "whatsappPhone", label: "Alerta no WhatsApp (telefone, opcional)", kind: "text", placeholder: "62999990000" }], defaults: { userIds: [], title: "Automação: {{nome}}", message: "", whatsappPhone: "" } },
  { type: "opt_out", category: "crm", label: "Marcar opt-out", description: "Tira o contato de campanhas (LGPD) e encerra as automações dele.", fields: [], defaults: {} },

  { type: "condition", category: "logica", label: "Condição (se / senão)", description: "Segue pelo caminho Sim ou Não.", fields: [{ key: "field", label: "Verificar", kind: "select", options: [{ value: "tag", label: "Tag da conversa" }, { value: "stage", label: "Etapa do funil" }, { value: "city", label: "Cidade do contato" }, { value: "hour", label: "Hora atual (0 a 23)" }, { value: "reply", label: "Resposta do cliente" }] }, { key: "operator", label: "Operador", kind: "select", options: [{ value: "equals", label: "É igual a" }, { value: "contains", label: "Contém" }, { value: "not_contains", label: "Não contém" }, { value: "exists", label: "Existe / respondeu" }, { value: "gte", label: "Maior ou igual" }, { value: "lt", label: "Menor que" }] }, { key: "value", label: "Valor", kind: "text" }], defaults: { field: "reply", operator: "exists", value: "" } },
  { type: "http", category: "logica", label: "Requisição HTTP", description: "Chama uma URL externa (GET/POST); a resposta vira variável {{http.campo}}.", fields: [{ key: "method", label: "Método", kind: "select", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }] }, { key: "url", label: "URL", kind: "url", placeholder: "https://..." }, { key: "body", label: "Corpo JSON (POST)", kind: "textarea", placeholder: "{\"telefone\": \"{{telefone}}\"}" }], defaults: { method: "POST", url: "", body: "" } },
];

export const NODE_DEF = Object.fromEntries(NODE_DEFS.map((def) => [def.type, def])) as Record<NodeType, NodeDef>;
export const isTrigger = (type: string): type is TriggerType => (TRIGGER_TYPES as readonly string[]).includes(type);

export type FlowNode = { id: string; type: NodeType; position: { x: number; y: number }; data: { config: Record<string, unknown> } };
/** sourceHandle "true"/"false" só na condição. */
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

/** Lê o grafo salvo (JSON) descartando nós de tipo desconhecido e conexões soltas. */
export function sanitizeGraph(input: { nodes?: unknown; edges?: unknown }): FlowGraph {
  const nodes = (Array.isArray(input.nodes) ? input.nodes : [])
    .filter((node): node is FlowNode => !!node && typeof node === "object" && typeof (node as FlowNode).id === "string" && (node as FlowNode).type in NODE_DEF)
    .map((node) => ({ id: node.id.slice(0, 80), type: node.type, position: { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 }, data: { config: { ...NODE_DEF[node.type].defaults, ...(node.data?.config && typeof node.data.config === "object" ? node.data.config : {}) } } }))
    .slice(0, 200);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(input.edges) ? input.edges : [])
    .filter((edge): edge is FlowEdge => !!edge && typeof edge === "object" && ids.has((edge as FlowEdge).source) && ids.has((edge as FlowEdge).target) && (edge as FlowEdge).source !== (edge as FlowEdge).target)
    .map((edge) => ({ id: String(edge.id).slice(0, 120), source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle === "true" || edge.sourceHandle === "false" ? edge.sourceHandle : null }))
    .slice(0, 400);
  return { nodes, edges };
}

export const triggerNode = (graph: FlowGraph) => graph.nodes.find((node) => isTrigger(node.type)) ?? null;

/** Problemas que impedem ativar o fluxo. */
export function validateGraph(graph: FlowGraph): string[] {
  const problems: string[] = [];
  const triggers = graph.nodes.filter((node) => isTrigger(node.type));
  if (triggers.length === 0) problems.push("Adicione um gatilho para iniciar o fluxo.");
  if (triggers.length > 1) problems.push("Use apenas um gatilho por fluxo.");
  const trigger = triggers[0];
  if (trigger && !graph.edges.some((edge) => edge.source === trigger.id)) problems.push("Conecte o gatilho ao primeiro passo.");
  for (const node of graph.nodes) {
    const config = node.data.config;
    if (node.type === "send_whatsapp" && !String(config.text ?? "").trim() && !String(config.mediaUrl ?? "").trim()) problems.push("Enviar WhatsApp: escreva a mensagem.");
    if (node.type === "http" && !/^https?:\/\//i.test(String(config.url ?? ""))) problems.push("Requisição HTTP: informe uma URL http(s).");
    if ((node.type === "add_tag" || node.type === "remove_tag" || node.type === "trigger_tag") && !String(config.tag ?? "").trim()) problems.push(`${NODE_DEF[node.type].label}: informe a tag.`);
    if (node.type === "assign" && !String(config.queueId ?? "").trim()) problems.push("Atribuir: escolha a fila.");
  }
  return [...new Set(problems)];
}
