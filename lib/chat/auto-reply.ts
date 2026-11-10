import "server-only";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";

/** Marca gravada em ChatMessage.authorName das mensagens do cliente reconhecidas como automáticas (sem menu). */
export const AUTO_REPLY_AUTHOR = "Resposta automática do contato";

/** Janela após um envio ativo (campanha/disparo) em que saudações não abrem o menu. */
const POST_DISPATCH_WINDOW_MS = 120_000;
/** Resposta em poucos segundos ao envio ativo: rápido demais para alguém ler e digitar. */
const INSTANT_REPLY_MS = 8_000;

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Mensagens de ausência/saudação do WhatsApp Business e afins (texto já sem acento e em minúsculas).
const AUTO_REPLY_PATTERNS: RegExp[] = [
  /agrade(ce|cemos)( (o|a))? (seu|sua|pelo|pela) (contato|mensagem)/,
  /agrade(ce|cemos) a sua mensagem/,
  /obrigad[oa] (pelo|por) (seu |entrar em )?contato/,
  /no momento (nao )?(podemos|estamos|conseguimos) (responder|atender|disponiveis)/,
  /nao estamos disponiveis/,
  /(estamos|esta) (fora do (horario|expediente)|ausentes?)/,
  // Só a frase afirmativa da empresa; "qual o horário de atendimento?" é pergunta de cliente.
  /nosso horario de (atendimento|funcionamento)/,
  /horario de (atendimento|funcionamento) (e|sera) (de|das)/,
  /mensagem automatica/,
  /resposta automatica/,
  /em breve (retornaremos|responderemos|entraremos em contato|daremos retorno)/,
  /assim que possivel (responderemos|retornaremos|daremos retorno)/,
  /retornaremos (o mais breve|assim que|em breve)/,
  /responderemos (o mais breve|assim que|em breve)/,
];

const GREETING = /^(oi+|ola|ola+|opa|eae|e ai|fala|bom dia|boa tarde|boa noite|tudo bem|tudo bom|como vai|como posso (te )?ajudar|em que posso (te )?ajudar|como podemos (te )?ajudar|seja bem[- ]vind[oa])\b/;

export const isAutoReplyText = (text: string) => {
  const value = normalize(text);
  return value.length > 0 && AUTO_REPLY_PATTERNS.some((pattern) => pattern.test(value));
};

/** Saudação curta (ex.: "Olá", "Bom dia, como podemos ajudar?"): sozinha não indica interesse na campanha. */
export const looksLikeGreeting = (text: string) => {
  const value = normalize(text).replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  return value.length > 0 && value.split(" ").length <= 8 && GREETING.test(value);
};

/** Último envio ativo de campanha/disparo ao número antes da mensagem recebida. */
async function lastDispatchBefore(phone: string, receivedAt: Date) {
  return prisma.campaignMessage.findFirst({
    where: { phone: { in: phoneVariants(phone) }, sentAt: { not: null, lte: receivedAt, gte: new Date(receivedAt.getTime() - POST_DISPATCH_WINDOW_MS) } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
}

export type AutoReplyVerdict = { kind: "pattern" | "instant" | "post_dispatch_greeting"; detail: string } | null;

/**
 * Decide se a mensagem recebida deve ser tratada como automática (não abre menu nem conta como resposta à campanha).
 * Clique em botão do modelo ou da lista é sempre interação explícita do cliente.
 */
export async function detectAutoReply(input: { phone: string; text: string; receivedAt: Date; explicitInteraction: boolean }): Promise<AutoReplyVerdict> {
  if (input.explicitInteraction) return null;
  if (isAutoReplyText(input.text)) return { kind: "pattern", detail: "texto típico de mensagem automática" };
  const dispatch = await lastDispatchBefore(input.phone, input.receivedAt);
  if (!dispatch?.sentAt) return null;
  const elapsed = input.receivedAt.getTime() - dispatch.sentAt.getTime();
  if (elapsed <= INSTANT_REPLY_MS) return { kind: "instant", detail: `respondeu ${Math.round(elapsed / 1000)}s após o disparo` };
  if (looksLikeGreeting(input.text)) return { kind: "post_dispatch_greeting", detail: `saudação ${Math.round(elapsed / 1000)}s após o disparo` };
  return null;
}
