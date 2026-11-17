import { NODE_DEF, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/lib/automations/nodes";

/** Modelos prontos do botão "Nova automação". */

const node = (id: string, type: NodeType, x: number, y: number, config: Record<string, unknown> = {}): FlowNode => ({ id, type, position: { x, y }, data: { config: { ...NODE_DEF[type].defaults, ...config } } });
const edge = (source: string, target: string, sourceHandle: "true" | "false" | null = null): FlowEdge => ({ id: `${source}-${sourceHandle ?? "out"}-${target}`, source, target, sourceHandle });

export type FlowTemplate = { id: string; name: string; description: string; graph: FlowGraph };

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "follow-up-orcamento",
    name: "Follow-up de Orçamento 24h",
    description: "Lead em atendimento sem resposta em 23 h recebe um lembrete e a equipe é avisada.",
    graph: {
      nodes: [
        node("t", "trigger_stage", 0, 0, { stage: "em-atendimento" }),
        // Sem horário comercial: o lembrete precisa sair dentro da janela de 24 h do WhatsApp.
        node("d", "delay", 0, 140, { amount: 23, unit: "hours", businessHours: false }),
        node("c", "condition", 0, 280, { field: "reply", operator: "exists", value: "" }),
        node("m", "send_whatsapp", 260, 420, { text: "Oi {{nome}}! Conseguiu ver o orçamento que preparamos? Fico à disposição para tirar dúvidas." }),
        node("n", "notify", 260, 560, { title: "Follow-up enviado: {{nome}}", message: "Cliente não respondeu ao orçamento em 24 h." }),
      ],
      edges: [edge("t", "d"), edge("d", "c"), edge("c", "m", "false"), edge("m", "n")],
    },
  },
  {
    id: "boas-vindas",
    name: "Boas-vindas + Qualificação",
    description: "Primeiro contato com \"oi\" ou \"olá\": cria a oportunidade e passa para a IA qualificar.",
    graph: {
      nodes: [
        node("t", "trigger_message", 0, 0, { mode: "keywords", keywords: ["oi", "ola", "bom dia", "boa tarde", "boa noite"] }),
        node("o", "create_opportunity", 0, 140),
        node("g", "add_tag", 0, 280, { tag: "novo-contato" }),
        node("a", "ai_agent", 0, 420, { objective: "Dar boas-vindas e qualificar cidade, tipo de óculos e faixa de preço." }),
      ],
      edges: [edge("t", "o"), edge("o", "g"), edge("g", "a")],
    },
  },
  {
    id: "cliente-sumido",
    name: "Recuperação de Cliente Sumido",
    description: "Contato sem conversar há 120 dias vai para Reativação e a equipe recebe o alerta.",
    graph: {
      nodes: [
        node("t", "trigger_inactive", 0, 0, { amount: 120, unit: "days" }),
        node("s", "move_stage", 0, 140, { stage: "reativacao" }),
        node("g", "add_tag", 0, 280, { tag: "reativacao" }),
        node("n", "notify", 0, 420, { title: "Cliente sumido: {{nome}}", message: "Sem contato há 120 dias. Vale uma ligação ou um modelo de reativação." }),
      ],
      edges: [edge("t", "s"), edge("s", "g"), edge("g", "n")],
    },
  },
  {
    id: "pos-venda",
    name: "Pós-Venda / Pesquisa de Satisfação",
    description: "Venda ganha: 3 dias depois pergunta como estão os óculos e move para Pós-venda.",
    graph: {
      nodes: [
        node("t", "trigger_stage", 0, 0, { stage: "ganho" }),
        node("d", "delay", 0, 140, { amount: 3, unit: "days", businessHours: true }),
        node("m", "send_whatsapp", 0, 280, { text: "Oi {{nome}}! Como estão os óculos novos? De 0 a 10, quanto você recomendaria a gente?" }),
        node("s", "move_stage", 0, 420, { stage: "pos-venda" }),
      ],
      edges: [edge("t", "d"), edge("d", "m"), edge("m", "s")],
    },
  },
];
