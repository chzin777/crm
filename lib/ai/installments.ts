/**
 * Consulta de parcelas/crediário pela IA com validação de identidade (nome completo + CPF) e aprovação do operador.
 * Puro (sem banco/rede): detecção do pedido, CPF com dígito verificador, conferência do nome e o rascunho da resposta.
 */

export type InstallmentItem = { numero: string; parcela: string; vencimento: string | null; valor: number; posicao: string; pagamento: string | null; valorPago: number | null; tipo: string; loja?: string };
export type InstallmentLookup = { status: "ok"; found: boolean; name: string | null; items: InstallmentItem[] } | { status: "unavailable" };
export type InstallmentsSummary = {
  abertas: number;
  pagas: number;
  atrasadas: number;
  valorAberto: number;
  proximoVencimento: string | null;
  proximoValor: number | null;
  carnes: { numero: string; tipo: string; abertas: number; pagas: number; total: number; valorAberto: number }[];
  parcelasAbertas: { numero: string; parcela: string; vencimento: string | null; valor: number; atrasada: boolean }[];
};

export const FINANCIAL_ASK_IDENTITY = "Com certeza! Para eu localizar seu cadastro certinho e conferir suas parcelas, por favor me informe seu *nome completo* e o seu *CPF* 😊";
export const FINANCIAL_WAIT = "Perfeito! Já localizei seu cadastro aqui, só um segundinho que estou validando os detalhes das suas parcelas pra te passar certinho 😊";
export const FINANCIAL_CHECK_CPF = "Hmm, não consegui confirmar o cadastro com esse CPF 🤔 Pode conferir os números e me mandar de novo, junto com seu *nome completo*?";
export const FINANCIAL_INVALID_CPF = "Esse CPF parece estar incompleto ou com algum número trocado 🤔 Pode conferir e me mandar os 11 números de novo?";
export const FINANCIAL_STILL_WAITING = "Já estou validando os detalhes das suas parcelas, só mais um instante que já te passo certinho 😊";
export const FINANCIAL_UNAVAILABLE = "Não consegui acessar o sistema de crediário agora 😕 Vou te passar para um atendente conferir suas parcelas.";

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Pergunta sobre prestações, parcelas, carnê ou crediário (texto ou transcrição de áudio). */
const QUESTION = /\b(parcela|parcelas|prestac(ao|oes)|carne|carnes|crediario|boleto do carne|quanto (eu )?(devo|falta)|quantas (parcelas|prestacoes) (falta|faltam)|falta(m)? (pagar|quantas)|minha divida|meu debito|saldo devedor|segunda via do carne)\b/;
export function isInstallmentQuestion(text: string) {
  const value = plain(text);
  // "Parcela no cartão?" é dúvida de forma de pagamento, não consulta do crediário.
  if (/\b(parcel(a|o|ar|am)|divid(e|ir)) (em|no|sem juros|de)\b.*\b(cart(ao|oes)|vezes|x)\b|\bem quantas vezes\b|\bparcela no cartao\b/.test(value) && !/\b(carne|crediario|falta|faltam|devo)\b/.test(value)) return false;
  return QUESTION.test(value);
}

/** Última mensagem da IA foi o pedido de nome completo + CPF (fluxo aguardando a identificação). */
export const awaitingIdentity = (lastAiText: string | null | undefined) => !!lastAiText && /nome completo/i.test(lastAiText) && /CPF/.test(lastAiText);

export function isValidCpf(value: string) {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (size: number) => {
    let sum = 0;
    for (let index = 0; index < size; index += 1) sum += Number(cpf[index]) * (size + 1 - index);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** CPF no texto: "123.456.789-09", "123 456 789 09", "12345678909" ou ditado no áudio ("um dois três..."). */
export function extractCpf(text: string): { cpf: string; valid: boolean } | null {
  const spoken: Record<string, string> = { zero: "0", um: "1", uma: "1", dois: "2", duas: "2", tres: "3", quatro: "4", cinco: "5", seis: "6", meia: "6", sete: "7", oito: "8", nove: "9" };
  const normalized = plain(text).replace(/\b(zero|uma?|duas?|dois|tres|quatro|cinco|seis|meia|sete|oito|nove)\b/g, (word) => spoken[word] ?? word);
  const candidates = normalized.match(/\d[\d.\-\s/]{9,24}\d/g) ?? [];
  let fallback: { cpf: string; valid: boolean } | null = null;
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    // Telefone com DDD (10/11 dígitos começando com 55 ou 9 no 3º) não é CPF quando vier com "+55"/"tel".
    if (digits.length === 11 && isValidCpf(digits)) return { cpf: digits, valid: true };
    if (digits.length >= 10 && digits.length <= 12 && !fallback) fallback = { cpf: digits, valid: false };
  }
  return fallback;
}

export const maskCpf = (cpf: string) => {
  const digits = cpf.replace(/\D/g, "").padStart(11, "0");
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
};

const NAME_STOP = new Set(["de", "da", "do", "das", "dos", "e"]);
const nameTokens = (name: string) => plain(name).replace(/[^a-z\s]/g, " ").split(/\s+/).filter((token) => token.length > 1 && !NAME_STOP.has(token));

/**
 * Nome dito pelo cliente: "meu nome é Maria Souza", "sou a Maria Souza", ou uma linha só com nome (2+ palavras).
 * Saudações e o próprio CPF ficam de fora.
 */
export function extractFullName(text: string): string | null {
  const explicit = text.match(/(?:meu nome (?:completo )?(?:é|e)|me chamo|sou (?:o|a)|nome completo:?|nome:)\s+([A-Za-zÀ-ÿ' ]{3,80})/i);
  const pick = (value: string) => value.replace(/\s+(?:e\s+)?(?:o\s+)?(?:meu\s+)?cpf.*$/i, "").replace(/[,.;].*$/, "").trim();
  if (explicit) {
    const name = pick(explicit[1]);
    return name.split(/\s+/).length >= 1 ? name : null;
  }
  for (const line of text.split(/\n|,|;/)) {
    const candidate = line.replace(/\d[\d.\-\s/]*/g, " ").replace(/\b(cpf|meu|é|e|o|a)\b\s*:?/gi, " ").replace(/\s+/g, " ").trim();
    const words = candidate.split(" ").filter(Boolean);
    if (words.length >= 2 && words.length <= 7 && /^[A-Za-zÀ-ÿ' ]+$/.test(candidate) && !/\b(oi|ola|bom|boa|dia|tarde|noite|parcela|parcelas|carne|quero|saber|quanto|falta|obrigad)\w*\b/i.test(plain(candidate))) return candidate;
  }
  return null;
}

/** Nome completo = pelo menos nome e sobrenome. */
export const isFullName = (name: string | null | undefined) => !!name && nameTokens(name).length >= 2;

/**
 * O nome ouvido bate com o do VMSet? Primeiro nome igual (ou muito parecido, erro de transcrição) e, havendo
 * sobrenome, pelo menos um sobrenome em comum. Nome não informado não reprova (o operador confere).
 */
export function nameMatches(heard: string | null | undefined, vmset: string | null | undefined) {
  if (!heard || !vmset) return true;
  const said = nameTokens(heard);
  const registered = nameTokens(vmset);
  if (!said.length || !registered.length) return true;
  const close = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || levenshtein(a, b) <= 1));
  if (!close(said[0], registered[0])) return false;
  return said.length < 2 || said.slice(1).some((token) => registered.slice(1).some((other) => close(token, other)));
}

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

const OPEN = (item: InstallmentItem) => !/quitad/i.test(item.posicao);

export function summarizeInstallments(items: InstallmentItem[], today = new Date().toISOString().slice(0, 10)): InstallmentsSummary {
  const open = items.filter(OPEN).sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""));
  const next = open[0] ?? null;
  const groups = new Map<string, InstallmentItem[]>();
  for (const item of items) groups.set(item.numero, [...(groups.get(item.numero) ?? []), item]);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    abertas: open.length,
    pagas: items.length - open.length,
    atrasadas: open.filter((item) => !!item.vencimento && item.vencimento < today).length,
    valorAberto: round(open.reduce((sum, item) => sum + item.valor, 0)),
    proximoVencimento: next?.vencimento ?? null,
    proximoValor: next?.valor ?? null,
    carnes: [...groups.entries()]
      .map(([numero, list]) => ({ numero, tipo: list[0].tipo, abertas: list.filter(OPEN).length, pagas: list.filter((item) => !OPEN(item)).length, total: list.length, valorAberto: round(list.filter(OPEN).reduce((sum, item) => sum + item.valor, 0)) }))
      .filter((carne) => carne.abertas > 0),
    parcelasAbertas: open.slice(0, 24).map((item) => ({ numero: item.numero, parcela: item.parcela, vencimento: item.vencimento, valor: item.valor, atrasada: !!item.vencimento && item.vencimento < today })),
  };
}

const brl = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brDate = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "-");

/** Rascunho humanizado da resposta ao cliente (o operador confere e pode editar antes de enviar). */
export function draftInstallmentsMessage(name: string | null, summary: InstallmentsSummary) {
  const first = name ? name.trim().split(/\s+/)[0] : "";
  const hello = first ? `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}, ` : "";
  if (!summary.abertas) return `${hello}conferi aqui e você não tem nenhuma parcela em aberto no crediário. Está tudo quitado! 🎉 Posso ajudar em algo mais?`;
  const lines = [
    `${hello}conferi seu crediário aqui 😊`,
    "",
    `• Parcelas em aberto: *${summary.abertas}*${summary.atrasadas ? ` (${summary.atrasadas} vencida${summary.atrasadas > 1 ? "s" : ""})` : ""}`,
    `• Parcelas já pagas: ${summary.pagas}`,
    `• Valor em aberto: *${brl(summary.valorAberto)}*`,
    summary.proximoVencimento ? `• Próximo vencimento: *${brDate(summary.proximoVencimento)}* — ${brl(summary.proximoValor ?? 0)}` : "",
    "",
    summary.atrasadas ? "Se quiser, posso te ajudar a regularizar as parcelas vencidas. É só me avisar! 🙌" : "Qualquer dúvida sobre as parcelas, é só me chamar! 🙌",
  ];
  return lines.filter((line, index, all) => line || (index > 0 && all[index - 1])).join("\n").trim();
}

export type FinancialStep =
  | { step: "ask_identity" }
  | { step: "invalid_cpf" }
  | { step: "lookup"; cpf: string; heardName: string | null; source: "mensagem" | "cadastro" };

/**
 * Passo do fluxo: sem CPF válido (e sem CPF confirmado do cadastro vinculado ao telefone) a IA pede nome completo + CPF;
 * CPF com dígito errado → pede para conferir; CPF válido → consulta o VMSet.
 */
export function financialStep(input: { text: string; linkedCpf?: string | null }): FinancialStep {
  const found = extractCpf(input.text);
  const heardName = extractFullName(input.text);
  if (found?.valid) return { step: "lookup", cpf: found.cpf, heardName, source: "mensagem" };
  if (found && !found.valid) return { step: "invalid_cpf" };
  if (input.linkedCpf && isValidCpf(input.linkedCpf)) return { step: "lookup", cpf: input.linkedCpf.replace(/\D/g, ""), heardName, source: "cadastro" };
  return { step: "ask_identity" };
}

/** Card de aprovação como o teste /ia mostra (sem CPF completo). */
export type PlaygroundFinancial = {
  step: "ask_identity" | "invalid_cpf" | "not_found" | "name_mismatch" | "unavailable" | "still_waiting" | "approval" | "direct";
  cpfMasked?: string;
  source?: "mensagem" | "cadastro";
  approval?: { customerNameVmset: string | null; customerCpfMasked: string; installmentsSummary: InstallmentsSummary; draftMessage: string; transcribedText: string; nameMatches: boolean };
};
