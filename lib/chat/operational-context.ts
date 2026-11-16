import { extractCpf, isInstallmentQuestion, isValidCpf, maskCpf, type InstallmentsSummary } from "@/lib/ai/installments";
import { productFromCard } from "@/lib/sales-pipeline";

/**
 * Copiloto VMSet do /chat: lê o cadastro e as últimas mensagens da conversa para sugerir consultas em 1 clique
 * (faturas, estoque, histórico) e formata os resultados como mensagem pronta para o cliente. Puro, sem banco.
 */

export type OperationalIntent = "faturas_parcelas" | "estoque_preco" | "historico_compras_os" | "receituario";
export type QuickQueryKind = "faturas" | "estoque" | "compras" | "receitas";
export type ContextMessage = { author: string; text: string };
export type ChatOperationalContext = {
  cpf: string | null;
  cpfSource: "chat" | "cadastro" | null;
  name: string | null;
  product: string | null;
  intents: OperationalIntent[];
  intent: OperationalIntent | null;
};
export type QuickSuggestion = { kind: QuickQueryKind; label: string; params: { cpf?: string; name?: string; term?: string } };

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Marcas mais citadas pelos clientes; a referência do ERP (RB3025, PS 07RV) é reconhecida pelo formato. */
const BRANDS = ["ray-ban", "rayban", "ray ban", "oakley", "prada", "radda", "carrera", "vogue", "chilli beans", "arnette", "jean monnier", "tommy hilfiger", "guess", "michael kors", "dolce", "armani", "versace", "ana hickmann", "hb", "evoke", "mormaii", "atitude", "polaroid", "tecnol"];
const REFERENCE = /\b(?:RB|RX|OO|OX|PR|PS|VO|VE|EA|AX|MK|DG|HC|AH|CH|AN|TH)\s?-?\d{2,4}[A-Z]{0,3}\b/i;

const INTENT_PATTERNS: [OperationalIntent, RegExp][] = [
  ["estoque_preco", /\b(estoque|tem (na|em) (loja|qual)|qual loja|disponivel|disponibilidade|preco|valor|quanto (custa|e|fica|sai)|tem esse|tem o modelo|reserva(r)?)\b/],
  ["historico_compras_os", /\b(garantia|ordem de servico|\bos\b|ja comprei|ja comprou|comprei (ai|aqui|com voces)|comprou (aqui|com voces)|minha compra|meu pedido|pedido|ficou pronto|esta pronto|ta pronto|retirar|buscar (meu|o) oculos|nota fiscal|troca)\b/],
  ["receituario", /\b(receita|grau|graus|oftalmo|oculista|miopia|astigmatismo|multifoca(l|is)|lente de grau)\b/],
];

const lastWords = (messages: ContextMessage[], take = 30) => messages.slice(-take);
const customerText = (messages: ContextMessage[]) => lastWords(messages).filter((message) => message.author === "customer").map((message) => message.text);

function extractCustomerName(messages: ContextMessage[]): string | null {
  for (const message of customerText(messages).slice().reverse()) {
    const match = message.match(/\b(?:meu nome (?:e|é)|me chamo)\s+([^,.;!?\n]{3,80})/i);
    if (!match) continue;
    const candidate = match[1].trim().replace(/\s+(?:e quero|e preciso|e gostaria|meu cpf|meu telefone)\b.*$/i, "").trim();
    const parts = candidate.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 6 && parts.every((part) => /^[\p{L}'-]+$/u.test(part))) return candidate;
  }
  return null;
}

/** Referência/modelo citado: ficha enviada pela IA, referência no formato do ERP ou marca + palavra seguinte. */
export function extractProductReference(messages: ContextMessage[]): string | null {
  const recent = lastWords(messages).slice().reverse();
  for (const message of recent) {
    const reference = message.text.match(REFERENCE);
    if (reference) {
      const value = reference[0].toUpperCase().replace(/\s*-\s*/, " ");
      const brand = BRANDS.find((item) => plain(message.text).includes(item));
      return brand && !/^(RB|RX)/.test(value) ? `${brand.replace(/\b\w/g, (letter) => letter.toUpperCase())} ${value}` : value;
    }
    if (message.author !== "customer") {
      const card = productFromCard(message.text);
      if (card) return card.name;
    }
  }
  for (const message of recent.filter((item) => item.author === "customer")) {
    const text = plain(message.text);
    const brand = BRANDS.find((item) => new RegExp(`\\b${item}\\b`).test(text));
    if (!brand) continue;
    const after = text.slice(text.indexOf(brand) + brand.length).trim().split(/\s+/).find((word) => /^[a-z0-9]{3,}$/.test(word) && !["que", "voces", "tem", "para", "pra", "com", "uma", "esse", "aquele", "modelo", "oculos"].includes(word));
    const label = brand.replace(/\b\w/g, (letter) => letter.toUpperCase());
    return after ? `${label} ${after.toUpperCase()}` : label;
  }
  return null;
}

export function detectIntents(messages: ContextMessage[]): OperationalIntent[] {
  const texts = customerText(messages);
  const scores = new Map<OperationalIntent, number>();
  texts.forEach((text, index) => {
    // Mensagem mais recente pesa mais: a intenção predominante é a do momento.
    const weight = 1 + index / Math.max(1, texts.length);
    if (isInstallmentQuestion(text) || /\b(fatura|boleto|carne|crediario|parcela)/.test(plain(text))) scores.set("faturas_parcelas", (scores.get("faturas_parcelas") ?? 0) + weight * 1.5);
    for (const [intent, pattern] of INTENT_PATTERNS) if (pattern.test(plain(text))) scores.set(intent, (scores.get(intent) ?? 0) + weight);
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([intent]) => intent);
}

/** Contexto operacional da conversa: CPF (chat ou cadastro), nome, produto citado e intenções em ordem de peso. */
export function extractChatOperationalContext(input: { contact: { name: string | null; cpf: string | null }; messages: ContextMessage[] }): ChatOperationalContext {
  let cpf: string | null = null;
  let cpfSource: ChatOperationalContext["cpfSource"] = null;
  for (const text of customerText(input.messages).reverse()) {
    const found = extractCpf(text);
    if (found?.valid) {
      cpf = found.cpf;
      cpfSource = "chat";
      break;
    }
  }
  const saved = input.contact.cpf?.replace(/\D/g, "") ?? "";
  if (!cpf && isValidCpf(saved)) {
    cpf = saved;
    cpfSource = "cadastro";
  }
  const name = input.contact.name?.trim() || extractCustomerName(input.messages);
  const product = extractProductReference(input.messages);
  const intents = detectIntents(input.messages);
  if (product && !intents.includes("estoque_preco")) intents.push("estoque_preco");
  return { cpf, cpfSource, name, product, intents, intent: intents[0] ?? null };
}

const firstName = (name: string | null) => {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}` : "";
};
const displayName = (name: string | null) => (name ? name.trim().split(/\s+/).map((part) => /^(da|das|de|do|dos|e)$/i.test(part) ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ") : "cliente");

/** Botões "⚡ Sugerido para esta conversa", na ordem da intenção predominante. */
export function suggestQuickQueries(context: ChatOperationalContext): QuickSuggestion[] {
  const who = displayName(context.name);
  const identity = { ...(context.cpf ? { cpf: context.cpf } : {}), ...(context.name ? { name: context.name } : {}) };
  const byIntent: Partial<Record<OperationalIntent, QuickSuggestion | null>> = {
    faturas_parcelas: context.cpf || context.name ? { kind: "faturas", label: `Consultar faturas de ${who}${context.cpf ? ` (CPF ${maskCpf(context.cpf)})` : ""}`, params: identity } : null,
    estoque_preco: context.product ? { kind: "estoque", label: `Ver estoque e preço de ${context.product}`, params: { term: context.product } } : null,
    historico_compras_os: context.cpf || context.name ? { kind: "compras", label: `Histórico de OS e compras de ${who}`, params: identity } : null,
    receituario: { kind: "receitas", label: `Receitas salvas de ${who}`, params: {} },
  };
  return context.intents.map((intent) => byIntent[intent]).filter((item): item is QuickSuggestion => !!item);
}

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dayBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "sem data");

/** Resumo das parcelas para o cliente (texto do WhatsApp). */
export function installmentsReply(name: string | null, summary: InstallmentsSummary) {
  const hello = firstName(name) ? `${firstName(name)}, ` : "";
  if (!summary.abertas) return `${hello}conferi aqui e você não tem nenhuma parcela em aberto no crediário. Está tudo quitado! 🎉`;
  const lines = summary.parcelasAbertas.slice(0, 6).map((item) => `• Parcela ${item.parcela} — ${brl(item.valor)} — vence ${dayBr(item.vencimento)}${item.atrasada ? " (vencida)" : ""}`);
  return [
    `${hello}conferi seu crediário 😊`,
    `Você tem *${summary.abertas} parcela${summary.abertas > 1 ? "s" : ""} em aberto*, total de *${brl(summary.valorAberto)}*${summary.atrasadas ? ` (${summary.atrasadas} vencida${summary.atrasadas > 1 ? "s" : ""})` : ""}.`,
    ...lines,
    summary.parcelasAbertas.length > 6 ? `…e mais ${summary.parcelasAbertas.length - 6}.` : "",
  ].filter(Boolean).join("\n");
}

export type StockQuickProduct = { produto: string; preco: string | null; total: number; lojas: { loja: string; quantidade: number }[] };

export function stockReply(products: StockQuickProduct[]) {
  if (!products.length) return "Conferi aqui e não encontrei esse modelo no nosso estoque no momento 😕 Posso te mostrar opções parecidas?";
  return products.slice(0, 3).map((product) => {
    const stores = product.lojas.slice(0, 4).map((store) => `📍 ${store.loja} — ${store.quantidade} un.`);
    return [`*${product.produto}*${product.preco ? ` — ${product.preco}` : ""}`, product.total ? stores.join("\n") : "Sem estoque nas lojas no momento."].join("\n");
  }).join("\n\n");
}

export type PurchaseQuickItem = { pedido: string; data: string | null; loja: string | null; itens: string[]; total: number };

export function purchasesReply(name: string | null, purchases: PurchaseQuickItem[]) {
  const hello = firstName(name) ? `${firstName(name)}, ` : "";
  if (!purchases.length) return `${hello}não encontrei compras anteriores no seu cadastro.`;
  const lines = purchases.slice(0, 3).map((item) => `• ${dayBr(item.data)}${item.loja ? ` — ${item.loja}` : ""}: ${item.itens.slice(0, 2).join(", ")}${item.total ? ` (${brl(item.total)})` : ""}`);
  return [`${hello}encontrei suas últimas compras com a gente:`, ...lines].join("\n");
}

export type PrescriptionQuick = { data: string | null; medico: string | null; od: string; oe: string; anexo: string | null };

export function prescriptionReply(name: string | null, items: PrescriptionQuick[]) {
  const hello = firstName(name) ? `${firstName(name)}, ` : "";
  const [last] = items;
  if (!last) return `${hello}ainda não tenho sua receita aqui. Pode me mandar uma foto dela? 📷`;
  return [`${hello}sua receita mais recente${last.data ? ` (${last.data})` : ""}${last.medico ? `, do ${last.medico}` : ""}:`, `• OD: ${last.od}`, `• OE: ${last.oe}`].join("\n");
}

/** CPF nunca vai inteiro para o log do servidor. */
export const maskForLog = (text: string) => text.replace(/\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}/g, (match) => maskCpf(match.replace(/\D/g, "")));
