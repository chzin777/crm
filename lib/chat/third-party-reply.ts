/**
 * Respostas automáticas de WhatsApp Business de outras empresas (ausência, boas-vindas, menu de autoatendimento),
 * comuns logo após um disparo de campanha. Funções puras, usadas na triagem de entrada e nos testes.
 */

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Saudação institucional / ausência em nome de outra empresa ou profissional (texto sem acento, minúsculo). */
const BUSINESS_GREETING: RegExp[] = [
  /obrigad[oa] (por|pelo) (entrar em contato|nos contatar|nos chamar|sua mensagem|seu contato|escolher|ter entrado em contato)/,
  /(seja|sejam) bem[- ]?vind[oa]s?\b/,
  /\bbem[- ]?vind[oa]s? (a|ao|as|aos|na|no)\b/,
  /\batendemos (toda|todo|todas|todos|em toda|em todo|a regiao|na regiao)\b/,
  /deixe (sua|seu|a sua|o seu) (mensagem|recado|nome)/,
  /(retornaremos|responderemos|entraremos em contato|daremos retorno) (assim que|o mais|em breve|logo)/,
  /(nosso|o) (atendimento|expediente) (funciona|e de|vai de|das)/,
  /(sou|somos) (o|a|os|as) .{2,40}(,|\.|!)? ?(como|em que) (posso|podemos) (te |lhe )?(ajudar|auxiliar)/,
  /(em que|como) (posso|podemos) (te |lhe )?(ajudar|auxiliar) (hoje|nesse momento|neste momento)/,
  /aguarde (um momento|alguns instantes|que (ja|logo) (vamos|iremos|vou)) /,
  /(este|esse) (e|eh) (um|o) (canal|numero) (oficial|de atendimento|exclusivo)/,
  /(mensagem|resposta) (automatica|automatizada)/,
];

/** Menu numérico de autoatendimento ("Digite 1 para...", "Escolha uma opção:"). */
const MENU_PROMPT: RegExp[] = [
  /\b(digite|tecle|envie|responda( com)?|selecione|escolha|informe) (o )?(numero|opcao|a opcao|uma (das )?opcoes)\b/,
  /\b(digite|tecle|envie|responda com) (o )?\d\b/,
  /escolha uma (das )?(opcoes|opcao)/,
  /(selecione|escolha) (o )?(setor|departamento|assunto)/,
];

const OPTICAL = /\b(oculos|otica|armac\w*|lentes?|grau|receita|solar|ray[- ]?ban|oakley|prada|miu ?miu|vogue|campanha|promoc\w*|desconto|oferta|aproveit\w*|interess\w*)\b/;

const NUMBERED_LINE = /^\s*(?:\d{1,2}\s*[-.)️⃣:]|[0-9]️?⃣|\*\d\*)/u;

/** Texto padrão de WhatsApp Business de terceiros (saudação institucional, ausência ou menu). */
export function isThirdPartyBusinessText(text: string) {
  const value = normalize(text);
  if (!value) return false;
  if (BUSINESS_GREETING.some((pattern) => pattern.test(value))) return true;
  if (MENU_PROMPT.some((pattern) => pattern.test(value))) return true;
  // Menu de 3+ linhas numeradas ("1 - Vendas", "2️⃣ Financeiro"...).
  return text.split("\n").filter((line) => NUMBERED_LINE.test(line)).length >= 3;
}

/**
 * Texto longo e formatado (várias linhas e/ou emojis) sem nenhuma relação com ótica ou com a campanha: estrutura
 * típica de mensagem pronta de empresa. Só é usado logo após um disparo.
 */
export function looksLikeBusinessTemplate(text: string) {
  const value = normalize(text);
  if (value.length < 120 || OPTICAL.test(value) || text.includes("?")) return false;
  const lines = text.split("\n").filter((line) => line.trim()).length;
  const emojis = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  return lines >= 3 || emojis >= 2;
}

/** Sem nenhuma palavra de ótica/campanha: candidato à classificação leve por IA quando chega logo após o disparo. */
export function lacksOpticalContext(text: string) {
  return !OPTICAL.test(normalize(text));
}
