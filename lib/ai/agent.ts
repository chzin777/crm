import "server-only";
import { prisma } from "@/lib/prisma";
import { addSystemMessage, firstDispatch, isWindowOpen } from "@/lib/chat/conversation";
import { closeConversation } from "@/lib/chat/actions";
import { readMenuState } from "@/lib/chat/menu";
import { aiConversationMode, aiTakeoverPatch, handoffPatch, isAiHandling } from "@/lib/chat/queue-rules";
import { withTyping } from "@/lib/chat/typing";
import { sendTypingIndicator } from "@/lib/meta-whatsapp";
import { Prisma } from "@/generated/prisma/client";
import { hoursFor } from "@/lib/chat/operations";
import { sendAutomaticImage, sendAutomaticMessage } from "@/lib/chat/outbound";
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
import { IMAGE_CAPTION_RULE, type ProductImage } from "@/lib/ai/product-image";
import { imageSearchStatus, invalidateProductImage, searchAndCacheProductImage } from "@/lib/ai/product-image-db";
import { humanRequestMode, resolveHandoffQueue, ROUTE_NOW, TRIAGE_NOW, type HumanRequestMode } from "@/lib/ai/routing";
import { detectPromptInjection, INJECTION_ALERT, securityLog, type InjectionCheck } from "@/lib/ai/guard";
import type { ChatAttachment } from "@/lib/chat/media-rules";
import { catalog, conversationContext } from "@/lib/ai/assist";
import { readAiSettings, readAiStatus } from "@/lib/ai/store";
import { aiShouldAttend, asksForHuman, type AiSettings } from "@/lib/ai/settings";
import { buildSystemPrompt, customerMessages, formatContext, interpretDecision, preAgentOutcome, SIMULATED_PROFILES, simulatedHistory, transcriptLine, type AgentDecision, type AgentOutcome, type QueuedState, type SimulatedProfileId } from "@/lib/ai/agent-core";
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
/** Marca da mensagem de sistema da transferência: depois dela a IA só ajuda na espera (fila sem atendente). */
export const AI_HANDOFF_MARK = "IA transferiu o atendimento";
/** Espera curta para juntar mensagens seguidas do cliente numa só resposta. */
const DEBOUNCE_MS = 6_000;
const CREDIT_RETRY_MS = 10 * 60 * 1000;

/** Transbordo já feito e se algum atendente escreveu ao cliente depois dele (assumiu o controle). */
async function handoffFlags(conversationId: string) {
  const mark = await prisma.chatMessage.findFirst({ where: { conversationId, author: "system", text: { startsWith: AI_HANDOFF_MARK } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!mark) return { handedOff: false, humanReplied: false, since: null };
  const human = await prisma.chatMessage.findFirst({ where: { conversationId, author: "agent", internal: false, createdAt: { gt: mark.createdAt } }, select: { id: true } });
  return { handedOff: true, humanReplied: !!human, since: mark.createdAt };
}

/** Modo da IA nesta conversa agora (exclusiva, espera assistida na fila ou pausada). */
async function conversationMode(conversation: ChatConversation) {
  const flags = await handoffFlags(conversation.id);
  return { mode: aiConversationMode(conversation, flags), since: flags.since };
}

async function queuedState(conversation: ChatConversation): Promise<QueuedState> {
  const queue = conversation.queueId ? await prisma.chatQueue.findUnique({ where: { id: conversation.queueId }, select: { name: true } }) : null;
  return { queueName: queue?.name ?? null };
}

/**
 * Chamado pelo fluxo automático depois de gravar a mensagem. Devolve true quando a IA assume
 * (o menu e o aviso de fora do horário não rodam); a resposta sai em segundo plano.
 */
export async function aiTakeOver(conversation: ChatConversation, messageId: string) {
  if (!aiConfigured()) return false;
  const settings = await readAiSettings();
  if (!settings.autonomousEnabled) return false;
  const now = new Date();
  // Humano assumiu, escreveu depois do transbordo ou pausou a IA: silêncio. Na fila sem atendente: espera assistida.
  const { mode } = await conversationMode(conversation);
  if (mode === "paused") return false;
  const queued = mode === "queued";
  const rule = await hoursFor(conversation.queueId);
  const storeOpen = !rule || isOpenAt(rule, now);
  if (!aiShouldAttend(settings, conversation, now, storeOpen, queued)) return false;

  // Sem crédito, a conversa segue o fluxo normal em vez de ficar sem resposta.
  const status = await readAiStatus();
  if (status.creditExhausted && status.lastErrorAt && now.getTime() - new Date(status.lastErrorAt).getTime() < CREDIT_RETRY_MS) return false;

  // O cliente escreveu: aviso de silêncio e fechamento pendentes perdem o efeito.
  const state = readMenuState(conversation.menuState);
  const wasHandling = isAiHandling(conversation);
  state.warnedAt = null;
  state.closeAt = null;
  state.closePhrase = null;
  if (queued) {
    // Espera assistida: a conversa continua na fila (posição e avisos seguem), a IA só responde enquanto ninguém assume.
    await prisma.chatConversation.update({ where: { id: conversation.id }, data: { menuState: state as unknown as Prisma.InputJsonValue } });
  } else {
    // Atendimento da IA fica fora da fila humana: sem posição, sem "Você avançou na fila" e sem alerta de espera.
    state.aiActive = true;
    state.notifiedPosition = null;
    state.positionSince = null;
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { ...(wasHandling && conversation.status === "bot" ? {} : aiTakeoverPatch()), menuState: state as unknown as Prisma.InputJsonValue },
    });
  }

  setTimeout(() => {
    void respond(conversation.id, messageId).catch((error) => console.error("[ai] atendimento autônomo:", error));
  }, DEBOUNCE_MS);
  console.log(`[ai] ${conversation.id}: ${queued ? "espera assistida na fila" : "assumida pela IA"} (${conversation.status})`);
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
async function handoffQueue(settings: AiSettings, currentQueueId: string | null, chosen?: string) {
  // Validação no servidor: a fila escolhida pela IA precisa existir e estar ativa; senão fila padrão / Atendimento Geral.
  const queues = await prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { order: "asc" } });
  const choice = resolveHandoffQueue(queues, { fixedQueueId: settings.handoffQueueId, aiChooses: settings.aiChoosesQueue, chosen, currentQueueId });
  const queue = queues.find((item) => item.id === choice.queueId) ?? null;
  if (chosen && choice.source !== "ai") console.warn(`[ai] fila escolhida pela IA inválida ("${chosen.slice(0, 60)}"): usando ${queue?.name ?? "nenhuma"} (${choice.source})`);
  return queue ? { ...queue, source: choice.source } : null;
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
  // Nota para o atendente: fila, como foi escolhida e o resumo do que o cliente precisa.
  const how = target?.source === "ai" ? " (escolhida pela IA)" : target?.source === "fallback" ? " (fila padrão: assunto não identificado)" : "";
  await addSystemMessage(conversation.id, `${AI_HANDOFF_MARK}${target ? ` para a fila ${target.name}${how}` : ""}: ${reason}`);
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
  /** Conversa já na fila humana, sem atendente: a IA segue ajudando sem transferir de novo. */
  queued?: QueuedState | null;
  /** Mensagens anteriores do cliente nesta conversa (insistência em tentativa de manipulação). */
  earlierCustomerTexts?: string[];
};
export type AgentRun = { outcome: AgentOutcome; media: PreparedMedia | null; mediaTriggerSkipped: boolean; search: SearchLog | null; injection: InjectionCheck; stock?: StockLog[]; humanMode?: HumanRequestMode; image?: ProductImage | null };
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
  if (!input.queued && media?.transcript && asksForHuman(settings, media.transcript)) {
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
    settings.aiChoosesQueue ? prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { id: true, name: true, description: true }, orderBy: { order: "asc" } }) : [],
  ]);
  // Pedido de pessoa com a IA roteando: sem assunto → 1 pergunta de triagem; com assunto → transfere já para a fila certa.
  const humanMode = input.queued ? null : humanRequestMode(settings, { pendingText: input.pendingText, aiReplies: input.aiReplies, asked: asksForHuman(settings, input.pendingText) });
  // Regras, resultado do catálogo e alerta ficam só no "system"; o "user" leva só dados do cliente, delimitados.
  const system = buildSystemPrompt({
    settings,
    queues,
    info,
    // Saudação só na primeira resposta da IA nesta conversa (WhatsApp e teste contam as respostas iguais).
    firstReply: input.aiReplies === 0,
    queued: input.queued,
    extra: [media ? MEDIA_RULES : "", catalogContext, injection.risk === "high" ? INJECTION_ALERT : "", settings.sendProductImage && imageSearchStatus() ? IMAGE_CAPTION_RULE : "", humanMode === "triage" ? TRIAGE_NOW : humanMode === "route" ? ROUTE_NOW : ""],
  });
  // Tool somente leitura de estoque: busca local (top 5) + saldo por loja na API do VMSet (cache 3 min, limite 3 s).
  const stock: StockLog[] = [];
  // Foto do produto (web + cache por código): só com modelo confirmado no estoque e a opção ligada em /ia.
  let image: ProductImage | null = null;
  const stockTool = {
    definition: STOCK_TOOL,
    run: async (args: Record<string, unknown>) => {
      const { result, log } = await consultarEstoqueProduto(args, { products: catalogProducts, withPrices: settings.canQuotePrices });
      stock.push(log);
      const inStock = result.produtos.find((product) => product.lojasComEstoque.length > 0);
      if (!image && inStock && settings.sendProductImage && imageSearchStatus()) {
        image = await searchAndCacheProductImage(inStock);
        log.image = image ? image.source : "none";
      }
      return image ? { ...result, fotoAnexada: true } : result;
    },
  };
  const decision = await aiJson<AgentDecision>(
    [
      { role: "system", content: system },
      { role: "user", content: sendMedia && media ? [{ type: "text", text: context }, ...media.parts] : context },
    ],
    { ...input.meta, maxTokens: 700, tools: [stockTool] },
  );
  let outcome = interpretDecision(decision);
  // O cliente pediu uma pessoa e já houve triagem (ou o assunto é claro): a transferência acontece mesmo se o modelo só respondeu.
  if (humanMode === "route" && outcome.action !== "handoff") outcome = { ...outcome, action: "handoff", reason: outcome.reason === "Sem motivo informado" ? "Cliente pediu para falar com uma pessoa" : outcome.reason, trigger: "keyword" };
  // Foto só acompanha resposta ao cliente (não vai junto de transferência).
  const photo = image as ProductImage | null;
  return { outcome, media, mediaTriggerSkipped, search, injection, stock, humanMode, image: photo && outcome.action !== "handoff" && outcome.reply ? photo : null };
}

async function respond(conversationId: string, messageId: string) {
  const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.assigneeId || conversation.closedAt) return;
  // Chegou mensagem mais nova: a espera dela responde tudo de uma vez.
  const latest = await prisma.chatMessage.findFirst({ where: { conversationId, author: "customer" }, orderBy: { createdAt: "desc" }, select: { id: true, text: true, externalId: true } });
  if (latest?.id !== messageId) return;
  if (!(await firstDispatch(`ai:${messageId}`))) return;
  const { mode, since } = await conversationMode(conversation);
  if (mode === "paused") return;
  const queued = mode === "queued" ? await queuedState(conversation) : null;
  const settings = await readAiSettings();
  // IA desligada enquanto a resposta aguardava: a conversa não fica presa fora da fila.
  if (!settings.autonomousEnabled) { if (!queued) await releaseFromAi(conversation); return; }

  // Mensagens do cliente desde a última resposta (bot ou atendente).
  const lastAnswer = await prisma.chatMessage.findFirst({ where: { conversationId, author: { in: ["bot", "agent"] }, internal: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const pending = await prisma.chatMessage.findMany({ where: { conversationId, author: "customer", ...(lastAnswer ? { createdAt: { gt: lastAnswer.createdAt } } : {}) }, select: { text: true, attachment: true, metaMedia: true } });
  // Na espera assistida, o limite de respostas conta só as respostas depois do transbordo.
  const aiReplies = await prisma.chatMessage.count({ where: { conversationId, author: "bot", authorName: AI_AUTHOR, ...(queued && since ? { createdAt: { gt: since } } : {}) } });
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
      queued,
    }));
  } catch (error) {
    // Já na fila: a equipe vai atender de qualquer forma, sem transferir de novo.
    if (queued) { console.warn(`[ai] ${conversationId}: espera assistida sem resposta (${error instanceof Error ? error.message : error})`); return; }
    // IA fora do ar: ninguém fica sem resposta, a conversa vai para a equipe.
    return handoff(conversation, settings, error instanceof AiError ? `IA indisponível (${error.message})` : "IA indisponível");
  }
  const { outcome } = run;
  if (queued) return replyWhileQueued(conversationId, outcome, run.image);
  if (outcome.trigger === "catalog_miss" || outcome.trigger === "prescription") {
    // A própria resposta já avisa que vai encaminhar: sem a mensagem de transferência repetida.
    if (isWindowOpen(conversation.lastInboundAt)) await sendAutomaticMessage(conversation, outcome.reply, undefined, undefined, AI_AUTHOR);
    return handoff(conversation, settings, outcome.reason, undefined, false);
  }
  if (outcome.trigger !== "ai") return handoff(conversation, settings, outcome.reason);

  // Pode ter sido assumida enquanto a IA pensava.
  const fresh = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!fresh || (await conversationMode(fresh)).mode === "paused") return;

  if (outcome.action === "handoff") {
    if (outcome.reply && !settings.handoffMessage.trim()) await sendAutomaticMessage(fresh, outcome.reply, undefined, undefined, AI_AUTHOR);
    return handoff(fresh, settings, outcome.reason, outcome.queue);
  }
  await sendAiReply(fresh, outcome.reply, run.image);
  if (outcome.action === "resolved" && settings.closeWhenResolved) {
    // A resposta da IA já é a despedida: sem a mensagem padrão nem pesquisa.
    await closeConversation(fresh, null, `Atendimento resolvido pela IA: ${outcome.reason}`, "");
  }
}

/**
 * Espera assistida: responde sem transferir de novo (a conversa já está na fila). Transbordo pedido pelo modelo
 * vira só a resposta; gatilhos sem resposta (mídia, limite) ficam em silêncio para a equipe ver.
 * Confere de novo antes de enviar: se um atendente assumiu ou escreveu enquanto a IA pensava, não responde.
 */
/** Resposta da IA ao cliente: com foto do produto (legenda) quando houver; se a foto falhar, segue em texto. */
async function sendAiReply(conversation: ChatConversation, text: string, image?: ProductImage | null) {
  if (!image) return sendAutomaticMessage(conversation, text, undefined, undefined, AI_AUTHOR);
  return sendAutomaticImage(conversation, image.url, text, AI_AUTHOR, () => invalidateProductImage(image.sku));
}

async function replyWhileQueued(conversationId: string, outcome: AgentOutcome, image?: ProductImage | null) {
  const fresh = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!fresh || (await conversationMode(fresh)).mode !== "queued") return;
  if (!outcome.reply || !isWindowOpen(fresh.lastInboundAt)) return;
  await sendAiReply(fresh, outcome.reply, image);
}

export type PlaygroundMessage = { from: "customer" | "ai"; text: string };
export type PlaygroundOptions = { profile?: SimulatedProfileId; ignoreMediaTrigger?: boolean };
export type PlaygroundResult = AgentOutcome & {
  /** O que o cliente receberia no WhatsApp (resposta e/ou mensagem de transferência). */
  messages: string[];
  /** Fila para onde a conversa iria na transferência. */
  handoffQueue: string;
  /** Como a fila foi definida: escolha da IA validada, fila padrão (fallback), fixa ou a atual. */
  handoffQueueSource?: "fixed" | "ai" | "fallback" | "current" | "none";
  /** A IA fez a pergunta de triagem do setor em vez de transferir. */
  triage?: boolean;
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
  /** Foto do produto que iria junto com a resposta (do cache ou da busca na web). */
  image?: { url: string; source: "cache" | "web"; query: string };
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
    handoffQueueSource: target?.source,
    triage: run.humanMode === "triage" || undefined,
    wouldClose: outcome.action === "resolved" && settings.closeWhenResolved,
    media: media ? { kind: media.kind, summary: media.summary, ...(media.transcript !== undefined ? { transcript: media.transcript } : {}) } : undefined,
    mediaHandoff: run.mediaTriggerSkipped || undefined,
    search: run.search ?? undefined,
    injection: run.injection.risk === "none" ? undefined : run.injection,
    stock: run.stock?.length ? run.stock : undefined,
    image: run.image ? { url: run.image.url, source: run.image.source, query: run.image.query } : undefined,
  };
}
