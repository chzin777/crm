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
import { customerMessages, formatContext, interpretDecision, preAgentOutcome, SIMULATED_PROFILES, simulatedHistory, transcriptLine, type AgentDecision, type AgentOutcome, type SimulatedProfileId } from "@/lib/ai/agent-core";
import type { ChatConversation } from "@/generated/prisma/client";

/** Nome gravado nas mensagens da IA (o atendimento vê quem respondeu). */
export const AI_AUTHOR = "Assistente IA";
/** Marca da mensagem de sistema da transferência: depois dela a IA não volta a responder nesta conversa. */
export const AI_HANDOFF_MARK = "IA transferiu o atendimento";
/** Espera curta para juntar mensagens seguidas do cliente numa só resposta. */
const DEBOUNCE_MS = 6_000;
const CREDIT_RETRY_MS = 10 * 60 * 1000;

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

/** Fila de destino da transferência: a fixa da configuração, a escolhida pela IA ou a atual. Mesma regra no teste. */
async function handoffQueue(settings: AiSettings, currentQueueId: string | null, queueName?: string) {
  let queueId = settings.handoffQueueId || currentQueueId;
  if (!settings.handoffQueueId && settings.aiChoosesQueue && queueName) {
    const match = await prisma.chatQueue.findFirst({ where: { archivedAt: null, name: { equals: queueName.trim(), mode: "insensitive" } }, select: { id: true } });
    if (match) queueId = match.id;
  }
  const queue = queueId ? await prisma.chatQueue.findUnique({ where: { id: queueId }, select: { id: true, name: true, archivedAt: true } }) : null;
  return queue && !queue.archivedAt ? queue : null;
}

async function handoff(conversation: ChatConversation, settings: AiSettings, reason: string, queueName?: string) {
  const contact = await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } });
  const target = await handoffQueue(settings, conversation.queueId, queueName);

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

/** Atendimento real: lê o anexo mais recente do cliente (baixado da Meta e guardado no MinIO pelo webhook). Falha segue só com o texto. */
async function customerMedia(attachments: (ChatAttachment | null)[], meta: Omit<AiCallMeta, "maxTokens">) {
  const latest = attachments.filter((item): item is ChatAttachment => !!item?.key && !!aiAttachmentKind(item.mime, item.name) && item.size <= AI_ATTACHMENT_MAX_BYTES).at(-1);
  if (!latest) return null;
  try {
    return await prepareMedia({ name: latest.name, mime: latest.mime, data: await readFile(latest.key) }, meta);
  } catch (error) {
    console.error(`[ai] ${meta.conversationId ?? "teste"}: anexo ignorado:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export type AgentRunInput = {
  settings: AiSettings;
  /** Mensagens do cliente desde a última resposta (regra de palavra de transferência). */
  pendingText: string;
  /** O cliente mandou mídia nessas mensagens (gatilho de transferência por mídia). */
  hasMedia: boolean;
  /** Respostas que a IA já deu nesta conversa (limite de respostas). */
  aiReplies: number;
  /** Contexto do cliente montado por formatContext (cadastro, fila, ERP e conversa). */
  buildContext: (media: PreparedMedia | null) => Promise<string> | string;
  /** Anexo da última mensagem do cliente, carregado só se a IA for de fato responder. */
  loadMedia: () => Promise<PreparedMedia | null>;
  meta: Omit<AiCallMeta, "maxTokens">;
  /** Só no teste: lê o anexo mesmo com o gatilho de mídia ligado, para ver como a IA o interpretaria. */
  ignoreMediaTrigger?: boolean;
};
export type AgentRun = { outcome: AgentOutcome; media: PreparedMedia | null; mediaTriggerSkipped: boolean };

/**
 * Motor único do agente de IA: o atendimento real (WhatsApp) e o teste da página /ia passam por aqui.
 * Regras antes da IA → anexo (visão, transcrição, PDF, documento) → prompt com base de conhecimento e filas →
 * modelo → interpretação. Erro do modelo sobe para quem chamou (o WhatsApp transfere; o teste mostra o erro).
 */
export async function runAiAgent(input: AgentRunInput): Promise<AgentRun> {
  const { settings } = input;
  const early = preAgentOutcome(settings, input);
  if (early) return { outcome: early, media: null, mediaTriggerSkipped: false };
  const mediaTriggerSkipped = !!input.ignoreMediaTrigger && settings.handoffOnMedia && input.hasMedia;

  const media = await input.loadMedia();
  // Áudio pedindo atendente: a palavra de transferência vale também na transcrição.
  if (media?.transcript && asksForHuman(settings, media.transcript)) {
    return { outcome: { action: "handoff", reply: "", reason: "Cliente pediu para falar com uma pessoa (áudio)", queue: "", trigger: "keyword" }, media, mediaTriggerSkipped };
  }
  const [context, info, queues] = await Promise.all([
    input.buildContext(media),
    knowledge(settings),
    settings.aiChoosesQueue && !settings.handoffQueueId ? prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { name: true }, orderBy: { order: "asc" } }) : [],
  ]);
  const decision = await aiJson<AgentDecision>(
    [
      { role: "system", content: systemPrompt(settings, queues.map((queue) => queue.name), info, !!media) },
      { role: "user", content: media ? [{ type: "text", text: context }, ...media.parts] : context },
    ],
    { ...input.meta, maxTokens: 700 },
  );
  return { outcome: interpretDecision(decision), media, mediaTriggerSkipped };
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
  const aiReplies = await prisma.chatMessage.count({ where: { conversationId, author: "bot", authorName: AI_AUTHOR } });
  const meta = { feature: "agent", conversationId };

  let run: AgentRun;
  try {
    run = await runAiAgent({
      settings,
      pendingText: pending.map((item) => item.text).join("\n"),
      hasMedia: pending.some((item) => item.attachment || item.metaMedia),
      aiReplies,
      meta,
      loadMedia: () => customerMedia(pending.map((item) => item.attachment as ChatAttachment | null), meta),
      buildContext: async () => (await conversationContext(conversation, { includeHistory: settings.useCustomerOrders })).text,
    });
  } catch (error) {
    // IA fora do ar: ninguém fica sem resposta, a conversa vai para a equipe.
    return handoff(conversation, settings, error instanceof AiError ? `IA indisponível (${error.message})` : "IA indisponível");
  }
  const { outcome } = run;
  if (outcome.trigger !== "ai") return handoff(conversation, settings, outcome.reason);

  // Pode ter sido assumida enquanto a IA pensava.
  const fresh = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!fresh || fresh.assigneeId || fresh.closedAt) return;

  if (outcome.action === "handoff") {
    if (outcome.reply && !settings.handoffMessage.trim()) await sendAutomaticMessage(fresh, outcome.reply, undefined, undefined, AI_AUTHOR);
    return handoff(fresh, settings, outcome.reason, outcome.queue);
  }
  await sendAutomaticMessage(fresh, outcome.reply, undefined, undefined, AI_AUTHOR);
  if (outcome.action === "resolved" && settings.closeWhenResolved) {
    // A resposta da IA já é a despedida: sem a mensagem padrão nem pesquisa.
    await closeConversation(fresh, null, `Atendimento resolvido pela IA: ${outcome.reason}`, "");
  }
}

export type PlaygroundMessage = { from: "customer" | "ai"; text: string };
export type PlaygroundOptions = { profile?: SimulatedProfileId; ignoreMediaTrigger?: boolean };
export type PlaygroundResult = AgentOutcome & {
  /** O que o cliente receberia no WhatsApp (resposta e/ou mensagem de transferência). */
  messages: string[];
  /** Fila para onde a conversa iria na transferência. */
  handoffQueue: string;
  /** Encerraria a conversa (resolvido com a opção ligada). */
  wouldClose: boolean;
  /** Anexo da última mensagem do cliente, como a IA o recebeu. */
  media?: { kind: AiAttachmentKind; summary: string; transcript?: string };
  /** O gatilho de mídia foi ignorado só no teste: no atendimento real a conversa iria direto para a equipe. */
  mediaHandoff?: boolean;
};

/**
 * Teste da página /ia: mesmo motor (runAiAgent) e mesmo formato de contexto do WhatsApp, com os parâmetros
 * da tela (mesmo ainda não salvos) e um cliente fictício (novo ou recorrente com pedidos no ERP).
 * Não envia nada ao cliente. O anexo (opcional) pertence à última mensagem do cliente.
 */
export async function simulateAgent(settings: AiSettings, messages: PlaygroundMessage[], userId: string, attachment?: AiMediaInput, options: PlaygroundOptions = {}): Promise<PlaygroundResult> {
  const meta = { feature: "playground", userId, settings };
  const profile = SIMULATED_PROFILES.find((item) => item.id === options.profile) ?? SIMULATED_PROFILES[0];
  const lastAi = messages.map((message) => message.from).lastIndexOf("ai");
  const pendingText = messages.slice(lastAi + 1).filter((message) => message.from === "customer").map((message) => message.text).join("\n");
  const now = Date.now();

  const run = await runAiAgent({
    settings,
    pendingText,
    hasMedia: !!attachment,
    aiReplies: messages.filter((message) => message.from === "ai").length,
    meta,
    ignoreMediaTrigger: options.ignoreMediaTrigger,
    loadMedia: async () => (attachment ? prepareMedia(attachment, meta) : null),
    buildContext: (media) => {
      const history = media ? attachSummary(messages, media.summary) : messages;
      // Mesmo formato de linha do WhatsApp (IA aparece como "Robô"), um minuto entre mensagens.
      const conversation = history
        .map((message, index) => transcriptLine({ author: message.from === "customer" ? "customer" : "bot", authorName: message.from === "ai" ? AI_AUTHOR : null, text: message.text, internal: false, attachment: null, createdAt: new Date(now - (history.length - index) * 60_000) }))
        .filter(Boolean)
        .join("\n");
      return formatContext({ contactName: profile.name, queueName: null, subject: "", includeHistory: settings.useCustomerOrders, history: simulatedHistory(profile.id), conversation });
    },
  });

  const { outcome, media } = run;
  const target = outcome.action === "handoff" ? await handoffQueue(settings, null, outcome.queue) : null;
  return {
    ...outcome,
    messages: customerMessages(outcome, settings, { customer: profile.name, queue: target?.name }),
    handoffQueue: target?.name ?? "",
    wouldClose: outcome.action === "resolved" && settings.closeWhenResolved,
    media: media ? { kind: media.kind, summary: media.summary, ...(media.transcript !== undefined ? { transcript: media.transcript } : {}) } : undefined,
    mediaHandoff: run.mediaTriggerSkipped || undefined,
  };
}
