import "server-only";
import { prisma } from "@/lib/prisma";
import { addSystemMessage, firstDispatch, isWindowOpen } from "@/lib/chat/conversation";
import { closeConversation } from "@/lib/chat/actions";
import { readMenuState } from "@/lib/chat/menu";
import { aiTakeoverPatch, handoffPatch, isAiHandling } from "@/lib/chat/queue-rules";
import { withTyping } from "@/lib/chat/typing";
import { sendTypingIndicator } from "@/lib/meta-whatsapp";
import { Prisma } from "@/generated/prisma/client";
import { hoursFor } from "@/lib/chat/operations";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { describeSchedule, GLOBAL_HOURS_SCOPE, isOpenAt, sanitizeSchedule } from "@/lib/chat/hours";
import { fillVariables } from "@/lib/chat/text";
import { aiConfigured, aiJson, AiError, transcribeAudio, type AiCallMeta } from "@/lib/ai/openai";
import { AI_ATTACHMENT_MAX_BYTES, aiAttachmentKind, type AiAttachmentKind } from "@/lib/ai/attachments";
import { attachSummary, MEDIA_RULES, mediaParts, type AiMediaInput, type PreparedMedia } from "@/lib/ai/multimodal";
import { readFile } from "@/lib/minio";
import { CATALOG_FOUND_RULE, productImageFlow, VISION_PROMPT, type SearchLog, type VisionResult } from "@/lib/ai/catalog-search";
import { catalogProducts, searchErpCatalog } from "@/lib/ai/catalog-db";
import { consultarEstoqueProduto } from "@/lib/ai/stock-db";
import { STOCK_TOOL, type StockLog } from "@/lib/ai/stock";
import { detectPromptInjection, INJECTION_ALERT, securityLog, type InjectionCheck } from "@/lib/ai/guard";
import type { ChatAttachment } from "@/lib/chat/media-rules";
import { catalog, conversationContext } from "@/lib/ai/assist";
import { readAiSettings, readAiStatus } from "@/lib/ai/store";
import { aiShouldAttend, asksForHuman, type AiSettings } from "@/lib/ai/settings";
import { buildSystemPrompt, customerMessages, formatContext, interpretDecision, preAgentOutcome, SIMULATED_PROFILES, simulatedHistory, transcriptLine, type AgentDecision, type AgentOutcome, type SimulatedProfileId } from "@/lib/ai/agent-core";
import type { ChatConversation } from "@/generated/prisma/client";

/**
 * A IA vinha atendendo, mas deixou de poder (horário, configuração, crédito): a conversa volta para a fila humana
 * a partir de agora, sem menu no meio da conversa. Devolve true quando liberou (o fluxo automático para aí).
 */
export async function releaseFromAi(conversation: ChatConversation) {
  if (!isAiHandling(conversation)) return false;
  const state = readMenuState(conversation.menuState);
  state.aiActive = false;
  state.stopped = true;
  state.notifiedPosition = null;
  state.positionSince = null;
  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { ...handoffPatch(conversation.queueId, new Date()), menuState: state as unknown as Prisma.InputJsonValue },
  });
  await addSystemMessage(conversation.id, "IA fora do horário ou desligada: a conversa entrou na fila para um atendente");
  console.log(`[ai] ${conversation.id}: devolvida para a fila (IA não atende mais agora)`);
  return true;
}

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
  const wasHandling = isAiHandling(conversation);
  state.warnedAt = null;
  state.closeAt = null;
  state.closePhrase = null;
  // Atendimento da IA fica fora da fila humana: sem posição, sem "Você avançou na fila" e sem alerta de espera.
  state.aiActive = true;
  state.notifiedPosition = null;
  state.positionSince = null;
  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { ...(wasHandling && conversation.status === "bot" ? {} : aiTakeoverPatch()), menuState: state as unknown as Prisma.InputJsonValue },
  });

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

const mediaKind = (item: { attachment: unknown; metaMedia: unknown }) => ((item.attachment ?? item.metaMedia) as { kind?: string } | null)?.kind;

async function handoff(conversation: ChatConversation, settings: AiSettings, reason: string, queueName?: string, sendHandoffMessage = true) {
  const contact = await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } });
  const target = await handoffQueue(settings, conversation.queueId, queueName);

  if (sendHandoffMessage && settings.handoffMessage.trim() && isWindowOpen(conversation.lastInboundAt)) {
    await sendAutomaticMessage(conversation, fillVariables(settings.handoffMessage, { customer: contact?.name, queue: target?.name }), undefined, undefined, AI_AUTHOR);
  }
  // Só agora a conversa entra na fila humana (posição contada a partir do transbordo).
  const state = readMenuState(conversation.menuState);
  state.stopped = true;
  state.aiActive = false;
  state.notifiedPosition = null;
  state.positionSince = null;
  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { ...handoffPatch(target?.id ?? conversation.queueId, new Date()), menuState: state as unknown as Prisma.InputJsonValue },
  });
  await addSystemMessage(conversation.id, `${AI_HANDOFF_MARK}${target ? ` para a fila ${target.name}` : ""}: ${reason}`);
  console.log(`[ai] ${conversation.id}: transferida (${reason})`);
}


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
  /** Mensagens anteriores do cliente nesta conversa (insistência em tentativa de manipulação). */
  earlierCustomerTexts?: string[];
};
export type AgentRun = { outcome: AgentOutcome; media: PreparedMedia | null; mediaTriggerSkipped: boolean; search: SearchLog | null; injection: InjectionCheck; stock?: StockLog[] };
const NO_INJECTION: InjectionCheck = { risk: "none", matches: [] };

/**
 * Motor único do agente de IA: o atendimento real (WhatsApp) e o teste da página /ia passam por aqui.
 * Regras antes da IA → anexo (visão, transcrição, PDF, documento) → prompt com base de conhecimento e filas →
 * modelo → interpretação. Erro do modelo sobe para quem chamou (o WhatsApp transfere; o teste mostra o erro).
 */
export async function runAiAgent(input: AgentRunInput): Promise<AgentRun> {
  const { settings } = input;
  const early = preAgentOutcome(settings, input);
  if (early) return { outcome: early, media: null, mediaTriggerSkipped: false, search: null, injection: NO_INJECTION };
  const mediaTriggerSkipped = !!input.ignoreMediaTrigger && settings.handoffOnMedia && input.hasMedia;

  const media = await input.loadMedia();
  // Áudio pedindo atendente: a palavra de transferência vale também na transcrição.
  if (media?.transcript && asksForHuman(settings, media.transcript)) {
    return { outcome: { action: "handoff", reply: "", reason: "Cliente pediu para falar com uma pessoa (áudio)", queue: "", trigger: "keyword" }, media, mediaTriggerSkipped, search: null, injection: NO_INJECTION };
  }

  // Prompt injection: texto, transcrição e documento do cliente passam pelo detector (dados nunca viram regra).
  const documentText = media && (media.kind === "text" || media.kind === "docx") ? media.parts.map((part) => (part.type === "text" ? part.text : "")) : [];
  const untrusted = [input.pendingText, media?.transcript ?? "", ...documentText].join("\n");
  const injection = detectPromptInjection(untrusted);
  if (injection.risk !== "none") {
    const insisted = injection.risk === "high" && (input.earlierCustomerTexts ?? []).some((earlier) => detectPromptInjection(earlier).risk === "high");
    console.warn(`[ai][security] ${securityLog({ feature: input.meta.feature, conversationId: input.meta.conversationId, userId: input.meta.userId, check: injection, action: insisted ? "handoff" : injection.risk === "high" ? "guard" : "log", sample: untrusted })}`);
    if (insisted) {
      return { outcome: { action: "handoff", reply: "", reason: "Tentativas repetidas de manipular a IA (pedido de regras internas ou mudança de papel)", queue: "", trigger: "security" }, media, mediaTriggerSkipped, search: null, injection };
    }
  }

  // Foto: identificação silenciosa → busca no catálogo do ERP → resultado ou transbordo (a foto não é narrada).
  let search: SearchLog | null = null;
  let catalogContext = "";
  let sendMedia = !!media;
  if (media?.kind === "image") {
    const flow = await productImageFlow({
      identify: () => aiJson<VisionResult>([{ role: "system", content: VISION_PROMPT }, { role: "user", content: media.parts.filter((part) => part.type === "image_url") }], { ...input.meta, maxTokens: 300 }),
      search: searchErpCatalog,
      withPrices: settings.canQuotePrices,
    });
    search = flow.log;
    if (flow.type === "handoff") return { outcome: { action: "handoff", reply: flow.reply, reason: flow.reason, queue: "", trigger: flow.trigger }, media, mediaTriggerSkipped, search, injection };
    if (flow.type === "found") {
      catalogContext = `${CATALOG_FOUND_RULE}\n\n${flow.context}`;
      // A resposta usa só o resultado da busca: sem a imagem, não há o que narrar.
      sendMedia = false;
    }
  }

  const [context, info, queues] = await Promise.all([
    input.buildContext(media),
    knowledge(settings),
    settings.aiChoosesQueue && !settings.handoffQueueId ? prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { name: true }, orderBy: { order: "asc" } }) : [],
  ]);
  // Regras, resultado do catálogo e alerta ficam só no "system"; o "user" leva só dados do cliente, delimitados.
  const system = buildSystemPrompt({
    settings,
    queueNames: queues.map((queue) => queue.name),
    info,
    // Saudação só na primeira resposta da IA nesta conversa (WhatsApp e teste contam as respostas iguais).
    firstReply: input.aiReplies === 0,
    extra: [media ? MEDIA_RULES : "", catalogContext, injection.risk === "high" ? INJECTION_ALERT : ""],
  });
  // Tool somente leitura de estoque: busca local (top 5) + saldo por loja na API do VMSet (cache 3 min, limite 3 s).
  const stock: StockLog[] = [];
  const stockTool = {
    definition: STOCK_TOOL,
    run: async (args: Record<string, unknown>) => {
      const { result, log } = await consultarEstoqueProduto(args, { products: catalogProducts, withPrices: settings.canQuotePrices });
      stock.push(log);
      return result;
    },
  };
  const decision = await aiJson<AgentDecision>(
    [
      { role: "system", content: system },
      { role: "user", content: sendMedia && media ? [{ type: "text", text: context }, ...media.parts] : context },
    ],
    { ...input.meta, maxTokens: 700, tools: [stockTool] },
  );
  return { outcome: interpretDecision(decision), media, mediaTriggerSkipped, search, injection, stock };
}

async function respond(conversationId: string, messageId: string) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.assigneeId || conversation.closedAt) return;
  // Chegou mensagem mais nova: a espera dela responde tudo de uma vez.
  const latest = await prisma.chatMessage.findFirst({ where: { conversationId, author: "customer" }, orderBy: { createdAt: "desc" }, select: { id: true, text: true, externalId: true } });
  if (latest?.id !== messageId) return;
  if (!(await firstDispatch(`ai:${messageId}`))) return;
  if (await handedOff(conversationId)) return;
  const settings = await readAiSettings();
  // IA desligada enquanto a resposta aguardava: a conversa não fica presa fora da fila.
  if (!settings.autonomousEnabled) { await releaseFromAi(conversation); return; }

  // Mensagens do cliente desde a última resposta (bot ou atendente).
  const lastAnswer = await prisma.chatMessage.findFirst({ where: { conversationId, author: { in: ["bot", "agent"] }, internal: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const pending = await prisma.chatMessage.findMany({ where: { conversationId, author: "customer", ...(lastAnswer ? { createdAt: { gt: lastAnswer.createdAt } } : {}) }, select: { text: true, attachment: true, metaMedia: true } });
  const aiReplies = await prisma.chatMessage.count({ where: { conversationId, author: "bot", authorName: AI_AUTHOR } });
  // Mensagens anteriores do cliente: insistência em tentativa de manipulação leva para a equipe.
  const earlier = await prisma.chatMessage.findMany({ where: { conversationId, author: "customer", ...(lastAnswer ? { createdAt: { lte: lastAnswer.createdAt } } : { id: { in: [] } }) }, orderBy: { createdAt: "desc" }, take: 20, select: { text: true } });
  const meta = { feature: "agent", conversationId };

  let run: AgentRun;
  try {
    // "digitando..." no WhatsApp do cliente antes de mídia, estoque e modelo (renova uma vez após 20 s).
    run = await withTyping(() => sendTypingIndicator(latest.externalId), () => runAiAgent({
      settings,
      pendingText: pending.map((item) => item.text).join("\n"),
      // Foto não dispara o gatilho de mídia: passa pela busca no catálogo. Áudio e documento disparam.
      hasMedia: pending.some((item) => (item.attachment || item.metaMedia) && mediaKind(item) !== "image"),
      aiReplies,
      meta,
      loadMedia: () => customerMedia(pending.map((item) => item.attachment as ChatAttachment | null), meta),
      earlierCustomerTexts: earlier.map((item) => item.text),
      buildContext: async () => (await conversationContext(conversation, { includeHistory: settings.useCustomerOrders })).text,
    }));
  } catch (error) {
    // IA fora do ar: ninguém fica sem resposta, a conversa vai para a equipe.
    return handoff(conversation, settings, error instanceof AiError ? `IA indisponível (${error.message})` : "IA indisponível");
  }
  const { outcome } = run;
  if (outcome.trigger === "catalog_miss" || outcome.trigger === "prescription") {
    // A própria resposta já avisa que vai encaminhar: sem a mensagem de transferência repetida.
    if (isWindowOpen(conversation.lastInboundAt)) await sendAutomaticMessage(conversation, outcome.reply, undefined, undefined, AI_AUTHOR);
    return handoff(conversation, settings, outcome.reason, undefined, false);
  }
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
  /** Busca no catálogo do ERP feita a partir da foto (termo e quantidade de resultados). */
  search?: SearchLog;
  /** Tentativa de manipulação detectada (o teste mostra; o WhatsApp registra no log de segurança). */
  injection?: InjectionCheck;
  /** Consultas de estoque feitas pela tool (termo, região, cenário, lojas e tempo). */
  stock?: StockLog[];
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
    hasMedia: !!attachment && aiAttachmentKind(attachment.mime, attachment.name) !== "image",
    aiReplies: messages.filter((message) => message.from === "ai").length,
    meta,
    ignoreMediaTrigger: options.ignoreMediaTrigger,
    earlierCustomerTexts: messages.slice(0, lastAi + 1).filter((message) => message.from === "customer").map((message) => message.text),
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
    search: run.search ?? undefined,
    injection: run.injection.risk === "none" ? undefined : run.injection,
    stock: run.stock?.length ? run.stock : undefined,
  };
}
