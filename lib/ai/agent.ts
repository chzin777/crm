import "server-only";
import { prisma } from "@/lib/prisma";
import { addSystemMessage, firstDispatch, isWindowOpen } from "@/lib/chat/conversation";
import { closeConversation } from "@/lib/chat/actions";
import { readMenuState, saveMenuState } from "@/lib/chat/menu";
import { hoursFor } from "@/lib/chat/operations";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { describeSchedule, GLOBAL_HOURS_SCOPE, isOpenAt, sanitizeSchedule } from "@/lib/chat/hours";
import { fillVariables } from "@/lib/chat/text";
import { formatBr } from "@/lib/br-time";
import { aiConfigured, aiJson, AiError, transcribeAudio, type AiCallMeta } from "@/lib/ai/openai";
import { AI_ATTACHMENT_MAX_BYTES, aiAttachmentKind, type AiAttachmentKind } from "@/lib/ai/attachments";
import { attachSummary, MEDIA_RULES, mediaParts, type AiMediaInput, type PreparedMedia } from "@/lib/ai/multimodal";
import { readFile } from "@/lib/minio";
import type { ChatAttachment } from "@/lib/chat/media-rules";
import { BRAND_RULES, catalog, conversationContext } from "@/lib/ai/assist";
import { readAiSettings, readAiStatus } from "@/lib/ai/store";
import { AI_TONES, aiShouldAttend, asksForHuman, type AiSettings } from "@/lib/ai/settings";
import type { ChatConversation } from "@/generated/prisma/client";

/** Nome gravado nas mensagens da IA (o atendimento vê quem respondeu). */
export const AI_AUTHOR = "Assistente IA";
/** Marca da mensagem de sistema da transferência: depois dela a IA não volta a responder nesta conversa. */
export const AI_HANDOFF_MARK = "IA transferiu o atendimento";
/** Espera curta para juntar mensagens seguidas do cliente numa só resposta. */
const DEBOUNCE_MS = 6_000;
const CREDIT_RETRY_MS = 10 * 60 * 1000;

type AgentDecision = { reply?: string; action?: "reply" | "handoff" | "resolved"; reason?: string; queue?: string };

const handedOff = (conversationId: string) =>
  prisma.chatMessage.findFirst({ where: { conversationId, author: "system", text: { startsWith: AI_HANDOFF_MARK } }, select: { id: true } }).then(Boolean);

/**
 * Chamado pelo fluxo automático depois de gravar a mensagem. Devolve true quando a IA assume
 * (o menu e o aviso de fora do horário não rodam); a resposta sai em segundo plano.
 */
export async function aiTakeOver(conversation: ChatConversation, messageId: string) {
  if (!aiConfigured()) return false;
  const settings = await readAiSettings();
  if (!settings.autonomousEnabled) return false;
  const now = new Date();
  const rule = await hoursFor(conversation.queueId);
  const storeOpen = !rule || isOpenAt(rule, now);
  if (!aiShouldAttend(settings, conversation, now, storeOpen)) return false;
  if (await handedOff(conversation.id)) return false;

  // Sem crédito, a conversa segue o fluxo normal em vez de ficar sem resposta.
  const status = await readAiStatus();
  if (status.creditExhausted && status.lastErrorAt && now.getTime() - new Date(status.lastErrorAt).getTime() < CREDIT_RETRY_MS) return false;

  // O cliente escreveu: aviso de silêncio e fechamento pendentes perdem o efeito.
  const state = readMenuState(conversation.menuState);
  if (state.warnedAt || state.closeAt) {
    state.warnedAt = null;
    state.closeAt = null;
    state.closePhrase = null;
    await saveMenuState(conversation.id, state);
  }

  setTimeout(() => {
    void respond(conversation.id, messageId).catch((error) => console.error("[ai] atendimento autônomo:", error));
  }, DEBOUNCE_MS);
  console.log(`[ai] ${conversation.id}: assumida pela IA (${conversation.status})`);
  return true;
}

async function knowledge(settings: AiSettings) {
  const parts: string[] = [];
  if (settings.useStores) {
    const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { name: true, address: true, addressNumber: true, city: true, state: true, neighborhoods: true } });
    if (stores.length) {
      parts.push(`Lojas:\n${stores.map((store) => `- ${store.name}: ${[store.address && `${store.address}${store.addressNumber ? `, ${store.addressNumber}` : ""}`, store.neighborhoods[0], store.city && `${store.city}${store.state ? `/${store.state}` : ""}`].filter(Boolean).join(" · ") || "endereço não cadastrado"}`).join("\n")}`);
    }
  }
  if (settings.useOperatingHours) {
    const rows = await prisma.operatingHours.findMany({ where: { enabled: true }, select: { scope: true, schedule: true } });
    const queues = await prisma.chatQueue.findMany({ where: { id: { in: rows.map((row) => row.scope) } }, select: { id: true, name: true } });
    const lines = rows.map((row) => `- ${row.scope === GLOBAL_HOURS_SCOPE ? "Atendimento" : `Fila ${queues.find((queue) => queue.id === row.scope)?.name ?? "?"}`}: ${describeSchedule(sanitizeSchedule(row.schedule))}`);
    if (lines.length) parts.push(`Horário de atendimento (Brasília):\n${lines.join("\n")}`);
  }
  for (const topic of settings.topics.filter((item) => item.enabled && item.content.trim())) parts.push(`${topic.title}:\n${topic.content.trim()}`);
  if (settings.canQuotePrices) {
    const products = await catalog();
    if (products) parts.push(`Preços médios praticados (use só como referência "a partir de", confirmando na loja):\n${products}`);
  }
  return parts.join("\n\n");
}

function rules(settings: AiSettings, queueNames: string[]) {
  const handoff = [
    "Transfira para uma pessoa (action \"handoff\") quando:",
    "- o cliente pedir para falar com uma pessoa;",
    settings.handoffOnComplaint ? "- o cliente reclamar, estiver irritado ou relatar problema com pedido, produto ou atendimento;" : "",
    settings.handoffOnPurchaseIntent ? "- o cliente quiser fechar uma compra, fazer orçamento com receita ou negociar condições;" : "",
    settings.handoffWhenUnsure ? "- a resposta não estiver nas informações abaixo ou você não tiver certeza;" : "",
  ].filter(Boolean);
  return [
    BRAND_RULES,
    `Você é ${settings.agentName}, assistente virtual que atende clientes pelo WhatsApp. Se for a primeira resposta da conversa, apresente-se brevemente como assistente virtual.`,
    `Tom de voz: ${(AI_TONES.find((tone) => tone.id === settings.tone) ?? AI_TONES[0]).instruction}`,
    "Responda só com base nas informações abaixo e no histórico do cliente. Não prometa o que não está escrito aqui.",
    settings.useCustomerOrders ? "Você pode informar ao cliente dados dos pedidos dele que aparecem no histórico do ERP (data, loja, situação)." : "Não comente pedidos ou compras anteriores do cliente.",
    settings.canQuotePrices ? "" : "Não informe preços nem valores: diga que a loja passa o orçamento.",
    handoff.join("\n"),
    settings.closeWhenResolved ? "Use action \"resolved\" quando o cliente confirmar que a dúvida foi resolvida ou se despedir agradecendo; nesse caso a resposta deve ser uma despedida curta." : "",
    settings.extraInstructions.trim() ? `Instruções da empresa:\n${settings.extraInstructions.trim()}` : "",
    settings.aiChoosesQueue && queueNames.length ? `Filas disponíveis para transferência: ${queueNames.join(", ")}. Em "queue", indique a mais adequada (ou vazio).` : "",
    `Responda SEMPRE em JSON: {"reply": "mensagem ao cliente (vazia só se for transferir sem falar)", "action": "reply" | "handoff" | "resolved", "reason": "motivo curto para a equipe", "queue": "nome da fila ou vazio"}.`,
  ].filter(Boolean).join("\n\n");
}

async function handoff(conversation: ChatConversation, settings: AiSettings, reason: string, queueName?: string) {
  const contact = await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } });
  let queueId = settings.handoffQueueId || conversation.queueId;
  if (!settings.handoffQueueId && settings.aiChoosesQueue && queueName) {
    const match = await prisma.chatQueue.findFirst({ where: { archivedAt: null, name: { equals: queueName.trim(), mode: "insensitive" } }, select: { id: true } });
    if (match) queueId = match.id;
  }
  const queue = queueId ? await prisma.chatQueue.findUnique({ where: { id: queueId }, select: { id: true, name: true, archivedAt: true } }) : null;
  const target = queue && !queue.archivedAt ? queue : null;

  if (settings.handoffMessage.trim() && isWindowOpen(conversation.lastInboundAt)) {
    await sendAutomaticMessage(conversation, fillVariables(settings.handoffMessage, { customer: contact?.name, queue: target?.name }), undefined, undefined, AI_AUTHOR);
  }
  const state = readMenuState(conversation.menuState);
  state.stopped = true;
  await saveMenuState(conversation.id, state);
  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { status: "waiting", waitingSince: conversation.waitingSince ?? new Date(), queueId: target?.id ?? conversation.queueId },
  });
  await addSystemMessage(conversation.id, `${AI_HANDOFF_MARK}${target ? ` para a fila ${target.name}` : ""}: ${reason}`);
  console.log(`[ai] ${conversation.id}: transferida (${reason})`);
}

async function respond(conversationId: string, messageId: string) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.assigneeId || conversation.closedAt) return;
  // Chegou mensagem mais nova: a espera dela responde tudo de uma vez.
  const latest = await prisma.chatMessage.findFirst({ where: { conversationId, author: "customer" }, orderBy: { createdAt: "desc" }, select: { id: true, text: true } });
  if (latest?.id !== messageId) return;
  if (!(await firstDispatch(`ai:${messageId}`))) return;
  if (await handedOff(conversationId)) return;
  const settings = await readAiSettings();
  if (!settings.autonomousEnabled) return;

  // Mensagens do cliente desde a última resposta (bot ou atendente).
  const lastAnswer = await prisma.chatMessage.findFirst({ where: { conversationId, author: { in: ["bot", "agent"] }, internal: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const pending = await prisma.chatMessage.findMany({ where: { conversationId, author: "customer", ...(lastAnswer ? { createdAt: { gt: lastAnswer.createdAt } } : {}) }, select: { text: true, attachment: true, metaMedia: true } });
  const pendingText = pending.map((item) => item.text).join("\n");

  if (asksForHuman(settings, pendingText)) return handoff(conversation, settings, "Cliente pediu para falar com uma pessoa");
  if (settings.handoffOnMedia && pending.some((item) => item.attachment || item.metaMedia)) return handoff(conversation, settings, "Cliente enviou foto, documento ou áudio (ex.: receita)");
  const aiReplies = await prisma.chatMessage.count({ where: { conversationId, author: "bot", authorName: AI_AUTHOR } });
  if (aiReplies >= settings.maxAiReplies) return handoff(conversation, settings, `Limite de ${settings.maxAiReplies} respostas da IA atingido`);

  const [context, info, queues] = await Promise.all([
    conversationContext(conversation, { includeHistory: settings.useCustomerOrders }),
    knowledge(settings),
    settings.aiChoosesQueue && !settings.handoffQueueId ? prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { name: true }, orderBy: { order: "asc" } }) : [],
  ]);

  // Foto, áudio ou documento do cliente: a IA lê o anexo mais recente (falha no arquivo não impede a resposta).
  const media = await customerMedia(pending.map((item) => item.attachment as ChatAttachment | null), { feature: "agent", conversationId });
  if (media?.transcript && asksForHuman(settings, media.transcript)) return handoff(conversation, settings, "Cliente pediu para falar com uma pessoa (áudio)");

  let decision: AgentDecision;
  try {
    decision = await aiJson<AgentDecision>(
      [
        { role: "system", content: systemPrompt(settings, queues.map((queue) => queue.name), info, !!media) },
        { role: "user", content: media ? [{ type: "text", text: context.text }, ...media.parts] : context.text },
      ],
      { feature: "agent", conversationId, maxTokens: 700 },
    );
  } catch (error) {
    // IA fora do ar: ninguém fica sem resposta, a conversa vai para a equipe.
    return handoff(conversation, settings, error instanceof AiError ? `IA indisponível (${error.message})` : "IA indisponível");
  }

  // Pode ter sido assumida enquanto a IA pensava.
  const fresh = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!fresh || fresh.assigneeId || fresh.closedAt) return;

  const reply = decision.reply?.trim() ?? "";
  const reason = decision.reason?.trim() || "Sem motivo informado";
  if (decision.action === "handoff") {
    if (reply && !settings.handoffMessage.trim()) await sendAutomaticMessage(fresh, reply, undefined, undefined, AI_AUTHOR);
    return handoff(fresh, settings, reason, decision.queue);
  }
  if (!reply) return handoff(fresh, settings, "A IA não soube responder");
  await sendAutomaticMessage(fresh, reply, undefined, undefined, AI_AUTHOR);
  if (decision.action === "resolved" && settings.closeWhenResolved) {
    // A resposta da IA já é a despedida: sem a mensagem padrão nem pesquisa.
    await closeConversation(fresh, null, `Atendimento resolvido pela IA: ${reason}`, "");
  }
}

const systemPrompt = (settings: AiSettings, queueNames: string[], info: string, hasMedia = false) =>
  `${rules(settings, queueNames)}${hasMedia ? `\n\n${MEDIA_RULES}` : ""}\n\nAgora: ${formatBr(new Date(), { dateStyle: "full", timeStyle: "short" })} (Brasília).\n\nInformações que você pode usar:\n${info || "(nenhuma informação cadastrada: transfira dúvidas específicas)"}`;

/** Anexo pronto para a IA: áudio é transcrito (registrado no consumo); documento vira texto; imagem e PDF seguem nativos. */
export async function prepareMedia(media: AiMediaInput, meta: Omit<AiCallMeta, "maxTokens">): Promise<PreparedMedia> {
  const kind = aiAttachmentKind(media.mime, media.name);
  if (!kind) throw new AiError("Formato de anexo não suportado pela IA.", 422);
  if (media.data.byteLength > AI_ATTACHMENT_MAX_BYTES) throw new AiError("Anexo acima de 10 MB.", 422);
  const transcript = kind === "audio" ? await transcribeAudio(media, meta) : undefined;
  try {
    return mediaParts(kind, media, transcript);
  } catch (error) {
    console.error("[ai] leitura do anexo:", error);
    throw new AiError("Não foi possível ler o conteúdo deste documento.", 422);
  }
}

/** Atendimento real: lê o anexo mais recente do cliente (guardado no MinIO). Qualquer falha segue só com o texto. */
async function customerMedia(attachments: (ChatAttachment | null)[], meta: Omit<AiCallMeta, "maxTokens">) {
  const latest = attachments.filter((item): item is ChatAttachment => !!item?.key && !!aiAttachmentKind(item.mime, item.name) && item.size <= AI_ATTACHMENT_MAX_BYTES).at(-1);
  if (!latest) return null;
  try {
    return await prepareMedia({ name: latest.name, mime: latest.mime, data: await readFile(latest.key) }, meta);
  } catch (error) {
    console.error(`[ai] ${meta.conversationId}: anexo ignorado:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export type PlaygroundMessage = { from: "customer" | "ai"; text: string };
export type PlaygroundResult = {
  action: "reply" | "handoff" | "resolved";
  reply: string;
  reason: string;
  queue: string;
  byKeyword: boolean;
  /** Anexo da última mensagem do cliente, como a IA o recebeu. */
  media?: { kind: AiAttachmentKind; summary: string; transcript?: string };
  /** O gatilho "cliente enviou mídia" está ligado: no atendimento real a conversa iria direto para a equipe. */
  mediaHandoff?: boolean;
};

/**
 * Teste da página /ia: simula a conversa com os parâmetros da tela (mesmo ainda não salvos),
 * com as mesmas regras e informações do atendimento real. Não envia nada ao cliente.
 * O anexo (opcional) pertence à última mensagem do cliente; anexos anteriores chegam como resumo no texto.
 */
export async function simulateAgent(settings: AiSettings, messages: PlaygroundMessage[], userId: string, attachment?: AiMediaInput): Promise<PlaygroundResult> {
  const meta = { feature: "playground", userId, settings };
  const media = attachment ? await prepareMedia(attachment, meta) : null;
  const history = media ? attachSummary(messages, media.summary) : messages;
  const summary = media ? { kind: media.kind, summary: media.summary, ...(media.transcript !== undefined ? { transcript: media.transcript } : {}) } : undefined;
  const mediaHandoff = media ? settings.handoffOnMedia : undefined;

  const lastAi = history.map((message) => message.from).lastIndexOf("ai");
  const pendingText = history.slice(lastAi + 1).filter((message) => message.from === "customer").map((message) => message.text).join("\n");
  if (asksForHuman(settings, pendingText)) return { action: "handoff", reply: settings.handoffMessage, reason: "Cliente pediu para falar com uma pessoa (palavra de transferência)", queue: "", byKeyword: true, media: summary, mediaHandoff };

  const [info, queues] = await Promise.all([
    knowledge(settings),
    settings.aiChoosesQueue && !settings.handoffQueueId ? prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { name: true }, orderBy: { order: "asc" } }) : [],
  ]);
  const transcript = history.map((message) => `${message.from === "customer" ? "Cliente" : settings.agentName}: ${message.text}`).join("\n");
  const text = `Conversa de teste (cliente fictício, sem histórico no ERP):\n${transcript}`;
  const decision = await aiJson<AgentDecision>(
    [
      { role: "system", content: systemPrompt(settings, queues.map((queue) => queue.name), info, !!media) },
      { role: "user", content: media ? [{ type: "text", text }, ...media.parts] : text },
    ],
    { ...meta, maxTokens: 700 },
  );
  const action = decision.action === "handoff" || decision.action === "resolved" ? decision.action : "reply";
  return { action, reply: decision.reply?.trim() ?? "", reason: decision.reason?.trim() ?? "", queue: decision.queue?.trim() ?? "", byKeyword: false, media: summary, mediaHandoff };
}
