/**
 * Inteligência comercial (puro, sem banco): resumo do transbordo, recuperação de orçamento na janela de 24 h,
 * classificação de objeções e atribuição de vendas do VMSet aos atendimentos. Testado em tests/commercial-suite.test.ts.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Sem travessão nem hífen nas mensagens automáticas ao cliente ("Ray-Ban" vira "Ray Ban"). */
export const withoutDashes = (text: string) => text.replace(/\s*[–—]\s*/g, ", ").replace(/-/g, " ").replace(/ {2,}/g, " ").replace(/\s+,/g, ",").trim();

// ---------------------------------------------------------------------------------------------------------------
// Interesse do cliente e resumo do transbordo

export type Interest = "sol" | "grau" | "lentes_contato";
export const INTEREST_LABEL: Record<Interest, string> = { sol: "Óculos de sol", grau: "Óculos de grau", lentes_contato: "Lentes de contato" };

/** Interesses citados pelo cliente (texto) ou pelo catálogo consultado (categoria). Ordem fixa: sol, grau, lentes. */
export function detectInterests(texts: string[], hints: { category?: string | null; hasPrescription?: boolean } = {}): Interest[] {
  const all = fold([...texts, hints.category ?? ""].join(" \n "));
  const found = new Set<Interest>();
  if (/\b(oculos de sol|solar|solares|sol\b|escuro|polarizad)/.test(all)) found.add("sol");
  if (/\b(de grau|grau\b|receita|miopia|astigmatismo|hipermetropia|multifoca|progressiv|armacao|armacoes|lente de grau|visao simples)/.test(all) || hints.hasPrescription) found.add("grau");
  if (/\b(lentes? de contato|acuvue|biofinity|air optix|solflex|soflens|dailies|lente colorida|lentes coloridas)/.test(all)) found.add("lentes_contato");
  return (["sol", "grau", "lentes_contato"] as Interest[]).filter((item) => found.has(item));
}

export type BriefPrescription = { odEsferico: string | null; odCilindrico: string | null; odEixo: string | null; odAdicao: string | null; odDnp: string | null; oeEsferico: string | null; oeCilindrico: string | null; oeEixo: string | null; oeAdicao: string | null; oeDnp: string | null; dataReceita: Date | string | null };

export type HandoffBrief = {
  customer: string;
  interests: Interest[];
  products: string[];
  prescription: string | null;
  store: string | null;
};

const eyeLine = (label: string, esf: string | null, cil: string | null, eixo: string | null, add: string | null, dnp: string | null) => {
  const parts = [esf && `Esf ${esf}`, cil && `Cil ${cil}`, eixo && `Eixo ${eixo}`, add && `Ad ${add}`, dnp && `DNP ${dnp}`].filter(Boolean);
  return parts.length ? `${label} ${parts.join(" | ")}` : null;
};

/** Receita em uma linha para a nota: "OD Esf -2,00 | Cil -0,50 | Eixo 180°; OE ...; Data 13/05/2026". */
export function prescriptionLine(rx: BriefPrescription | null | undefined) {
  if (!rx) return null;
  const date = rx.dataReceita ? new Date(rx.dataReceita) : null;
  const parts = [
    eyeLine("OD", rx.odEsferico, rx.odCilindrico, rx.odEixo, rx.odAdicao, rx.odDnp),
    eyeLine("OE", rx.oeEsferico, rx.oeCilindrico, rx.oeEixo, rx.oeAdicao, rx.oeDnp),
    date && !Number.isNaN(date.getTime()) ? `Data ${date.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

/** Marca do texto do cliente quando o catálogo ainda não registrou nada ("tem ray ban?"). */
const KNOWN_BRANDS = ["Ray-Ban", "Oakley", "Prada", "Miu Miu", "Carrera", "Vogue", "Tiffany", "Chilli Beans", "Dolce & Gabbana", "Armani", "Michael Kors", "Arnette", "Jean Monnier", "Tommy Hilfiger", "Hugo Boss", "Guess", "Lacoste", "Acuvue", "Biofinity", "Air Optix"];
export function brandsInText(texts: string[]) {
  const all = fold(texts.join(" ")).replace(/[^a-z0-9]/g, "");
  return KNOWN_BRANDS.filter((brand) => all.includes(fold(brand).replace(/[^a-z0-9]/g, "")));
}

/** Monta o resumo executivo do transbordo a partir do que a conversa já registrou. */
export function buildHandoffBrief(input: {
  customer: string;
  customerTexts: string[];
  category?: string | null;
  products: string[];
  brands: string[];
  prescription?: BriefPrescription | null;
  store?: string | null;
  city?: string | null;
}): HandoffBrief {
  const products = [...new Set([...input.products, ...input.brands, ...brandsInText(input.customerTexts)].map((item) => item.trim()).filter(Boolean))].slice(0, 6);
  const prescription = prescriptionLine(input.prescription);
  return {
    customer: input.customer.trim() || "Cliente",
    interests: detectInterests(input.customerTexts, { category: input.category, hasPrescription: !!prescription }),
    products,
    prescription,
    store: input.store?.trim() || (input.city?.trim() ? `Região: ${input.city.trim()}` : null),
  };
}

export const HANDOFF_BRIEF_MARK = "Resumo do transbordo";

/** Texto da nota interna fixada no topo do atendimento. */
export function formatHandoffBrief(brief: HandoffBrief) {
  return [
    `${HANDOFF_BRIEF_MARK}`,
    `Cliente: ${brief.customer}`,
    `Interesse: ${brief.interests.length ? brief.interests.map((item) => INTEREST_LABEL[item]).join(", ") : "Não identificado"}`,
    `Marcas/modelos consultados: ${brief.products.length ? brief.products.join(", ") : "Nenhum"}`,
    `Receita: ${brief.prescription ?? "Não enviada"}`,
    `Loja/região: ${brief.store ?? "Não informada"}`,
  ].join("\n");
}

/** Nota interna de volta para os campos (o card fixado no /chat). */
export function parseHandoffBrief(text: string): Record<"customer" | "interest" | "products" | "prescription" | "store", string> | null {
  if (!text.startsWith(HANDOFF_BRIEF_MARK)) return null;
  const field = (label: string) => new RegExp(`^${label}: (.*)$`, "m").exec(text)?.[1]?.trim() ?? "";
  return { customer: field("Cliente"), interest: field("Interesse"), products: field("Marcas/modelos consultados"), prescription: field("Receita"), store: field("Loja/região") };
}

// ---------------------------------------------------------------------------------------------------------------
// Recuperação de orçamento aberto (janela de 24 h)

export const RECOVERY_MIN_HOURS = 4;
export const RECOVERY_MAX_HOURS = 6;
/** Só em horário comercial de Brasília: mensagem de acompanhamento de madrugada incomoda. */
export const RECOVERY_HOURS_BR = { from: 8, to: 20 } as const;

export type RecoveryCandidate = {
  lastAuthor: "customer" | "agent" | "bot" | null;
  lastAt: Date | null;
  lastInboundAt: Date | null;
  hasIntent: boolean;
  brHour: number;
  now: Date;
};

/** Cliente com intenção de compra parou de responder há 4 a 6 h, ainda dentro da janela de 24 h. */
export function shouldRecoverBudget(input: RecoveryCandidate, rule: { minHours: number; maxHours: number; window: { from: number; to: number } } = { minHours: RECOVERY_MIN_HOURS, maxHours: RECOVERY_MAX_HOURS, window: RECOVERY_HOURS_BR }) {
  if (!input.hasIntent || !input.lastAt || !input.lastInboundAt) return false;
  if (input.lastAuthor !== "agent" && input.lastAuthor !== "bot") return false;
  const silent = input.now.getTime() - input.lastAt.getTime();
  if (silent < rule.minHours * HOUR_MS || silent > rule.maxHours * HOUR_MS) return false;
  // Janela de 24 h da Meta (com folga de 10 min): fora dela, só modelo aprovado.
  if (input.now.getTime() - input.lastInboundAt.getTime() > 24 * HOUR_MS - 10 * 60 * 1000) return false;
  return input.brHour >= rule.window.from && input.brHour < rule.window.to;
}

/** Mensagem natural de acompanhamento citando o item exato consultado (sem travessões nem hífens). */
export function budgetRecoveryMessage(input: { name: string | null; item: string | null; prescription: boolean; variant?: number }) {
  const first = (input.name ?? "").trim().split(/\s+/)[0] ?? "";
  const hello = first && !/^\+?\d/.test(first) ? `Oi, ${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}!` : "Oi!";
  const item = input.item ? withoutDashes(input.item) : "";
  const variant = Math.abs(input.variant ?? 0) % 2;
  let body: string;
  if (item) body = variant === 0
    ? `Passando para saber se ficou alguma dúvida sobre o ${item} que você viu por aqui. Se quiser, confirmo a disponibilidade na loja mais perto de você.`
    : `Ficou pensando no ${item}? Posso te ajudar com valores, formas de pagamento ou com a loja mais perto para você experimentar.`;
  else if (input.prescription) body = "Recebemos sua receita e seguimos à disposição para montar seu orçamento. Quer que a gente continue por aqui?";
  else body = "Passando para saber se ficou alguma dúvida sobre o que você consultou com a gente. É só me chamar por aqui.";
  return withoutDashes(`${hello} ${body}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Mapa de objeções (conversas encerradas sem venda)

export type Objection = "preco" | "indisponibilidade" | "distancia" | "concorrencia" | "prazo" | "sem_resposta" | "outro";
export const OBJECTION_LABEL: Record<Objection, string> = {
  preco: "Preço",
  indisponibilidade: "Modelo indisponível",
  distancia: "Distância da loja",
  concorrencia: "Comprou na concorrência",
  prazo: "Prazo de entrega",
  sem_resposta: "Falta de resposta",
  outro: "Outros motivos",
};

const CUSTOMER_RULES: [Objection, RegExp][] = [
  ["preco", /\b(caro|cara|carissim|muito alto|preco alto|valor alto|sem dinheiro|sem grana|nao tenho condic|fora do (meu )?orcamento|mais barat|desconto|apertad[oa] (de|no) dinheiro|nao cabe no bolso|salgado)/],
  ["concorrencia", /\b(outra otica|outra loja|ja comprei|achei mais barato|vi na internet|comprei em|mercado livre|shopee|amazon|concorrente)/],
  ["distancia", /\b(longe|distante|muito fora|nao tem loja|outra cidade|nao tem na minha cidade|mais perto|dificil ir|nao consigo ir)/],
  ["prazo", /\b(demora|demorado|prazo|muito tempo|preciso pra hoje|preciso para amanha|urgente)/],
  ["indisponibilidade", /\b(nao tem esse|nao tem o modelo|nao tem a cor|sem estoque|acabou)/],
];
const TEAM_UNAVAILABLE = /\b(sem estoque|indisponivel|esgotad|nao temos (esse|este|o modelo|a cor|disponivel)|nao encontrei (esse|este|o modelo)|nao achei (esse|este) modelo|fora de linha)/;

/**
 * Motivo principal da perda: o que o cliente disse primeiro pesa mais; equipe avisando falta de estoque vira
 * indisponibilidade; conversa encerrada por silêncio do cliente (ou última palavra da equipe) vira falta de resposta.
 */
export function classifyObjection(input: { customerTexts: string[]; teamTexts: string[]; lastAuthor: "customer" | "agent" | "bot" | null; closedByInactivity: boolean }): { reason: Objection; evidence: string | null } {
  for (const text of input.customerTexts) {
    const folded = fold(text);
    for (const [reason, pattern] of CUSTOMER_RULES) if (pattern.test(folded)) return { reason, evidence: text.slice(0, 160) };
  }
  const unavailable = input.teamTexts.find((text) => TEAM_UNAVAILABLE.test(fold(text)));
  if (unavailable) return { reason: "indisponibilidade", evidence: unavailable.slice(0, 160) };
  if (input.closedByInactivity || (input.lastAuthor !== null && input.lastAuthor !== "customer")) return { reason: "sem_resposta", evidence: null };
  return { reason: "outro", evidence: null };
}

/** Ranking consolidado do período (maior primeiro, empate por nome). */
export function rankObjections(rows: { reason: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  const total = rows.length || 1;
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, label: OBJECTION_LABEL[reason as Objection] ?? reason, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Semana ISO ("2026-W48") para a chave do job semanal. */
export function isoWeek(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Atribuição de vendas (CRM x VMSet)

export const ATTRIBUTION_WINDOW_DAYS = 15;

/**
 * Chave de telefone para cruzar WhatsApp e cadastro do VMSet: DDD + 8 últimos dígitos (ignora 55 e o nono dígito).
 * "5511987654321", "(11) 98765-4321" e "11 8765-4321" dão "1187654321". Curto demais → null.
 */
export function phoneMatchKey(phone: string | null | undefined) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  if (digits.length < 10) return null;
  return `${digits.slice(0, 2)}${digits.slice(-8)}`;
}

/** CPF só com dígitos (11) ou null. */
export function cpfKey(cpf: string | null | undefined) {
  const digits = (cpf ?? "").replace(/\D/g, "");
  return digits.length === 11 && !/^(\d)\1{10}$/.test(digits) ? digits : null;
}

export type AttendedConversation = { id: string; contactKey: string; createdAt: Date; assignee: string; origin: string };
export type FactSale = { saleKey: string; contactKey: string; saleDate: Date; total: number };

export type AttributedSale = FactSale & { conversationId: string; assignee: string; origin: string };

/**
 * Cada venda faturada vai para o atendimento mais recente do mesmo cliente iniciado até 15 dias antes dela
 * (venda no mesmo dia do atendimento conta). Uma venda nunca conta duas vezes.
 */
export function attributeSalesToConversations(conversations: AttendedConversation[], sales: FactSale[], windowDays = ATTRIBUTION_WINDOW_DAYS): AttributedSale[] {
  const byContact = new Map<string, AttendedConversation[]>();
  for (const item of conversations) {
    const list = byContact.get(item.contactKey) ?? [];
    list.push(item);
    byContact.set(item.contactKey, list);
  }
  for (const list of byContact.values()) list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const seen = new Set<string>();
  const result: AttributedSale[] = [];
  for (const sale of sales) {
    if (seen.has(sale.saleKey)) continue;
    const saleDay = Date.UTC(sale.saleDate.getUTCFullYear(), sale.saleDate.getUTCMonth(), sale.saleDate.getUTCDate());
    const match = (byContact.get(sale.contactKey) ?? []).find((item) => {
      const start = Date.UTC(item.createdAt.getUTCFullYear(), item.createdAt.getUTCMonth(), item.createdAt.getUTCDate());
      return saleDay >= start && saleDay - start <= windowDays * DAY_MS;
    });
    if (!match) continue;
    seen.add(sale.saleKey);
    result.push({ ...sale, conversationId: match.id, assignee: match.assignee, origin: match.origin });
  }
  return result;
}

export type ConversionRow = { key: string; attended: number; converted: number; revenue: number; sales: number; rate: number; ticket: number };

/** Taxa de conversão (atendimentos com venda ÷ atendimentos), ticket médio e receita atribuída por grupo. */
export function summarizeConversion(conversations: AttendedConversation[], attributed: AttributedSale[], groupBy: (item: AttendedConversation) => string): ConversionRow[] {
  const groups = new Map<string, { attended: number; converted: Set<string>; revenue: number; sales: number }>();
  const groupOf = new Map<string, string>();
  for (const item of conversations) {
    const key = groupBy(item);
    groupOf.set(item.id, key);
    const group = groups.get(key) ?? { attended: 0, converted: new Set<string>(), revenue: 0, sales: 0 };
    group.attended += 1;
    groups.set(key, group);
  }
  for (const sale of attributed) {
    const group = groups.get(groupOf.get(sale.conversationId) ?? "");
    if (!group) continue;
    group.converted.add(sale.conversationId);
    group.revenue += sale.total;
    group.sales += 1;
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      attended: group.attended,
      converted: group.converted.size,
      revenue: Math.round(group.revenue * 100) / 100,
      sales: group.sales,
      rate: group.attended ? group.converted.size / group.attended : 0,
      ticket: group.sales ? Math.round((group.revenue / group.sales) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.attended - a.attended);
}
