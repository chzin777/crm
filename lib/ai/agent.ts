import "server-only";
import { prisma } from "@/lib/prisma";
import { addSystemMessage, firstDispatch, isWindowOpen } from "@/lib/chat/conversation";
import { assertCanReceive, closeConversation } from "@/lib/chat/actions";
import { bareNameHint, detectStaffRequest, defaultHandoffNotice, staffConfirmation } from "@/lib/ai/staff-request";
import { isPureGreeting, PURE_GREETING_HINT } from "@/lib/ai/greeting";
import { activeStaff } from "@/lib/ai/staff-db";
import { savePrescriptionFromAi } from "@/lib/prescriptions-db";
import { detectSalesEvents, isSalesQueue, parseBrl, type SalesEvent } from "@/lib/sales-pipeline";
import { recordSalesEvents } from "@/lib/sales-pipeline-db";
import { awaitingIdentity, extractCpf, extractFullName, financialStep, FINANCIAL_ASK_IDENTITY, FINANCIAL_CHECK_CPF, FINANCIAL_INVALID_CPF, FINANCIAL_STILL_WAITING, FINANCIAL_UNAVAILABLE, FINANCIAL_WAIT, isFullName, isInstallmentQuestion, maskCpf, type InstallmentLookup, type PlaygroundFinancial } from "@/lib/ai/installments";
import { buildApprovalDraft, createFinancialApproval, linkedCpfForPhone, lookupInstallments, pendingApproval, type FinancialApprovalDraft } from "@/lib/ai/installments-db";
import { readMenuState } from "@/lib/chat/menu";
import { aiConversationMode, aiTakeoverPatch, handoffPatch, isAiHandling } from "@/lib/chat/queue-rules";
import { withTyping } from "@/lib/chat/typing";
import { sendLocation, sendText, sendTypingIndicator, sendWhatsAppInteractiveList } from "@/lib/meta-whatsapp";
import { buildShowcaseList, toChatInteractive, type InteractiveShowcase } from "@/lib/ai/interactive-showcase";
import { Prisma } from "@/generated/prisma/client";
import { hoursFor } from "@/lib/chat/operations";
import { ChatRuleError, sendAutomaticImage, sendAutomaticMessage } from "@/lib/chat/outbound";
import { describeSchedule, GLOBAL_HOURS_SCOPE, isOpenAt, sanitizeSchedule } from "@/lib/chat/hours";
import { fillVariables, withoutSplitMarkers } from "@/lib/chat/text";
import { aiConfigured, aiJson, AiError, transcribeAudio, type AiCallMeta } from "@/lib/ai/openai";
import { AI_ATTACHMENT_MAX_BYTES, AI_ATTACHMENTS_PER_BATCH, aiAttachmentKind, baseType, extensionOf, TRANSCRIBABLE_VIDEO, unsupportedReason, type AiAttachmentKind } from "@/lib/ai/attachments";
import { attachSummary, failedMedia, MEDIA_RULES, mediaParts, mergeMedia, stickerMedia, type AiMediaInput, type PreparedMedia } from "@/lib/ai/multimodal";
import { DOCUMENT_EXTRACT_PROMPT, documentHandoffReason, documentKind, documentQueue, documentReply, formatExtraction, type DocumentExtraction, type ReadDocument } from "@/lib/ai/document-extract";
import { readFile } from "@/lib/minio";
import { transcribeMessageAudio } from "@/lib/chat/transcription";
import { activeSourceNotes, type KnowledgeSourceKey } from "@/lib/ai/knowledge-sources";
import { emitAiHandoff, hasActiveHandoffFlow } from "@/lib/automations/ai-handoff";
import { analysisName, analysisPromptBlock, asksProductInfo, brandSearchArgs, brandStockFallback, buildVisualCatalog, CATALOG_FOUND_RULE, explicitBrand, shownProductsOf, VISUAL_CATALOG_MAX, withoutShowcaseRefs, type VisualCatalog, imageAnalysis as makeImageAnalysis, informativeReply, normalizeTerm, readVision, sanitizeImageAnalysis, VISION_PROMPT, type CatalogQuery, type ImageAnalysis, type SearchLog, type VisionResult } from "@/lib/ai/catalog-search";
import { catalogProducts } from "@/lib/ai/catalog-db";
import { canonicalCity, EMPTY_CATALOG_CONTEXT, extractPreferredCity, isBroadBrandRequest, sanitizeCatalogContext, updateCatalogContext, type CatalogContext } from "@/lib/ai/catalog-context";
import { withToolContent, withoutRedundantStoreQuestion, budgetBlock, cityFirstBlock, isBroadStockCall, needsTypeFirst, typeFirstBlock, typeGatedResult, conversationBudget, conversationWantsKids, gatedStockResult, isGatedStockCall, needsCityFirst, asksSpecificModel, withBudgetArgs } from "@/lib/ai/sales-consultant";
import { photoVariants } from "@/lib/ai/photo-response";
import { iconicModel } from "@/lib/ai/product-names";
import { listWithOpening, singleEmoji, welcomeReply } from "@/lib/ai/response-opening";
import { consultarEstoqueProduto } from "@/lib/ai/stock-db";
import { formatBrl, STOCK_TOOL, titleCase, type StockLog } from "@/lib/ai/stock";
import { allowsProductPhoto, fallbackReference, formatShowcase, showcaseReference, type ShowcaseModel } from "@/lib/ai/stock-showcase";
import { asksListAgain, extractListedProducts, listedPromptBlock, listedSearchTerm, repeatsShowcase, parseShowcase, resolveListedChoice, type ListedChoice, type ListedProduct } from "@/lib/ai/showcase-choice";
import { asksForPhoto, cardGuidance, DETAILS_TOOL, shouldSendProductPhoto } from "@/lib/ai/product-details";
import { buildProductCard, cardStore, cleanReference, commercialName, type ProductCardFields } from "@/lib/ai/product-card";
import { buscarDetalhesProduto, productSummary, type DetailsLog } from "@/lib/ai/product-details-db";
import { clearStoreDirectory, erpUnitDirectory, storeDirectory } from "@/lib/ai/stock-db";
import { ensureStorePin } from "@/lib/store-pin";
import { geocodeStoreAddress } from "@/lib/ai/store-geolocation";
import { anchoredStoreMatch, deliverLocation, findStores, resolveStoreMatch, resolveStoreRequest, LOCATION_TOOL, locationText, storeLocation, type SessionStore, type StoreLocation } from "@/lib/ai/store-location";
import { isCourtesyClosing } from "@/lib/ai/closing";
import { AI_FAREWELL, aiCloseDecision, CLOSE_BLOCK_LABELS, CLOSE_TOOL, runAiClose, type CloseDecision } from "@/lib/ai/ai-close";
import { sendSatisfactionSurvey } from "@/lib/chat/nps";
import { applySkillsToSettings, filterToolsBySkills, skillEnabled } from "@/lib/ai/studio";
import { loadSkills, loadStudioContext } from "@/lib/ai/studio-db";
import { createMessageBuffer } from "@/lib/ai/message-debounce";
import { joinBubbles, sendBubbles, splitBubbles } from "@/lib/ai/bubbles";
import { listFieldDefinitions, setContactFields } from "@/lib/contact-fields-db";
import { IMAGE_CAPTION_RULE, type ProductImage } from "@/lib/ai/product-image";
import { catalogImages, imageSearchStatus, invalidateProductImage, searchAndCacheProductImage } from "@/lib/ai/product-image-db";
import { humanRequestMode, resolveHandoffQueue, ROUTE_NOW, TRIAGE_NOW, type HumanRequestMode } from "@/lib/ai/routing";
import { detectPromptInjection, INJECTION_ALERT, securityLog, type InjectionCheck } from "@/lib/ai/guard";
import type { ChatAttachment } from "@/lib/chat/media-rules";
import { catalog, conversationContext, sessionStartedAt } from "@/lib/ai/assist";
import { anchorPromptBlock, asksStoreLocation, EMPTY_ANCHOR, extractSessionAnchor, isProductFollowUp, isStoreFollowUp, storesIn, modelNumbers, SESSION_ANCHOR_RULES, type AnchorMessage, type SessionAnchor } from "@/lib/ai/session-anchor";
import { readAiSettings, readAiStatus } from "@/lib/ai/store";
import { aiShouldAttend, asksForHuman, bubbleDelayFor, type AiSettings } from "@/lib/ai/settings";
import { buildSystemPrompt, carriesProductExtras, customerMessages, formatContext, interpretDecision, preAgentOutcome, SIMULATED_PROFILES, simulatedHistory, transcriptLine, type AgentDecision, type AgentOutcome, type QueuedState, type SimulatedProfileId } from "@/lib/ai/agent-core";
import type { ChatConversation } from "@/generated/prisma/client";
import { reportError } from "@/lib/monitoring/error-reporter";

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
/**
 * Mensagens picadas: cada mensagem entra no lote da conversa e reinicia a espera adaptativa (1,8 a 5,5 s, teto de
 * 12 s desde a primeira); ao vencer, a IA responde uma vez só ao lote inteiro.
 */
let groupMessages = true;
const messageBuffer = createMessageBuffer({ enabled: () => groupMessages, onFlush: (batch) => runBatch(batch.key, batch.lastId) });
/** Conversa com resposta da IA em andamento: um novo lote espera ela terminar (nunca duas respostas ao mesmo tempo). */
const inFlight = new Map<string, { rerun: boolean }>();
/** Até onde a IA já leu as mensagens do cliente (inclui as que chegaram enquanto ela respondia o lote anterior). */
const consumedUntil = new Map<string, Date>();

async function runBatch(conversationId: string, messageId: string): Promise<void> {
  const running = inFlight.get(conversationId);
  if (running) { running.rerun = true; return; }
  inFlight.set(conversationId, { rerun: false });
  try {
    await respond(conversationId, messageId);
  } catch (error) {
    console.error("[ai] atendimento autônomo:", error);
    void reportError("ai.agent", error, { conversationId });
  } finally {
    const state = inFlight.get(conversationId);
    inFlight.delete(conversationId);
    if (state?.rerun) {
      // Chegou lote novo enquanto a IA respondia: responde agora a partir da última mensagem do cliente.
      const latest = await prisma.chatMessage.findFirst({ where: { conversationId, author: "customer" }, orderBy: { createdAt: "desc" }, select: { id: true } }).catch(() => null);
      if (latest) void runBatch(conversationId, latest.id);
    }
  }
}
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
  if (!aiShouldAttend(settings, conversation, now, storeOpen)) return false;

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

  // Lote de mensagens picadas: espera o cliente terminar de digitar e responde tudo de uma vez.
  groupMessages = settings.groupMessages;
  const incoming = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { text: true, attachment: true, metaMedia: true } });
  const wait = messageBuffer.add(conversation.id, { id: messageId, text: incoming?.text ?? "", hasMedia: hasMediaPayload({ attachment: incoming?.attachment, metaMedia: incoming?.metaMedia }) });
  console.log(`[ai] ${conversation.id}: ${queued ? "espera assistida na fila" : "assumida pela IA"} (${conversation.status}), lote com ${messageBuffer.pending(conversation.id)} mensagem(ns), resposta em ${wait ?? 0} ms`);
  return true;
}

async function knowledge(settings: AiSettings) {
  const parts: string[] = [];
  // Fontes automáticas: documentos Markdown ligados na Base de Conhecimento (instrução editável + dados ao vivo).
  const notes = await activeSourceNotes().catch(() => ({} as Awaited<ReturnType<typeof activeSourceNotes>>));
  const note = (key: KnowledgeSourceKey) => (notes[key] ? `${notes[key]}\n\n` : "");
  for (const key of ["pedidos", "crediario"] as const) if (notes[key]) parts.push(notes[key]);
  if (settings.useStores) {
    const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { name: true, address: true, addressNumber: true, city: true, state: true, neighborhoods: true } });
    if (stores.length) {
      parts.push(`${note("lojas")}Lojas:\n${stores.map((store) => `- ${store.name}: ${[store.address && `${store.address}${store.addressNumber ? `, ${store.addressNumber}` : ""}`, store.neighborhoods[0], store.city && `${store.city}${store.state ? `/${store.state}` : ""}`].filter(Boolean).join(" · ") || "endereço não cadastrado"}`).join("\n")}`);
    }
  }
  if (settings.useOperatingHours) {
    const rows = await prisma.operatingHours.findMany({ where: { enabled: true }, select: { scope: true, schedule: true } });
    const queues = await prisma.chatQueue.findMany({ where: { id: { in: rows.map((row) => row.scope) } }, select: { id: true, name: true } });
    const lines = rows.map((row) => `- ${row.scope === GLOBAL_HOURS_SCOPE ? "Atendimento" : `Fila ${queues.find((queue) => queue.id === row.scope)?.name ?? "?"}`}: ${describeSchedule(sanitizeSchedule(row.schedule))}`);
    if (lines.length) parts.push(`${note("horarios")}Horário de atendimento (Brasília):\n${lines.join("\n")}`);
  }
  // Os antigos "Assuntos rápidos" (settings.topics) foram unificados nas Regras da empresa (AiBusinessRule) e entram
  // pelo bloco de regras do composeSystemPrompt.
  if (settings.canQuotePrices) {
    const products = await catalog();
    if (products) parts.push(`${note("precos")}Preços médios praticados (use só como referência "a partir de", confirmando na loja):\n${products}`);
  }
  return parts.join("\n\n");
}


/** Fila de destino da transferência: a fixa da configuração, a escolhida pela IA ou a atual. Mesma regra no teste. */
async function handoffQueue(settings: AiSettings, currentQueueId: string | null, chosen?: string, staffQueueId?: string): Promise<{ id: string; name: string; source: QueueSource } | null> {
  // Validação no servidor: a fila escolhida pela IA precisa existir e estar ativa; senão fila padrão / Atendimento Geral.
  const queues = await prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { order: "asc" } });
  // Pedido de pessoa pelo nome: a fila principal dela, se ativa.
  const staffQueue = staffQueueId ? queues.find((item) => item.id === staffQueueId) : undefined;
  if (staffQueue) return { ...staffQueue, source: "staff" };
  const choice = resolveHandoffQueue(queues, { fixedQueueId: settings.handoffQueueId, aiChooses: settings.aiChoosesQueue, chosen, currentQueueId });
  const queue = queues.find((item) => item.id === choice.queueId) ?? null;
  if (chosen && choice.source !== "ai") console.warn(`[ai] fila escolhida pela IA inválida ("${chosen.slice(0, 60)}"): usando ${queue?.name ?? "nenhuma"} (${choice.source})`);
  return queue ? { ...queue, source: choice.source } : null;
}

const mediaKind = (item: { attachment: unknown; metaMedia: unknown }) => ((item.attachment ?? item.metaMedia) as { kind?: string } | null)?.kind;
/** Mensagem do cliente com mídia (anexo salvo ou mídia da Meta); escolha da lista interativa não é mídia. */
const hasMediaPayload = (item: { attachment?: unknown; metaMedia?: unknown }) => {
  const meta = item.metaMedia as { id?: string; kind?: string } | null | undefined;
  return !!item.attachment || !!meta?.id || !!meta?.kind;
};

type QueueSource = "fixed" | "ai" | "fallback" | "current" | "none" | "staff";

async function handoff(conversation: ChatConversation, settings: AiSettings, reason: string, queueName?: string, sendHandoffMessage = true, staffQueueId?: string) {
  const contact = await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } });
  const target = await handoffQueue(settings, conversation.queueId, queueName, staffQueueId);
  // A conversa sai da IA e entra na fila humana já (posição contada a partir do transbordo).
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
  const how = target?.source === "ai" ? " (escolhida pela IA)" : target?.source === "fallback" ? " (fila padrão: assunto não identificado)" : target?.source === "staff" ? " (fila do atendente pedido)" : "";
  await addSystemMessage(conversation.id, `${AI_HANDOFF_MARK}${target ? ` para a fila ${target.name}${how}` : ""}: ${reason}`);
  // O que vem depois (aviso ao cliente, fila/atendente, tags, alertas) é o fluxo "IA transferiu o atendimento" em
  // /automacoes. Sem fluxo que rode, o aviso padrão: nunca transferência silenciosa.
  if (sendHandoffMessage) {
    const flows = await emitAiHandoff(conversation, target, reason).catch((error) => {
      console.error(`[ai] ${conversation.id}: automação de transbordo:`, error);
      return 0;
    });
    if (!flows && isWindowOpen(conversation.lastInboundAt)) await sendAutomaticMessage(conversation, defaultHandoffNotice(contact?.name), undefined, undefined, AI_AUTHOR);
  }
  // Transbordo para Vendas/Comercial: a oportunidade do contato vai para Orçamento com o resumo.
  if (isSalesQueue(target?.name) && skillEnabled(await loadSkills(), "pipeline_automatico")) await recordSalesEvents({ contactId: conversation.contactId, conversationId: conversation.id, events: [{ type: "transbordo_vendas", summary: reason.slice(0, 200) }] });
  console.log(`[ai] ${conversation.id}: transferida (${reason})`);
}

/**
 * Cliente pediu uma pessoa pelo nome ("Leandro", "Preciso falar com Leandro"): confirmação acolhedora primeiro,
 * depois a fila da pessoa (nota "Cliente solicitou atendimento direto com Leandro.") e, se ela puder receber
 * agora, atribuição direta. Sem cadastro ou indisponível: a conversa fica na fila com a nota.
 */
async function handoffToStaff(conversation: ChatConversation, settings: AiSettings, outcome: AgentOutcome, replyTo: string | null) {
  if (isWindowOpen(conversation.lastInboundAt)) await sendAiReply(conversation, outcome.reply, null, replyTo);
  await handoff(conversation, settings, outcome.reason, undefined, false, outcome.staffQueueId);
  if (!outcome.assigneeId) return;
  const name = outcome.assigneeName ?? "o atendente pedido";
  try {
    await assertCanReceive(outcome.assigneeId);
  } catch (error) {
    if (!(error instanceof ChatRuleError)) throw error;
    await addSystemMessage(conversation.id, `${name} não pode receber agora (${error.message}). A conversa ficou na fila.`);
    return;
  }
  const assigned = await prisma.chatConversation.updateMany({ where: { id: conversation.id, closedAt: null, assigneeId: null }, data: { assigneeId: outcome.assigneeId, status: "in_progress", waitingSince: null } });
  if (!assigned.count) return;
  await addSystemMessage(conversation.id, `IA atribuiu a ${name}: o cliente pediu para falar com essa pessoa.`);
  await prisma.chatNotification.create({ data: { userId: outcome.assigneeId, conversationId: conversation.id, type: "transfer", title: "Cliente pediu para falar com você", detail: "Transferência da IA", href: `/chat?c=${conversation.id}` } }).catch(() => null);
}


/** Anexo pronto para a IA: áudio é transcrito (registrado no consumo); documento vira texto; imagem e PDF seguem nativos. */
export async function prepareMedia(media: AiMediaInput, meta: Omit<AiCallMeta, "maxTokens">): Promise<PreparedMedia> {
  const kind = aiAttachmentKind(media.mime, media.name);
  if (!kind) throw new AiError("Formato de anexo não suportado pela IA.", 422);
  if (media.data.byteLength > AI_ATTACHMENT_MAX_BYTES) throw new AiError("Anexo acima de 10 MB.", 422);
  // Vídeo: só a faixa de áudio (a transcrição aceita MP4/WEBM; 3GP/MOV não).
  if (kind === "video" && !TRANSCRIBABLE_VIDEO.includes(extensionOf(media.name)) && !/mp4|webm/.test(baseType(media.mime))) throw new AiError("formato de vídeo não suportado para ouvir o áudio", 422);
  const transcript = kind === "audio" || kind === "video"
    ? await transcribeAudio(kind === "video" ? { ...media, name: /\.(mp4|webm)$/i.test(media.name) ? media.name : `${media.name.replace(/\.[^.]*$/, "") || "video"}.mp4` } : media, meta)
    : undefined;
  try {
    return mediaParts(kind, media, transcript);
  } catch (error) {
    console.error("[ai] leitura do anexo:", error);
    throw new AiError("Não foi possível ler o conteúdo deste documento.", 422);
  }
}

/** Anexo lido sem derrubar a resposta: erro (tempo da transcrição, arquivo ilegível, formato) vira aviso ao cliente. */
export async function prepareMediaSafe(media: AiMediaInput, meta: Omit<AiCallMeta, "maxTokens">): Promise<PreparedMedia> {
  const kind = aiAttachmentKind(media.mime, media.name);
  if (!kind) return failedMedia("document", media.name, unsupportedReason(media.mime, media.name));
  if (media.data.byteLength > AI_ATTACHMENT_MAX_BYTES) return failedMedia(kind, media.name, `arquivo acima de 10 MB (${(media.data.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  try {
    return await prepareMedia(media, meta);
  } catch (error) {
    // Sem crédito ou chave inválida: o erro sobe (o atendimento vai para a equipe, como em qualquer falha da IA).
    if (error instanceof AiError && (error.creditExhausted || error.status === 401 || error.status === 503)) throw error;
    const reason = error instanceof Error ? error.message : "erro desconhecido";
    console.error(`[ai] ${meta.conversationId ?? "teste"}: falha ao ler ${kind} "${media.name}": ${reason}`);
    return failedMedia(kind, media.name, /demorou|tempo/i.test(reason) ? "o áudio demorou demais para transcrever" : reason.slice(0, 120));
  }
}

type PendingMedia = { id?: string; attachment: unknown; metaMedia: unknown };

/** Eventos comerciais do turno (WhatsApp e teste /ia): receita lida, ficha de modelo com preço, orçamento, loja para comprar. */
export function turnSalesEvents(run: Pick<AgentRun, "documents" | "productInterest" | "anchor" | "location" | "outcome">, pendingText: string): SalesEvent[] {
  // Transferência por pedido de pessoa/limite não é intenção comercial por si (o transbordo para Vendas é tratado no handoff).
  if (run.outcome.action === "no_reply") return [];
  return detectSalesEvents({
    pendingText,
    prescriptions: (run.documents ?? []).filter((doc) => doc.kind === "receita").map((doc) => doc.summary),
    product: run.productInterest ?? null,
    anchoredProduct: run.anchor?.activeProduct ? [run.anchor.activeProduct.nomeComercial, run.anchor.activeProduct.referencia].filter(Boolean).join(" ") : null,
    locationStore: run.location?.nome?.replace(/^Óticas Brasil - /, "") ?? null,
  });
}

/** Receitas lidas pela IA → CustomerPrescription (falha no banco não trava a resposta ao cliente). */
export async function saveReadPrescriptions(documents: ReadDocument[] | undefined, target: { contactId: string; conversationId: string }) {
  for (const doc of documents ?? []) {
    if (doc.kind !== "receita" || !doc.source?.messageId) continue;
    const result = await savePrescriptionFromAi({ ...target, messageId: doc.source.messageId, extraction: doc.extraction }).catch((error) => {
      console.warn(`[ai] ${target.conversationId}: receita não salva no receituário`, error);
      return null;
    });
    if (result?.saved) console.log(`[ai] ${target.conversationId}: receita salva no receituário (${result.id})`);
  }
}

/**
 * Atendimento real: lê TODOS os anexos do lote (até 4), baixados da Meta e guardados no MinIO pelo webhook.
 * Download que falhou no webhook, arquivo grande ou formato antigo viram marcador de falha (a IA avisa o cliente);
 * figurinha é reação informal (sem visão nem catálogo).
 */
async function customerMedia(items: PendingMedia[], meta: Omit<AiCallMeta, "maxTokens">): Promise<PreparedMedia[]> {
  const withMedia = items.filter(hasMediaPayload).slice(-AI_ATTACHMENTS_PER_BATCH);
  return Promise.all(withMedia.map(async (item) => {
    const attachment = item.attachment as ChatAttachment | null;
    const saved = item.metaMedia as { kind?: string; filename?: string; error?: string } | null;
    if (!attachment?.key) return failedMedia(saved?.kind ?? "document", saved?.filename ?? saved?.kind ?? "arquivo", saved?.error ?? "falha ao baixar o arquivo do WhatsApp");
    if (attachment.kind === "sticker") return stickerMedia(attachment.name);
    if (attachment.size > AI_ATTACHMENT_MAX_BYTES) return failedMedia(aiAttachmentKind(attachment.mime, attachment.name) ?? attachment.kind, attachment.name, `arquivo acima de 10 MB (${(attachment.size / 1024 / 1024).toFixed(1)} MB)`);
    // Áudio do cliente: a mesma transcrição gravada na mensagem (exibida no chat) vira a entrada de texto da IA.
    if (attachment.kind === "audio" && item.id) {
      const heard = await transcribeMessageAudio(item.id);
      if ("text" in heard) return { ...mediaParts("audio", { name: attachment.name, mime: attachment.mime, data: new Uint8Array(0) }, heard.text), source: { messageId: item.id } };
      if (heard.error && (heard.error.creditExhausted || heard.error.status === 401 || heard.error.status === 503)) throw heard.error;
      return failedMedia("audio", attachment.name, heard.failed);
    }
    try {
      const prepared = await prepareMediaSafe({ name: attachment.name, mime: attachment.mime, data: await readFile(attachment.key) }, meta);
      // Mensagem de origem: a receita lida vai para o receituário com o arquivo original.
      return item.id ? { ...prepared, source: { messageId: item.id } } : prepared;
    } catch (error) {
      if (error instanceof AiError) throw error;
      console.error(`[ai] ${meta.conversationId}: arquivo do chat ilegível (${attachment.key}):`, error instanceof Error ? error.message : error);
      return failedMedia(attachment.kind, attachment.name, "falha ao abrir o arquivo guardado");
    }
  }));
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
  loadMedia: () => Promise<PreparedMedia[]>;
  meta: Omit<AiCallMeta, "maxTokens">;
  /** Só no teste: lê o anexo mesmo com o gatilho de mídia ligado, para ver como a IA o interpretaria. */
  ignoreMediaTrigger?: boolean;
  /** Conversa já na fila humana, sem atendente: a IA segue ajudando sem transferir de novo. */
  queued?: QueuedState | null;
  /** Mensagens anteriores do cliente nesta conversa (insistência em tentativa de manipulação). */
  earlierCustomerTexts?: string[];
  /** Última mensagem enviada pela IA (despedida → silêncio diante de mais um "obrigado"). */
  lastAiText?: string | null;
  /** Últimas mensagens da IA (mais recente primeiro): "essa loja" resolve para a unidade citada nelas. */
  recentAiTexts?: string[];
  /** Contato do WhatsApp: libera a ferramenta de preencher campos personalizados do cadastro (fora do teste). */
  contactId?: string | null;
  /** Produtos cuja foto já foi enviada nesta etapa (conversa, ou desde a entrada na fila). */
  sentImageSkus?: string[];
  /** Produto e loja fixados nas mensagens da IA DESTE atendimento (nunca de sessões encerradas ou testes anteriores). */
  anchor?: SessionAnchor;
  /** Vitrine numerada mostrada nesta sessão (ordem exibida). */
  listedProducts?: ListedProduct[];
  /** Modelo tocado na lista interativa da vitrine ("product_select:PS 07RV" → "PS 07RV"): abre ficha + foto dele. */
  selectedProductRef?: string | null;
  /** Análise da última foto de produto deste atendimento (aiContext.lastAnalyzedImage): "qual o nome desse modelo?". */
  lastAnalyzedImage?: ImageAnalysis | null;
  /** Nome do contato no cadastro ("Vivi"): nunca é trocado por um nome que o cliente citar. */
  contactName?: string | null;
  isReturningContact?: boolean;
  /** CPF do único cadastro do VMSet vinculado ao telefone (parcelas sem pedir o CPF, com nome completo). */
  linkedCpf?: string | null;
  /** Já existe aprovação financeira pendente nesta conversa: não consulta de novo sem CPF novo. */
  hasPendingFinancial?: boolean;
  catalogContext?: CatalogContext;
  /** Cidade conhecida fora da conversa (cadastro do contato ou loja da última compra): filtra o estoque. */
  knownCity?: string | null;
  /** Consulta de parcelas no VMSet (testes injetam a sua). */
  lookupInstallments?: (cpf: string) => Promise<InstallmentLookup>;
};
export type AgentRun = { outcome: AgentOutcome; media: PreparedMedia | null; mediaTriggerSkipped: boolean; search: SearchLog | null; injection: InjectionCheck; stock?: StockLog[]; humanMode?: HumanRequestMode; image?: ProductImage | null; details?: DetailsLog[]; location?: StoreLocation | null; close?: CloseDecision; anchor?: SessionAnchor; catalogContext?: CatalogContext; /** Receitas/comprovantes lidos (resumo estruturado). */ documents?: ReadDocument[]; /** Vitrine como Lista Interativa nativa do WhatsApp (2+ modelos). */ interactiveList?: InteractiveShowcase | null; /** Análise da foto de produto enviada nesta mensagem (salva na sessão). */ imageAnalysis?: ImageAnalysis | null; /** Resposta da foto enviada como uma única mensagem. */ singleReply?: boolean; /** Modelo com ficha enviada nesta resposta (oportunidade no funil de vendas). */ productInterest?: { name: string; price: number | null } | null; /** Parcelas consultadas aguardando aprovação do operador (nada financeiro foi ao cliente). */ financialApproval?: FinancialApprovalDraft | null; financialLog?: FinancialLog; /** Vitrine como catálogo visual: abertura → 1 foto com legenda curta por modelo → pergunta de escolha. */ visualCatalog?: VisualCatalog | null };

/** Item da vitrine escolhido na lista interativa; fora da vitrine lida, busca específica só pela referência/código. */
export function selectedListedItem(ref: string, listed: ListedProduct[]): ListedProduct {
  const key = ref.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const same = (value: string | null) => !!value && value.replace(/^#/, "").replace(/[^a-z0-9]/gi, "").toUpperCase() === key;
  return listed.find((item) => same(item.referencia) || same(item.sku))
    ?? { index: 0, sku: /^\d+$/.test(ref) ? ref : null, referencia: /^\d+$/.test(ref) ? `#${ref}` : ref, nomeComercial: "", preco: null };
}
const NO_INJECTION: InjectionCheck = { risk: "none", matches: [] };

/** Registro do passo financeiro (teste /ia e logs): o que a IA fez com o pedido de parcelas. */
export type FinancialLog = { step: "ask_identity" | "invalid_cpf" | "not_found" | "name_mismatch" | "unavailable" | "still_waiting" | "approval" | "direct"; cpfMasked?: string; source?: "mensagem" | "cadastro" };

/**
 * Fluxo das parcelas do crediário. Devolve null quando a mensagem não é sobre parcelas (nem resposta ao pedido de
 * identificação). Nunca expõe dados do cadastro antes de o CPF e o nome baterem; com aprovação ligada, o cliente só
 * recebe o aviso de aguardo e o rascunho vai para o operador.
 */
export async function financialFlow(input: AgentRunInput, text: string): Promise<{ outcome: AgentOutcome; approval: FinancialApprovalDraft | null; log: FinancialLog } | null> {
  const asks = isInstallmentQuestion(text);
  const replyingIdentity = awaitingIdentity(input.lastAiText) || input.lastAiText === FINANCIAL_CHECK_CPF || input.lastAiText === FINANCIAL_INVALID_CPF;
  const identity = extractCpf(text) ?? (extractFullName(text) ? { cpf: "", valid: false } : null);
  // Respondendo ao pedido de identificação só conta se trouxe CPF ou nome; mudou de assunto → IA normal.
  if (!asks && !(replyingIdentity && identity)) return null;
  const reply = (message: string, log: FinancialLog, approval: FinancialApprovalDraft | null = null) => ({ outcome: { action: "reply" as const, reply: message, reason: "Consulta de parcelas/crediário", queue: "", trigger: "ai" as const }, approval, log });
  if (input.hasPendingFinancial && !extractCpf(text)) return reply(FINANCIAL_STILL_WAITING, { step: "still_waiting" });

  const step = financialStep({ text, linkedCpf: input.linkedCpf });
  if (step.step === "ask_identity") return reply(FINANCIAL_ASK_IDENTITY, { step: "ask_identity" });
  if (step.step === "invalid_cpf") return reply(FINANCIAL_INVALID_CPF, { step: "invalid_cpf" });
  // Telefone vinculado ao VMSet só dispensa o CPF com o nome completo informado (homônimos, áudio mal transcrito).
  if (step.source === "cadastro" && !isFullName(step.heardName)) return reply(FINANCIAL_ASK_IDENTITY, { step: "ask_identity" });

  const lookup = await (input.lookupInstallments ?? lookupInstallments)(step.cpf);
  const cpfMasked = maskCpf(step.cpf);
  if (lookup.status !== "ok") {
    return { outcome: { action: "handoff", reply: FINANCIAL_UNAVAILABLE, reason: "Consulta de parcelas: sistema do crediário (VMSet) indisponível", queue: "", trigger: "ai" }, approval: null, log: { step: "unavailable", cpfMasked, source: step.source } };
  }
  if (!lookup.found) return reply(FINANCIAL_CHECK_CPF, { step: "not_found", cpfMasked, source: step.source });
  const draft = buildApprovalDraft({ cpf: step.cpf, lookup, transcribedText: text, heardName: step.heardName });
  // CPF de outra pessoa (ou erro do áudio): pede para conferir sem revelar nada do cadastro encontrado.
  if (!draft.nameMatches) return reply(FINANCIAL_CHECK_CPF, { step: "name_mismatch", cpfMasked, source: step.source });
  if (input.settings.requireApprovalForFinancialQueries) return reply(FINANCIAL_WAIT, { step: "approval", cpfMasked, source: step.source }, draft);
  return reply(draft.draftMessage, { step: "direct", cpfMasked, source: step.source });
}

/**
 * Motor único do agente de IA: o atendimento real (WhatsApp) e o teste da página /ia passam por aqui.
 * Regras antes da IA → anexo (visão, transcrição, PDF, documento) → prompt com base de conhecimento e filas →
 * modelo → interpretação. Erro do modelo sobe para quem chamou (o WhatsApp transfere; o teste mostra o erro).
 */
async function runAiAgentInternal(rawInput: AgentRunInput): Promise<AgentRun> {
  // Estúdio de IA: skills desligadas tiram tools, fluxos e gatilhos de transbordo desta resposta.
  const skills = await loadSkills();
  const settings = applySkillsToSettings(rawInput.settings, skills);
  const input: AgentRunInput = { ...rawInput, settings };
  // Pedido de pessoa pelo nome ("Preciso falar com <ATENDENTE>"): a transferência para ela é decidida aqui, mas a
  // confirmação ao cliente é escrita pelo modelo, com as próprias palavras (sem frase pronta).
  let staffRoute: Pick<AgentOutcome, "reason" | "queue" | "assigneeId" | "assigneeName" | "staffQueueId"> & { name: string } | null = null;
  if (!input.queued) {
    const staff = await activeStaff().catch(() => []);
    const request = detectStaffRequest(input.pendingText, staff, input.contactName);
    if (request) {
      staffRoute = {
        name: request.staff?.name ?? request.name,
        reason: `Cliente solicitou atendimento direto com ${request.staff?.name ?? request.name}.`,
        queue: request.staff?.queueName ?? "",
        ...(request.staff ? { assigneeId: request.staff.id, assigneeName: request.staff.name, ...(request.staff.queueId ? { staffQueueId: request.staff.queueId } : {}) } : {}),
      };
    }
  }
  const early = staffRoute ? null : preAgentOutcome(settings, input);
  if (early) return { outcome: early, media: null, mediaTriggerSkipped: false, search: null, injection: NO_INJECTION };
  // Mídia não transfere mais antes da leitura: nada a pular no teste.
  const mediaTriggerSkipped = false;

  // Todos os anexos do lote (até 4): áudio transcrito, documentos lidos, falhas viram aviso ao cliente.
  const mediaList = await input.loadMedia();
  const media = mergeMedia(mediaList);
  // Áudio pedindo atendente: a palavra de transferência vale também na transcrição.
  if (!input.queued && media?.transcript && asksForHuman(settings, media.transcript)) {
    return { outcome: { action: "handoff", reply: "", reason: "Cliente pediu para falar com uma pessoa (áudio)", queue: "", trigger: "keyword" }, media, mediaTriggerSkipped, search: null, injection: NO_INJECTION };
  }

  // Prompt injection: texto, transcrição e documento do cliente passam pelo detector (dados nunca viram regra).
  const documentText = mediaList.filter((item) => item.kind === "text" || item.kind === "docx" || item.kind === "sheet").flatMap((item) => item.parts.map((part) => (part.type === "text" ? part.text : "")));
  const untrusted = [input.pendingText, media?.transcript ?? "", ...documentText].join("\n");
  const injection = detectPromptInjection(untrusted);
  if (injection.risk !== "none") {
    const insisted = injection.risk === "high" && (input.earlierCustomerTexts ?? []).some((earlier) => detectPromptInjection(earlier).risk === "high");
    console.warn(`[ai][security] ${securityLog({ feature: input.meta.feature, conversationId: input.meta.conversationId, userId: input.meta.userId, check: injection, action: insisted ? "handoff" : injection.risk === "high" ? "guard" : "log", sample: untrusted })}`);
    if (insisted) {
      return { outcome: { action: "handoff", reply: "", reason: "Tentativas repetidas de manipular a IA (pedido de regras internas ou mudança de papel)", queue: "", trigger: "security" }, media, mediaTriggerSkipped, search: null, injection };
    }
  }

  // Parcelas/crediário (texto ou áudio): identidade (nome completo + CPF) antes de consultar o VMSet; o resultado
  // só vai ao cliente depois da aprovação do operador no /chat (quando a opção estiver ligada).
  const financial = staffRoute || !skillEnabled(skills, "crediario_aprovacao") ? null : await financialFlow(input, [input.pendingText, media?.transcript ?? ""].filter(Boolean).join("\n"));
  if (financial) return { outcome: financial.outcome, media, mediaTriggerSkipped, search: null, injection, financialApproval: financial.approval, financialLog: financial.log };

  // Foto: identificação silenciosa → busca no catálogo do ERP (a foto não é narrada); receita/comprovante em foto ou
  // PDF: leitura estruturada (graus, valor, data) → confirmação ao cliente + transbordo com o resumo para o atendente.
  let search: SearchLog | null = null;
  const catalogContexts: string[] = [];
  const documents: ReadDocument[] = [];
  const consumed = new Set<PreparedMedia>();
  // Foto de produto desta mensagem: análise (marca, linha, referência provável) e o que a cascata achou em estoque.
  let imageAnalysis: ImageAnalysis | null = null;
  const photoQueries: CatalogQuery[] = [];
  for (const item of mediaList) {
    if (item.failed || item.sticker) continue;
    if (item.kind === "image") {
      const vision = await aiJson<VisionResult>([{ role: "system", content: VISION_PROMPT }, { role: "user", content: item.parts.filter((part) => part.type === "image_url") }], { ...input.meta, maxTokens: 4096 });
      const { kind, query } = readVision(vision);
      const docKind = (kind === "receita" || kind === "documento") && skillEnabled(skills, "leitura_receita") ? documentKind(kind, vision.documento) : null;
      if (docKind) {
        documents.push({ kind: docKind, summary: formatExtraction(docKind, vision.documento), extraction: vision.documento, source: item.source });
        consumed.add(item);
      } else if (kind === "produto") {
        imageAnalysis = makeImageAnalysis(query);
        photoQueries.push(query);
        consumed.add(item);
      }
    } else if (item.kind === "pdf" && skillEnabled(skills, "leitura_receita")) {
      const read = await aiJson<{ kind?: string; documento?: DocumentExtraction }>([{ role: "system", content: DOCUMENT_EXTRACT_PROMPT }, { role: "user", content: item.parts }], { ...input.meta, maxTokens: 700 }).catch(() => null);
      const kind = read ? documentKind(read.kind ?? "", read.documento) : null;
      if (kind) documents.push({ kind, summary: formatExtraction(kind, read?.documento), extraction: read?.documento, source: item.source });
    }
  }
  const catalogContext = catalogContexts.length ? `${CATALOG_FOUND_RULE}\n\n${catalogContexts.join("\n\n")}` : "";
  // Receita/comprovante lidos: com a regra de documentos ligada, transfere com o resumo; a confirmação ao cliente
  // é escrita pelo modelo (documentReply só cobre resposta vazia do modelo).
  let documentRoute: { kinds: ReadDocument["kind"][]; reason: string; queue: string } | null = null;
  if (documents.length && settings.handoffOnMedia && !staffRoute) {
    const kinds = documents.map((doc) => doc.kind);
    const queueNames = (await prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { name: true }, orderBy: { order: "asc" } }).catch(() => [])).map((queue) => queue.name);
    documentRoute = { kinds, reason: documentHandoffReason(documents), queue: documentQueue(queueNames, kinds) };
  }
  const documentContext = documents.length ? `Dados extraídos dos documentos do cliente (use para responder; não repita tudo para ele):\n${documents.map((doc) => `- ${doc.summary}`).join("\n")}` : "";
  // Partes que vão ao modelo: anexos ainda não resolvidos no código (falhas e figurinhas vão como texto).
  const sendParts = mediaList.filter((item) => !consumed.has(item)).flatMap((item) => item.parts);

  const customerText = [input.pendingText, media?.transcript ?? ""].filter(Boolean).join("\n");
  // Regras da empresa casam com o assunto das últimas mensagens do cliente; o RAG busca pela mensagem atual.
  const conversationText = [customerText, ...(input.earlierCustomerTexts ?? []).slice(0, 4)].join("\n");
  const [context, info, queues, studioContext] = await Promise.all([
    input.buildContext(media),
    knowledge(settings),
    settings.aiChoosesQueue ? prisma.chatQueue.findMany({ where: { archivedAt: null }, select: { id: true, name: true, description: true }, orderBy: { order: "asc" } }) : [],
    loadStudioContext(customerText, { userId: input.meta.userId, conversationId: input.meta.conversationId }).catch(() => ({ skills })),
  ]);
  const directory = await storeDirectory();
  const cities = [...directory.values()].map((store) => store.city ?? "");
  const previousCatalog = input.catalogContext?.brand || input.catalogContext?.preferredCity
    ? input.catalogContext
    : [...(input.earlierCustomerTexts ?? [])].reverse().reduce((state, text) => updateCatalogContext(state, text, cities).context, { ...EMPTY_CATALOG_CONTEXT });
  const intent = updateCatalogContext(previousCatalog, customerText, cities);
  const catalogState = intent.context;
  // Cidade do cadastro/última compra (se for de uma loja da rede) vale como cidade da sessão.
  if (!catalogState.preferredCity && input.knownCity) catalogState.preferredCity = extractPreferredCity(input.knownCity, cities) ?? "";
  // Consultora: orçamento da conversa vira filtro; sem cidade, pergunta antes de listar qualquer produto.
  const { budget, cheap } = conversationBudget([...[...(input.earlierCustomerTexts ?? [])].reverse(), customerText]);
  const wantsKids = conversationWantsKids([...(input.earlierCustomerTexts ?? []), customerText]);
  // Marca ativa da sessão (aiContext.activeBrand): estilo/ocasião dito depois ("mais presença no rosto") continua a
  // busca da marca; sem cidade, pergunta a cidade em vez de cair no fluxo de modelo específico.
  const activeBrand = catalogState.activeBrand || catalogState.brand;
  const continuesBrand = !!activeBrand && !catalogState.preferredCity && !asksStoreLocation(input.pendingText) && !asksForHuman(settings, customerText) && !isPureGreeting(input.pendingText) && !isInstallmentQuestion(customerText);
  const cityFirst = needsCityFirst({ knownCity: catalogState.preferredCity, text: continuesBrand ? `${customerText} ${activeBrand}` : customerText, photo: !!photoQueries.length, selectedProduct: !!input.selectedProductRef, queued: !!input.queued || !!staffRoute || !!documentRoute });
  // "Óculos" sem dizer grau ou sol: pergunta o tipo antes de listar (não mistura sol e grau).
  const typeFirst = needsTypeFirst({ category: catalogState.category, brand: catalogState.brand, texts: [...(input.earlierCustomerTexts ?? []), customerText], photo: !!photoQueries.length, selectedProduct: !!input.selectedProductRef, queued: !!input.queued || !!staffRoute || !!documentRoute });
  const askBudget = (cityFirst || typeFirst) && !budget.maxPrice && !budget.minPrice && !catalogState.brand;
  const cityProduct = intent.city && !intent.brand && !intent.correction ? input.anchor?.activeProduct : null;
  const forceCatalog = !cityFirst && !staffRoute && !documentRoute && !photoQueries.length && !input.selectedProductRef && !!catalogState.brand && !asksForHuman(settings, customerText)
    && (intent.correction || !!intent.city || (!!intent.brand && isBroadBrandRequest(customerText, intent.brand)) || (!!catalogState.brand && !!previousCatalog.brand && intent.changed && !intent.brand));
  // Pedido de pessoa com a IA roteando: sem assunto → 1 pergunta de triagem; com assunto → transfere já para a fila certa.
  // Âncora do atendimento atual: follow-up de detalhes usa o produto fixado; localização no singular usa a loja fixada.
  const anchor = input.anchor ?? EMPTY_ANCHOR;
  const storeFollowUp = isStoreFollowUp(input.pendingText, anchor);
  // Foto nova de produto: a busca é a da foto, nunca o produto fixado antes.
  let photoQuery = photoQueries[0] ?? null;
  const anchoredProduct = !photoQuery && !forceCatalog && isProductFollowUp(input.pendingText, anchor) ? anchor.activeProduct : null;
  // Análise da foto desta mensagem ou da última foto do atendimento (responde "qual o nome desse modelo?").
  const analysis = imageAnalysis ?? input.lastAnalyzedImage ?? null;
  const anchorNumbers = anchoredProduct ? modelNumbers(`${anchoredProduct.referencia ?? ""} ${anchoredProduct.nomeComercial}`) : [];
  const sameModel = (description: string) => modelNumbers(description).some((number) => anchorNumbers.includes(number));
  // Vitrine desta sessão: "o 1", "esse primeiro", "o de 120" escolhem um item (pedido de localização não é escolha).
  // Último catálogo exibido (aiContext.lastShownProducts) vale primeiro: as legendas das fotos não levam "Ref.".
  const shown = catalogState.lastShownProducts ?? [];
  const listed: ListedProduct[] = shown.length
    ? shown.map((item) => ({ index: item.index, sku: item.id || null, referencia: item.ref, nomeComercial: item.name, preco: item.price }))
    : input.listedProducts ?? [];
  // Modelos das vitrines desta resposta (estoque, lojas e códigos): base do catálogo com fotos.
  const shownModels: ShowcaseModel[] = [];
  // Toque na lista interativa: escolha determinística (busca específica com foto + ficha + lojas).
  const choice: ListedChoice = photoQuery || forceCatalog ? null : input.selectedProductRef
    ? { type: "item", item: selectedListedItem(input.selectedProductRef, listed) }
    : asksStoreLocation(input.pendingText) ? null : resolveListedChoice(input.pendingText, listed);
  let cardShown: string | null = null;
  let productInterest: { name: string; price: number | null } | null = null;
  let interactiveList: InteractiveShowcase | null = null;
  const humanMode = input.queued ? null : humanRequestMode(settings, { pendingText: input.pendingText, aiReplies: input.aiReplies, asked: asksForHuman(settings, input.pendingText) });
  // Regras, resultado do catálogo e alerta ficam só no "system"; o "user" leva só dados do cliente, delimitados.
  const system = buildSystemPrompt({
    settings,
    queues,
    info,
    // Saudação só na primeira resposta da IA nesta conversa (WhatsApp e teste contam as respostas iguais).
    firstReply: input.aiReplies === 0,
    queued: input.queued,
    // Módulos de lib/ai/prompts escolhidos pelo assunto desta mensagem e pelo estado da sessão.
    // Estúdio de IA: regras da empresa ligadas ao assunto, skills e trechos do RAG entram no composeSystemPrompt.
    prompt: { text: customerText, activeBrand, preferredCity: catalogState.preferredCity, category: catalogState.category, showcase: listed.length > 0 || forceCatalog || !!photoQueries.length, studio: { ...studioContext, skills }, conversationText },
    extra: [cityFirst ? cityFirstBlock(askBudget, typeFirst) : typeFirst ? typeFirstBlock(askBudget) : "", catalogState.preferredCity ? `CIDADE DO CLIENTE: ${catalogState.preferredCity} (a busca de estoque já usa só lojas dessa cidade).` : "", budgetBlock(budget, cheap), SESSION_ANCHOR_RULES, anchorPromptBlock(anchor), listedPromptBlock(listed, choice), media ? MEDIA_RULES : "", analysisPromptBlock(analysis), catalogContext, documentContext, injection.risk === "high" ? INJECTION_ALERT : "", settings.sendProductImage && imageSearchStatus() ? IMAGE_CAPTION_RULE : "", humanMode === "triage" ? TRIAGE_NOW : humanMode === "route" ? ROUTE_NOW : "", isPureGreeting(input.pendingText) ? PURE_GREETING_HINT : input.queued ? "" : bareNameHint(input.pendingText, input.contactName)],
  });
  // Tool somente leitura de estoque: busca local (top 5) + saldo por loja na API do VMSet (cache 3 min, limite 3 s).
  const stock: StockLog[] = [];
  // Foto do produto (web + cache por código): 1ª consulta do modelo na etapa ou pedido do cliente; mesmo pipeline
  // com ou sem fila (alreadyQueued não bloqueia a foto).
  let image: ProductImage | null = null;
  const photoFor = async (product: { codigo: string; produto: string; marca?: string | null }): Promise<ProductImage | null | "sent"> => {
    if (image || !settings.sendProductImage || !imageSearchStatus()) return null;
    if (anchoredProduct) {
      // Follow-up do produto fixado: nunca foto de outro modelo; a foto dele já enviada não se repete.
      if (product.codigo !== anchoredProduct.sku && !sameModel(product.produto)) return null;
      if (anchoredProduct.sku && (input.sentImageSkus ?? []).includes(anchoredProduct.sku) && !asksForPhoto(input.pendingText)) return "sent";
    }
    if (!shouldSendProductPhoto({ sku: product.codigo, sentSkus: input.sentImageSkus ?? [], pendingText: input.pendingText })) return "sent";
    image = await searchAndCacheProductImage(product);
    return image;
  };
  // Marca x modelo: sem referência/SKU, código ou nome de modelo explícito (nem item escolhido na vitrine), a busca da
  // marca ativa é sempre a vitrine dela; nunca o fluxo de "modelo específico" ("Não encontrei esse modelo...").
  const categoryWord = catalogState.category === "ARMACAO" ? "armação" : catalogState.category === "SOLAR" ? "solar" : catalogState.category === "LENTE_CONTATO" ? "lentes de contato" : "";
  // Referência/SKU ("0RB3025", "MU01", "004/7858"), apelido ou modelo icônico ("Justin", "Aviator").
  const explicitModel = (text: string) => asksSpecificModel(text) || !!iconicModel(text) || /[a-z]-?\d{2,}|\d{3,}[a-z]|\d{3,}\s*\/\s*\d+/i.test(text);
  const brandOnlySearch = (args: Record<string, unknown>) => {
    if (!activeBrand || args._photo || input.selectedProductRef || args.tipoBusca === "marca_ampla") return false;
    const term = String(args.termoBusca ?? [args.marca, args.nomeModelo, args.referenciaOuSku].filter(Boolean).join(" "));
    const termBrand = explicitBrand(term);
    if (!termBrand || normalizeTerm(termBrand) !== normalizeTerm(activeBrand)) return false;
    return !explicitModel(term) && !explicitModel(customerText) && !(typeof args.referenciaOuSku === "string" && args.referenciaOuSku.trim());
  };
  const toolStores: SessionStore[] = [];
  let currentCatalogFilterHash = "";
  /** Última vitrine (texto numerado) devolvida ao modelo nesta resposta: base do catálogo com fotos. */
  let toolShowcase: string | null = null;
  // Fotos do catálogo por código (cache → web), buscadas junto da vitrine.
  const catalogPhotos: Record<string, string> = {};
  const catalogPhotosFor = async (models: ShowcaseModel[]) => {
    if (!settings.sendProductImage || !models.length) return 0;
    try {
      Object.assign(catalogPhotos, await catalogImages(models, { want: VISUAL_CATALOG_MAX, web: !!imageSearchStatus() }));
    } catch (error) {
      console.warn(`[ai][catalogo] fotos indisponíveis (${error instanceof Error ? error.message : error})`);
    }
    return Math.min(VISUAL_CATALOG_MAX, models.filter((model) => model.codigos.some((code) => !!catalogPhotos[code])).length);
  };
  // Marca sem saldo na cidade: mesma marca nas outras praças + até 3 marcas parecidas com saldo na cidade.
  const localBrandFallback = (brand: string, city: string) => brandStockFallback({
    brand, city, categoryWord, maxAlternatives: 3,
    otherCities: [...new Set(cities.filter(Boolean).map((name) => {
      const canonical = canonicalCity(name);
      return canonical.length > 3 && canonical === canonical.toUpperCase() ? titleCase(canonical) : canonical;
    }))].slice(0, 8),
    search: async (args) => {
      const { result, log } = await consultarEstoqueProduto({ ...withBudgetArgs(args, { budget, cheap, category: catalogState.category }), ...(wantsKids ? { publicoInfantil: true } : {}) }, { products: catalogProducts, withPrices: settings.canQuotePrices });
      stock.push(log);
      return result.tipoBusca === "marca_ampla" ? result : null;
    },
  }).catch(() => null);
  const stockTool = {
    definition: STOCK_TOOL,
    run: async (args: Record<string, unknown>) => {
      // Preço que serve para vários itens da vitrine: nada de nova busca (nem a mesma lista); pergunta número/referência.
      if (choice?.type === "ambiguous") return { tipoBusca: "marca_ampla", vitrineJaEnviada: true, produtos: [], opcoesComEssePreco: choice.items.map((item) => item.index), orientacao: `Não repita a vitrine. O preço citado (${formatBrl(choice.price)}) vale para as opções ${choice.items.map((item) => item.index).join(", ")}: pergunte com suas palavras qual delas o cliente quer ver, pelo número da foto, sem citar códigos de referência.` };
      // Item escolhido na vitrine (número, posição, referência ou preço único): busca específica com a referência exata.
      const chosen = choice?.type === "item" ? choice.item : null;
      const baseQuery = chosen
        ? { ...args, termoBusca: listedSearchTerm(chosen), tipoBusca: "modelo_especifico" }
        : anchoredProduct ? { ...args, termoBusca: [anchoredProduct.marca, anchoredProduct.referencia ?? anchoredProduct.nomeComercial].filter(Boolean).join(" "), tipoBusca: "modelo_especifico" }
          : brandOnlySearch(args) ? brandSearchArgs(args, activeBrand, categoryWord) : args;
      // Regra de ouro geográfica: vitrine só com a cidade do cliente conhecida.
      if (!chosen && isGatedStockCall(baseQuery, { knownCity: catalogState.preferredCity, fixedProduct: !!anchoredProduct })) {
        return gatedStockResult(askBudget, typeFirst);
      }
      // Óculos sem tipo: nada de vitrine misturando sol e grau antes de saber qual ele procura.
      if (!chosen && !anchoredProduct && typeFirst && isBroadStockCall(baseQuery)) {
        return typeGatedResult(askBudget);
      }
      // Cidade digitada pelo modelo com erro ("Goiânai", "Brasila") vira a cidade real da rede.
      const cityArg = typeof args.cidade === "string" && args.cidade.trim() ? extractPreferredCity(args.cidade, cities) ?? args.cidade : args.cidade;
      const query: Record<string, unknown> = { ...withBudgetArgs(baseQuery, { budget, cheap, category: catalogState.category }), cidade: catalogState.preferredCity || cityArg };
      // Público adulto por padrão; linha infantil só se o cliente falou de criança/filho(a)/idade juvenil.
      if (wantsKids) query.publicoInfantil = true;
      else delete query.publicoInfantil;
      let { result, log } = await consultarEstoqueProduto(query, { products: catalogProducts, withPrices: settings.canQuotePrices });
      stock.push(log);
      // Só 1 modelo na cidade: nada de lista "1." nem "quer que eu veja as lojas?" — já abre a ficha com foto e lojas.
      if (result.tipoBusca === "marca_ampla" && "modelos" in result && result.modelos.length === 1) {
        const only = result.modelos[0];
        const ref = cleanReference(only.referencia);
        const exactQuery: Record<string, unknown> = { termoBusca: `${only.nomeComercial} ${ref && !ref.startsWith("#") ? ref : only.codigos[0]}`, tipoBusca: "modelo_especifico", cidade: query.cidade };
        const exact = await consultarEstoqueProduto(exactQuery, { products: catalogProducts, withPrices: settings.canQuotePrices });
        if (exact.result.tipoBusca !== "marca_ampla" && (exact.result.produtos ?? []).some((product) => product.lojasComEstoque?.length)) {
          ({ result, log } = exact);
          stock.push(log);
          query.termoBusca = exactQuery.termoBusca;
          query.tipoBusca = "modelo_especifico";
        }
      }
      if (result.tipoBusca === "marca_ampla") currentCatalogFilterHash = [String(query.termoBusca ?? ""), String(query.cidade ?? ""), catalogState.category].map(normalizeTerm).join("|");
      // Lojas da consulta, direto do objeto estruturado (o texto da conversa é só o fallback).
      for (const product of result.produtos ?? []) {
        for (const store of product.lojasComEstoque ?? []) {
          const card = cardStore(store);
          if (card.endereco) toolStores.push({ nome: /^loja\b/i.test(card.loja) ? card.loja : `Loja ${card.loja}`, cidade: card.cidade, enderecoCompleto: card.endereco });
        }
      }
      // Trava anti-loop: a mesma vitrine já enviada nesta sessão não sai de novo; o cliente escolhe pelo número/referência.
      if (!forceCatalog && !intent.changed && (!catalogState.lastCatalogFilterHash || catalogState.lastCatalogFilterHash === currentCatalogFilterHash) && result.tipoBusca === "marca_ampla" && listed.length && !asksListAgain(input.pendingText) && repeatsShowcase(result.vitrineFormatada ?? "", listed)) {
        return { tipoBusca: "marca_ampla", vitrineJaEnviada: true, produtos: [], orientacao: "Essas opções já foram enviadas nesta conversa: NÃO repita a lista. Converse com o cliente sobre elas com suas palavras; se ele quiser ver uma, basta dizer o número da foto." };
      }
      // Busca ampla (só marca/categoria): vitrine com nome e preço, sem ficha nesta etapa. As fotos do catálogo já
      // são buscadas aqui, para o modelo saber se o cliente vai receber fotos ou só o texto.
      if (result.tipoBusca === "marca_ampla") {
        const models = "modelos" in result ? result.modelos : [];
        const city = typeof query.cidade === "string" ? query.cidade : catalogState.preferredCity;
        const brandName = typeof query.marca === "string" && query.marca.trim() ? query.marca : explicitBrand(String(query.termoBusca ?? "")) ?? "";
        // Marca sem saldo na cidade: no mesmo payload, a mesma marca em outras praças (transferência) e até 3
        // opções reais de marcas parecidas na cidade do cliente. Quem escreve a resposta é o modelo.
        if (!models.length && !result.vitrineFormatada && query.tipoBusca !== "modelo_especifico" && city && brandName && "cenario" in result && result.cenario !== "unavailable_api") {
          const fallback = await localBrandFallback(brandName, city);
          if (fallback && !fallback.unavailable) {
            shownModels.push(...fallback.alternatives);
            if (fallback.alternatives.length >= 2) interactiveList = buildShowcaseList(fallback.alternatives, null);
            const photos = await catalogPhotosFor(fallback.alternatives);
            return {
              ...result,
              marcaSemSaldoNaCidade: { marca: brandName, cidade: city },
              disponivelEmOutrasCidades: fallback.otherCities,
              alternativasNaCidade: fallback.alternatives.map((model) => ({ nome: model.nomeComercial, preco: model.precoVenda, lojas: model.lojas ?? [] })),
              vitrineFormatada: (toolShowcase = fallback.alternatives.length ? formatShowcase(fallback.alternatives, { header: false }) : null),
              fotosNoCatalogo: photos,
              orientacao: fallback.otherCities.length
                ? `${brandName} está sem saldo em ${city}, mas tem em ${fallback.otherCities.slice(0, 3).join(", ")}: conte isso com transparência e diga que dá para pedir a transferência para uma loja de ${city}.${fallback.alternatives.length ? " Em seguida apresente as alternativas locais (vitrineFormatada), comentando em poucas palavras por que combinam com o pedido." : ""}`
                : `${brandName} está sem saldo em ${city} e nas outras unidades: diga isso com transparência e ofereça que um atendente verifique encomenda.${fallback.alternatives.length ? " Apresente as alternativas locais (vitrineFormatada), comentando em poucas palavras por que combinam com o pedido." : ""}`,
            };
          }
        }
        shownModels.push(...models);
        interactiveList = buildShowcaseList(models, null);
        toolShowcase = result.vitrineFormatada ?? null;
        return { ...result, fotosNoCatalogo: await catalogPhotosFor(models) };
      }
      if (!allowsProductPhoto(result)) return result;
      // Referência pedida (ou o produto fixado) primeiro: a ficha e a foto nunca saem de outro modelo da lista.
      const wantedNumbers = anchorNumbers.length ? anchorNumbers : modelNumbers(String(query.termoBusca ?? ""));
      const iconic = iconicModel(String(query.termoBusca ?? ""));
      const available = result.produtos.filter((product) => {
        if (!product.lojasComEstoque.length) return false;
        if (!iconic || chosen) return true;
        const candidate = iconicModel(product.produto, product.marca);
        return !!candidate && candidate.references.some((reference) => iconic.references.includes(reference));
      });
      if ((args._photo || (iconic && !chosen && !anchoredProduct)) && available.length > 1) {
        const colorWords = (photoQuery?.color ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter((word) => word.length >= 4 && !["LENTE", "LENTES", "ARMACAO", "COM"].includes(word));
        const colorMatches = colorWords.length ? available.filter((product) => colorWords.every((word) => normalizeTerm(product.produto).includes(word))) : [];
        if (colorMatches.length !== 1) {
          const variants = photoVariants(available, args._photo && imageAnalysis ? analysisName(imageAnalysis) : `Ray-Ban ${iconic?.name ?? ""}`, !!args._photo);
          if (variants) {
            interactiveList = variants.list;
            toolShowcase = variants.text;
            return { ...result, vitrineFormatada: variants.text, orientacao: "Há mais de uma variação (cor) desse modelo com estoque: comente com suas palavras e deixe o cliente escolher pelo número. As opções são anexadas pelo sistema depois do seu texto." };
          }
        } else {
          available.splice(0, available.length, colorMatches[0]);
        }
      }
      const chosenRef = chosen?.referencia ? chosen.referencia.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : "";
      const inStock = available.find((product) => !!chosen && (chosen.sku ? product.codigo === chosen.sku : showcaseReference(product.produto, product.marca, product.codigo).replace(/[^A-Za-z0-9]/g, "").toUpperCase() === chosenRef))
        ?? available.find((product) => !!anchoredProduct?.sku && product.codigo === anchoredProduct.sku)
        ?? available.find((product) => modelNumbers(product.produto).some((number) => wantedNumbers.includes(number)))
        ?? available[0];
      if (!inStock) return result;
      // Ficha resumida (mini-descrição + avaliação, cache 30 dias) e foto em paralelo.
      const [photo, summary] = await Promise.all([photoFor(inStock), productSummary({ code: inStock.codigo, description: inStock.produto, brand: inStock.marca })]);
      if (photo !== null || !image) log.image = photo === "sent" ? "sent" : photo ? photo.source : log.image ?? (settings.sendProductImage && imageSearchStatus() ? "none" : undefined);
      log.sheet = summary.source;
      log.rating = summary.avaliacaoWeb;
      inStock.miniDescricao = summary.miniDescricao;
      inStock.avaliacaoWeb = summary.avaliacaoWeb;
      // Campos estruturados da ficha e o card no template visual do negócio, montado no código (a IA só copia).
      const naming = commercialName(inStock.produto, inStock.marca);
      const fields: ProductCardFields = {
        ...naming,
        // Sem "REF" no cadastro: a mesma referência que a vitrine mostrou ("OPBR 455").
        referencia: naming.referencia ?? fallbackReference(inStock.produto, inStock.marca),
        formatoArmacao: summary.formato,
        acabamentoOuMaterial: summary.acabamento,
        valorFormatado: inStock.precoVenda,
        totalUnidades: inStock.lojasComEstoque.reduce((sum, store) => sum + store.quantidade, 0),
        lojasDisponiveis: inStock.lojasComEstoque.map(cardStore),
      };
      // A ficha leva só os dados do produto; a frase de abertura é do modelo, com as próprias palavras.
      const card = { ...result, fichaProduto: fields, fichaFormatada: buildProductCard(fields, ""), orientacao: `${result.orientacao}\n${cardGuidance()}` };
      cardShown = card.fichaFormatada;
      productInterest = { name: [fields.nomeComercial, fields.referencia].filter(Boolean).join(" ").slice(0, 80), price: parseBrl(fields.valorFormatado) };
      return image ? { ...card, fotoAnexada: true } : card;
    },
  };
  // Buscas que o código faz antes do modelo (marca/cidade nova, item escolhido na vitrine, foto de produto): o
  // resultado vira FATOS no prompt e o modelo escreve a resposta com as próprias palavras. O sistema só anexa os
  // dados (ficha, opções com foto) depois do comentário dele; nenhuma frase pronta sai do código.
  const turnFacts: string[] = [];
  type StockRun = Awaited<ReturnType<typeof stockTool.run>>;
  const contentOf = (result: StockRun) => {
    const data = result as Record<string, unknown>;
    if (typeof data.fichaFormatada === "string" && data.fichaFormatada) return data.fichaFormatada;
    return typeof data.vitrineFormatada === "string" && data.vitrineFormatada ? data.vitrineFormatada : null;
  };
  const resultFacts = (result: StockRun) => {
    const data = result as Record<string, unknown>;
    const keys = ["cenario", "orientacao", "marcaSemSaldoNaCidade", "disponivelEmOutrasCidades", "alternativasNaCidade", "fotosNoCatalogo", "vitrineJaEnviada"];
    return JSON.stringify(Object.fromEntries(keys.filter((key) => data[key] !== undefined && data[key] !== null).map((key) => [key, data[key]])));
  };
  const attachedHint = (result: StockRun) => contentOf(result)
    ? `${"fichaFormatada" in result ? "A ficha do produto (com foto e lojas)" : "As opções (fotos com legenda curta)"} são anexadas pelo sistema logo depois do seu texto: não reescreva lista, ficha, preços nem códigos. Se couber uma pergunta leve depois das fotos, coloque-a após ---SPLIT---.`
    : "Não há itens para mostrar: responda com suas palavras a partir desses fatos, sem inventar modelos.";
  let preResult: StockRun | null = null;
  const stockSkill = skillEnabled(skills, "estoque_cidade");
  if (forceCatalog && stockSkill) {
    const term = cityProduct ? [cityProduct.marca, cityProduct.referencia ?? cityProduct.nomeComercial].filter(Boolean).join(" ") : [catalogState.brand, categoryWord].filter(Boolean).join(" ");
    preResult = await stockTool.run({ termoBusca: term, marca: catalogState.brand, cidade: catalogState.preferredCity, tipoBusca: cityProduct ? "modelo_especifico" : "marca_ampla" });
  } else if (choice?.type === "item" && !photoQueries.length && stockSkill) {
    // Item escolhido na vitrine ("gostei da segunda", toque na lista): a ficha dele já sai, mesmo se o modelo não buscar.
    preResult = await stockTool.run({ termoBusca: listedSearchTerm(choice.item), tipoBusca: "modelo_especifico" });
  }
  const preContent = preResult ? contentOf(preResult) : null;
  if (preResult) {
    const tone = intent.correction ? "reconheça o engano com naturalidade" : /\b(presentear|presente)\b/i.test(customerText) ? "reconheça o presente com carinho" : "conecte com o que o cliente acabou de dizer";
    turnFacts.push(`BUSCA JÁ FEITA NESTA RESPOSTA: ${resultFacts(preResult)}\nEscreva um comentário curto e natural (${tone}). ${attachedHint(preResult)}`);
  }
  const photoContents: string[] = [];
  for (const currentPhoto of photoQueries) {
    photoQuery = currentPhoto;
    imageAnalysis = makeImageAnalysis(currentPhoto);
    const name = analysisName(imageAnalysis) || [photoQuery.brand, photoQuery.model].filter(Boolean).join(" ");
    const term = [photoQuery.brand, photoQuery.model || (!photoQuery.reference ? photoQuery.line : ""), photoQuery.reference].filter(Boolean).join(" ");
    const specific = !!(photoQuery.model || photoQuery.reference);
    if (!term) {
      turnFacts.push("FOTO DE PRODUTO: não deu para identificar o modelo com segurança. Peça com naturalidade a marca ou a referência escrita na haste.");
      continue;
    }
    const equivalents = iconicModel(photoQuery.model ?? "", photoQuery.brand)?.references ?? [];
    const result = await stockTool.run({
      termoBusca: term, tipoBusca: specific ? "modelo_especifico" : "marca_ampla",
      marca: photoQuery.brand, nomeModelo: photoQuery.model, referenciaOuSku: photoQuery.reference || (equivalents.length === 1 ? equivalents[0] : ""),
      textoVisivelNaImagem: photoQuery.visibleText, _photo: true,
    });
    const last = stock[stock.length - 1];
    if (last) search = { kind: "produto", term, found: last.products };
    const content = contentOf(result);
    const missing = "cenario" in result && ["sem_estoque_na_cidade", "sem_estoque_na_rede", "produto_nao_encontrado"].includes(String(result.cenario));
    if (content && !missing) {
      photoContents.push(content);
      turnFacts.push(`FOTO DE PRODUTO: identificado como ${name}, com estoque. ${resultFacts(result)}\nConfirme com suas palavras, sem descrever a foto. ${attachedHint(result)}`);
    } else if (specific && missing && photoQuery.brand) {
      const family = [photoQuery.brand, photoQuery.line].filter(Boolean).join(" ");
      const alternative = await stockTool.run({ termoBusca: family, tipoBusca: "marca_ampla" });
      const alternativeContent = contentOf(alternative);
      if (alternativeContent) photoContents.push(alternativeContent);
      turnFacts.push(`FOTO DE PRODUTO: identificado como ${name}, mas esse modelo não está disponível${catalogState.preferredCity ? ` em ${catalogState.preferredCity}` : " agora"}. Conte isso com transparência. Busca de outras opções da mesma marca: ${resultFacts(alternative)}\n${attachedHint(alternative)}`);
    } else {
      turnFacts.push(`FOTO DE PRODUTO: identificado como ${name}. Resultado da busca: ${resultFacts(result)}\n${attachedHint(result)}`);
    }
  }
  const photoContent = photoContents.length ? photoContents.join("\n---SPLIT---\n") : null;
  if (photoQueries.length > 1) {
    interactiveList = null;
    image = null;
  }
  // Ficha do produto (web, cache 30 dias) + cores do mesmo modelo com saldo no ERP.
  const details: DetailsLog[] = [];
  const detailsTool = {
    definition: DETAILS_TOOL,
    run: async (args: Record<string, unknown>) => {
      const query = anchoredProduct ? { nomeProduto: anchoredProduct.nomeComercial, marca: anchoredProduct.marca ?? undefined, referencia: anchoredProduct.referencia ?? undefined, codigo: anchoredProduct.sku ?? undefined } : args;
      const { result, log, product } = await buscarDetalhesProduto(query, { products: catalogProducts });
      details.push(log);
      // Pedido de detalhes também leva a foto se ela ainda não foi enviada nesta etapa (ou se o cliente pediu).
      if (product) await photoFor(product);
      return image ? { ...result, fotoAnexada: true } : result;
    },
  };
  // Encerramento pedido pela IA: a trava fixa decide de verdade depois da resposta (fila, atendente, dúvida).
  let closeReason: string | null = null;
  const closeTool = {
    definition: CLOSE_TOOL,
    run: async (args: Record<string, unknown>) => {
      const check = aiCloseDecision({ requested: true, enabled: settings.closeWhenResolved, queued: !!input.queued, assigned: false, asksHuman: asksForHuman(settings, input.pendingText), pendingText: input.pendingText });
      if (!check.close) return { encerrado: false, motivo: CLOSE_BLOCK_LABELS[check.blocked ?? "disabled"], orientacao: "Não encerre: responda normalmente ao cliente." };
      closeReason = typeof args.motivoResumo === "string" && args.motivoResumo.trim() ? args.motivoResumo.trim().slice(0, 200) : "Cliente agradeceu e encerrou";
      return { encerrado: true, orientacao: "O atendimento será encerrado logo depois da sua despedida e a pesquisa de satisfação será enviada. Responda só com a despedida curta (sem pergunta), action \"resolved\"." };
    },
  };
  // Localização da loja: enviada depois da resposta (pin nativo com coordenadas; senão link do Google Maps).
  let location: StoreLocation | null = null;
  const pinStore = async (code: string, info: Parameters<typeof storeLocation>[1]) => {
    let store = info;
    // Sem pin salvo: geocodifica o endereço em nível de rua agora (centro de cidade/bairro não vale) e guarda.
    if ((store.lat == null || store.lng == null) && store.id) {
      const pin = await ensureStorePin(store.id).catch(() => null);
      if (pin) {
        store = { ...store, lat: pin.lat, lng: pin.lng };
        clearStoreDirectory();
      }
    }
    return storeLocation(code, store);
  };
  // Loja fixada na sessão (activeStore) no cadastro: pedido no singular manda direto o endereço já informado.
  const anchoredLocation = async (wanted: string) => {
    if (!storeFollowUp || !anchor.activeStore) return null;
    const stores = await storeDirectory();
    const directory = [...stores].map(([code, store]) => ({ code, store }));
    const named = wanted ? findStores(stores, wanted) : [];
    const match = anchoredStoreMatch(directory, `${anchor.activeStore.nome} ${anchor.activeStore.enderecoCompleto}`, named);
    return match ? pinStore(match.code, match.store) : null;
  };
  // Loja pedida em cascata (sessão → CRM → ERP); endereço só da conversa ou do ERP: geocodifica na hora (senão link do Maps).
  const locateStoreRequest = async (queries: string[]): Promise<{ type: "found"; location: StoreLocation } | { type: "ambiguous"; options: string[] } | { type: "none" }> => {
    const sessionStores = [...toolStores, ...(input.recentAiTexts ?? []).flatMap((text) => storesIn(text))];
    const resolved = resolveStoreRequest({ queries, sessionStores, directory: await storeDirectory(), erpUnits: erpUnitDirectory(), recentAiTexts: input.recentAiTexts });
    if (resolved.type !== "found") return resolved;
    if (resolved.source === "crm") return { type: "found", location: await pinStore(resolved.code, resolved.store) };
    const pin = resolved.store.address
      ? await geocodeStoreAddress({ ...resolved.store, state: resolved.store.state ?? "GO" }, { fetch: (url, init) => fetch(url, init), googleKey: process.env.GOOGLE_MAPS_API_KEY?.trim() || null, timeoutMs: 4000 }).catch(() => null)
      : null;
    return { type: "found", location: storeLocation(resolved.code, pin ? { ...resolved.store, lat: pin.lat, lng: pin.lng } : resolved.store) };
  };
  const locationTool = {
    definition: LOCATION_TOOL,
    run: async (args: Record<string, unknown>) => {
      const wanted = typeof args.nomeLoja === "string" ? args.nomeLoja.slice(0, 60) : "";
      const fixed = await anchoredLocation(wanted);
      if (fixed) {
        location = fixed;
        return { enviado: true, loja: fixed.nome, endereco: fixed.endereco, tipo: fixed.pinNativo ? "pin no mapa do WhatsApp" : "link do Google Maps", orientacao: "Esta é a loja já informada nesta conversa: a localização sai automaticamente logo depois da sua resposta. Responda curto, sem listar outras unidades e sem repetir o endereço inteiro." };
      }
      // Cascata: lojas listadas nesta sessão (endereço exato) → cadastro do CRM → filiais do ERP.
      const request = await locateStoreRequest([wanted, input.pendingText]);
      if (request.type === "found") {
        location = request.location;
        return { enviado: true, loja: location.nome, endereco: location.endereco, tipo: location.pinNativo ? "pin no mapa do WhatsApp" : "link do Google Maps", orientacao: "A localização sai automaticamente logo depois da sua resposta: responda curto, sem repetir o endereço inteiro e sem dizer que não encontrou a loja." };
      }
      if (request.type === "ambiguous") return { enviado: false, lojasPossiveis: request.options, orientacao: "Há mais de uma unidade real com esse nome: pergunte qual delas listando cada opção com o endereço exatamente como em lojasPossiveis (ex.: \"• *Loja Setor Sul* — Rua 95\")." };
      const directory = wanted ? await storeDirectory() : new Map<string, Parameters<typeof storeLocation>[1]>();
      // "Setor Sul Rua 95": sem casar tudo, tenta só o começo (bairro) e usa a rua para escolher a unidade.
      const words = wanted.split(/\s+/).filter(Boolean);
      let matches: ReturnType<typeof findStores> = [];
      for (let size = words.length; size >= 1 && !matches.length; size -= 1) matches = findStores(directory, words.slice(0, size).join(" "));
      // Filiais no mesmo endereço viram uma; "essa loja" vale a unidade citada nas últimas mensagens da IA.
      const resolved = resolveStoreMatch(matches, { wanted, recentAiTexts: [wanted, ...(input.recentAiTexts ?? [])] });
      if (resolved.type === "found") {
        location = await pinStore(resolved.match.code, resolved.match.store);
        return { enviado: true, loja: location.nome, endereco: location.endereco, tipo: location.pinNativo ? "pin no mapa do WhatsApp" : "link do Google Maps", orientacao: "A localização sai automaticamente logo depois da sua resposta: responda curto, sem repetir o endereço inteiro." };
      }
      if (resolved.type === "ambiguous") return { enviado: false, lojasPossiveis: resolved.options, orientacao: "Há mais de uma unidade real com esse nome: pergunte qual delas listando cada opção com o endereço exatamente como em lojasPossiveis (ex.: \"• *Loja Setor Sul* — Rua 95\")." };
      return { enviado: false, orientacao: "Loja não encontrada no cadastro: pergunte o bairro ou o nome da loja." };
    },
  };
  // Localização pedida: resolvida antes do modelo (sessão → CRM → ERP); ele confirma com as próprias palavras e o
  // pin sai logo depois da resposta. Mais de uma unidade possível: o modelo pergunta qual, pela ferramenta.
  if (storeFollowUp || asksStoreLocation(input.pendingText)) {
    const fixed = await anchoredLocation("").catch(() => null);
    const requested = fixed ?? (asksStoreLocation(input.pendingText) ? await locateStoreRequest([input.pendingText]).then((request) => (request.type === "found" ? request.location : null)).catch(() => null) : null);
    if (requested) {
      location = requested;
      turnFacts.push(`LOCALIZAÇÃO JÁ RESOLVIDA: ${requested.nome} (${requested.endereco}). O ${requested.pinNativo ? "pin no mapa" : "link do Google Maps"} sai automaticamente logo depois da sua resposta: confirme curto, com suas palavras, sem repetir o endereço inteiro e sem dizer que não encontrou a loja.`);
    }
  }
  if (staffRoute) turnFacts.push(`PEDIDO DE PESSOA ESPECÍFICA: o cliente pediu para falar com ${staffRoute.name}. O sistema transfere a conversa para essa pessoa logo depois da sua resposta: confirme isso em uma frase curta e acolhedora, com suas palavras, sem perguntas e sem oferecer produtos (action "reply").`);
  if (documentRoute) turnFacts.push(`DOCUMENTO RECEBIDO: ${documentRoute.kinds.join(" e ")} lido(s). A conversa segue para a equipe${documentRoute.queue ? ` (${documentRoute.queue})` : ""} conferir logo depois da sua resposta: confirme com suas palavras que recebeu e que a equipe vai conferir, sem detalhar graus nem valores e sem perguntas (action "reply").`);
  if (input.isReturningContact && input.aiReplies === 0) turnFacts.push("CLIENTE QUE VOLTOU: ele já conversou ou comprou com a gente antes. Dê as boas-vindas de volta com naturalidade, com suas palavras, sem exagero.");
  const preset = preResult;
  const decision = await aiJson<AgentDecision>(
    [
      { role: "system", content: [system, ...turnFacts].join("\n\n") },
      { role: "user", content: sendParts.length ? [{ type: "text", text: context }, ...sendParts] : context },
    ],
    { ...input.meta, maxTokens: 700, tools: [...filterToolsBySkills([...(photoQuery ? [] : [preset ? { ...stockTool, run: async () => preset } : stockTool, detailsTool]), locationTool, closeTool], skills), ...(await contactFieldTools(input.contactId))] },
  );
  let outcome = interpretDecision(decision);
  // Transferência já decidida (pessoa pelo nome, documento lido): a confirmação é a que o modelo escreveu; a frase
  // padrão só cobre resposta vazia do modelo.
  if (staffRoute || documentRoute) {
    const written = outcome.action === "no_reply" ? "" : outcome.reply.trim();
    const routed: AgentOutcome = staffRoute
      ? { action: "handoff", reply: written || staffConfirmation(input.contactName, staffRoute.name), reason: staffRoute.reason, queue: staffRoute.queue, trigger: "staff", ...(staffRoute.assigneeId ? { assigneeId: staffRoute.assigneeId, assigneeName: staffRoute.assigneeName } : {}), ...(staffRoute.staffQueueId ? { staffQueueId: staffRoute.staffQueueId } : {}) }
      : { action: "handoff", reply: written || documentReply(documentRoute!.kinds), reason: documentRoute!.reason, queue: documentRoute!.queue, trigger: "prescription" };
    return { outcome: routed, media, mediaTriggerSkipped, search, injection, stock, documents };
  }
  // Opções já enviadas: se o modelo copiou a mesma lista de novo, ela sai da resposta (o texto dele fica).
  if (!forceCatalog && !intent.changed && outcome.action === "reply" && listed.length && !asksListAgain(input.pendingText) && repeatsShowcase(outcome.reply, listed)) {
    const kept = splitBubbles(outcome.reply).filter((part) => !repeatsShowcase(part, listed));
    if (kept.length) outcome = { ...outcome, reply: kept.join("\n---SPLIT---\n") };
  }
  // Encerramento: tool encerrarAtendimento ou action "resolved", sempre pela trava fixa (a despedida padrão só cobre
  // o modelo encerrar sem escrever nada).
  const requestedClose = closeReason as string | null;
  if (requestedClose && outcome.trigger === "no_reply") outcome = { action: "resolved", reply: AI_FAREWELL, reason: requestedClose, queue: "", trigger: "ai" };
  const close = aiCloseDecision({ requested: !forceCatalog && (!!requestedClose || outcome.action === "resolved"), enabled: settings.closeWhenResolved, queued: !!input.queued, assigned: false, asksHuman: asksForHuman(settings, input.pendingText), pendingText: input.pendingText });
  if (close.close) outcome = { ...outcome, action: "resolved", reason: requestedClose ?? outcome.reason };
  else if (outcome.action === "resolved") outcome = { ...outcome, action: "reply" };
  // Silêncio só faz sentido diante de um fechamento de cortesia; em outra mensagem, a equipe assume.
  if (outcome.action === "no_reply" && !isCourtesyClosing(input.pendingText.replace(/\n+/g, " "))) outcome = { action: "handoff", reply: "", reason: "A IA não soube responder", queue: "", trigger: "no_reply" };
  // Pergunta informativa ("qual o nome desse modelo?") ou foto de produto: nunca transfere sem o cliente pedir uma
  // pessoa. Vale o texto do modelo; a resposta pela análise da foto só cobre texto vazio ou de transferência.
  const informative = informativeReply(outcome, { pendingText: input.pendingText, askedHuman: asksForHuman(settings, input.pendingText), queued: !!input.queued, photoThisTurn: !!imageAnalysis, analysis });
  if (informative) {
    const own = outcome.reply.trim() && !/transfer|encaminh|atendente|equipe/i.test(outcome.reply) ? outcome.reply : informative;
    outcome = { ...outcome, action: "reply", reply: own, reason: asksProductInfo(input.pendingText) ? "Pergunta informativa sobre o produto" : "Foto de produto respondida", queue: "", trigger: "ai" };
  }
  // Dados do sistema (ficha, opções da vitrine) junto do texto do modelo: comentário dele → dados → pergunta leve
  // dele, se houver. Busca feita pelo código (foto, marca/cidade nova, item escolhido) sempre leva os dados.
  const forcedContent = photoContent ?? preContent;
  if (forcedContent && humanMode !== "route" && !close.close) {
    outcome = { ...outcome, action: "reply", reply: withToolContent(outcome.action === "reply" ? outcome.reply : "", forcedContent), reason: outcome.action === "reply" ? outcome.reason : "Busca de catálogo atualizada", queue: "", trigger: "ai" };
  } else if (outcome.action === "reply" && !close.close && (cardShown || toolShowcase)) {
    outcome = { ...outcome, reply: withToolContent(outcome.reply, (cardShown ?? toolShowcase)!) };
  }
  if (outcome.action === "reply" && !close.close) outcome = { ...outcome, reply: withoutRedundantStoreQuestion(outcome.reply) };
  // O cliente pediu uma pessoa e já houve triagem (ou o assunto é claro): a transferência acontece mesmo se o modelo só respondeu.
  if (humanMode === "route" && outcome.action !== "handoff") outcome = { ...outcome, action: "handoff", reason: outcome.reason === "Sem motivo informado" ? "Cliente pediu para falar com uma pessoa" : outcome.reason, trigger: "keyword" };
  // Vitrine de opções vira catálogo visual: comentário do modelo → 1 foto por modelo (até 4) com legenda limpa (nome,
  // preço, lojas da cidade, sem "Ref.") → o que o modelo escreveu depois da lista. Sem foto, segue em texto limpo.
  let visualCatalog: VisualCatalog | null = null;
  const bubbles = outcome.action === "reply" && !close.close ? splitBubbles(outcome.reply) : [];
  const showcaseAt = bubbles.findIndex((part) => parseShowcase(part).length >= 2);
  if (showcaseAt >= 0) {
    const items = parseShowcase(bubbles[showcaseAt]);
    const lines = bubbles[showcaseAt].split("\n");
    const isItem = (line: string) => /^\s*\d{1,2}[.)]\s/.test(line);
    const firstItem = lines.findIndex(isItem);
    const lastItem = lines.length - 1 - [...lines].reverse().findIndex(isItem);
    const joinText = (parts: string[]) => parts.map((part) => part.trim()).filter(Boolean).join("\n\n");
    const before = joinText([...bubbles.slice(0, showcaseAt), lines.slice(0, firstItem).join("\n")]);
    const after = joinText([lines.slice(lastItem + 1).join("\n"), ...bubbles.slice(showcaseAt + 1)]);
    const key = (value: string | null | undefined) => normalizeTerm(cleanReference(value ?? "") ?? "");
    const ordered: ShowcaseModel[] = items.map((item) => shownModels.find((model) => !!item.referencia && key(model.referencia) === key(item.referencia))
      ?? shownModels.find((model) => normalizeTerm(model.nomeComercial) === normalizeTerm(item.nomeComercial) && (item.preco === null || parseBrl(model.precoVenda ?? "") === item.preco))
      ?? { nomeComercial: item.nomeComercial, referencia: item.referencia, categoriaModelo: null, precoVenda: item.preco ? formatBrl(item.preco) : null, totalDisponivelRede: 0, codigos: item.sku ? [item.sku] : [] });
    if (!ordered.some((model) => model.codigos.some((code) => !!catalogPhotos[code]))) await catalogPhotosFor(ordered);
    visualCatalog = buildVisualCatalog({ models: ordered, images: catalogPhotos, city: catalogState.preferredCity, opening: before, closing: after });
    if (visualCatalog) {
      outcome = { ...outcome, reply: [before, ...visualCatalog.items.map((item) => item.caption), after].filter(Boolean).join("\n---SPLIT---\n") };
      catalogState.lastShownProducts = shownProductsOf(visualCatalog.items.map((item) => ({ ...item, sku: item.sku })));
      interactiveList = null;
    } else {
      // Sem foto cadastrada: a vitrine segue em texto, sem código interno (o modelo já sabia que não havia fotos).
      bubbles[showcaseAt] = withoutShowcaseRefs(bubbles[showcaseAt]);
      outcome = { ...outcome, reply: bubbles.join("\n---SPLIT---\n") };
      catalogState.lastShownProducts = shownProductsOf(items.map((item, position) => ({ index: item.index, sku: item.sku ?? ordered[position].codigos[0] ?? null, ref: item.referencia, name: item.nomeComercial, priceValue: item.preco, stores: ordered[position].lojas ?? [] })));
    }
  }
  // Foto só acompanha resposta ao cliente (não vai junto de transferência).
  const photo = image as ProductImage | null;
  const pin = location as StoreLocation | null;
  // Na fila, a resposta sai mesmo que o modelo marque transferência (não transfere de novo): foto e mapa vão junto.
  const answered = carriesProductExtras(outcome, !!input.queued);
  // Lista interativa só quando a resposta leva a vitrine numerada (2+ itens) ao cliente.
  const list = interactiveList as InteractiveShowcase | null;
  const showsList = !!list && outcome.action === "reply" && !close.close && splitBubbles(outcome.reply).some((part) => parseShowcase(part).length >= 2);
  if (outcome.action === "reply" && currentCatalogFilterHash && parseShowcase(outcome.reply).length) catalogState.lastCatalogFilterHash = currentCatalogFilterHash;
  return { outcome, media, mediaTriggerSkipped, search, injection, stock, humanMode, image: photo && answered && !close.close ? photo : null, details, location: pin && answered && !close.close ? pin : null, close, anchor, catalogContext: catalogState, interactiveList: showsList && !visualCatalog ? list : null, imageAnalysis, singleReply: false, documents, productInterest: productInterest as { name: string; price: number | null } | null, visualCatalog: visualCatalog && outcome.action === "reply" ? visualCatalog : null };
}

/**
 * Campos personalizados do cadastro (ex.: loja_preferida, grau_esferico): a IA grava o que o cliente informou na
 * conversa. Só no WhatsApp (com contato) e quando há campos definidos em Contatos.
 */
async function contactFieldTools(contactId: string | null | undefined) {
  if (!contactId) return [];
  const definitions = await listFieldDefinitions().catch(() => []);
  if (!definitions.length) return [];
  const described = definitions.map((def) => `${def.key} (${def.label}; ${def.type === "select" ? `uma de: ${def.options.join(", ")}` : def.type === "date" ? "data dd/mm/aaaa" : def.type === "number" ? "número" : "texto"})`).join("; ");
  return [{
    definition: {
      type: "function" as const,
      function: {
        name: "atualizarCampoCliente",
        description: `Grava no cadastro do cliente um dado que ELE informou claramente nesta conversa (nunca invente nem deduza). Campos: ${described}.`,
        parameters: {
          type: "object",
          properties: { campo: { type: "string", enum: definitions.map((def) => def.key) }, valor: { type: "string", description: "Valor informado pelo cliente." } },
          required: ["campo", "valor"],
          additionalProperties: false,
        },
      },
    },
    run: async (args: Record<string, unknown>) => {
      const key = String(args.campo ?? "");
      const { rejected } = await setContactFields(contactId, { [key]: String(args.valor ?? "") });
      return rejected.length
        ? { gravado: false, motivo: rejected[0].reason, orientacao: "Não grave de novo; siga a conversa normalmente." }
        : { gravado: true, orientacao: "Dado salvo no cadastro. Não comente isso com o cliente; siga a conversa." };
    },
  }];
}

export async function runAiAgent(input: AgentRunInput): Promise<AgentRun> {
  const run = await runAiAgentInternal(input);
  if (!run.outcome.reply || run.outcome.action === "no_reply") return run;
  // Saudação escrita pelo modelo: só corrige o período errado (ou a saudação repetida); no máximo 1 emoji de
  // expressão na resposta inteira (os repetidos saem, só o 1º fica).
  const reply = singleEmoji(welcomeReply(run.outcome.reply, {
    first: input.aiReplies === 0,
    returning: input.isReturningContact,
    customer: input.contactName,
    pendingText: input.pendingText,
  }));
  // Catálogo visual: abertura e fechamento (do modelo) seguem o texto final; as legendas ficam no meio.
  const parts = reply.split(/\s*---SPLIT---\s*/);
  const visualCatalog = run.visualCatalog && parts.length === run.visualCatalog.items.length + (run.visualCatalog.opening ? 1 : 0) + (run.visualCatalog.closing ? 1 : 0)
    ? { ...run.visualCatalog, opening: run.visualCatalog.opening ? parts[0] : "", closing: run.visualCatalog.closing ? parts[parts.length - 1] : "" }
    : run.visualCatalog;
  return {
    ...run,
    outcome: { ...run.outcome, reply },
    interactiveList: run.interactiveList ? listWithOpening(run.interactiveList, reply) : run.interactiveList,
    visualCatalog,
  };
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

  // Mensagens do cliente desde a última resposta (bot ou atendente), em ordem; mensagens que chegaram enquanto a
  // IA respondia o lote anterior também entram (até onde ela já leu, não até a resposta dela).
  // Atendimento atual: conversa reaberta começa na reabertura; nada da sessão encerrada entra (respostas, fotos, lojas).
  const sessionStart = await sessionStartedAt(conversationId);
  const inSession = sessionStart ? { createdAt: { gt: sessionStart } } : {};
  const lastAnswer = await prisma.chatMessage.findFirst({ where: { conversationId, author: { in: ["bot", "agent"] }, internal: false, ...inSession }, orderBy: { createdAt: "desc" }, select: { createdAt: true, text: true, author: true, authorName: true } });
  const consumed = consumedUntil.get(conversationId);
  const lastOther = consumed ? await prisma.chatMessage.findFirst({ where: { conversationId, internal: false, OR: [{ author: "agent" }, { author: "bot", NOT: { authorName: AI_AUTHOR } }] }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
  const pendingSince = consumed ? (lastOther && lastOther.createdAt > consumed ? lastOther.createdAt : consumed) : lastAnswer?.createdAt ?? sessionStart ?? undefined;
  const pending = await prisma.chatMessage.findMany({ where: { conversationId, author: "customer", ...(pendingSince ? { createdAt: { gt: pendingSince } } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true, text: true, attachment: true, metaMedia: true, createdAt: true } });
  if (!pending.length) return;
  consumedUntil.set(conversationId, pending[pending.length - 1].createdAt);
  // Na espera assistida, o limite de respostas conta só as respostas depois do transbordo.
  const stageStart = queued && since && (!sessionStart || since > sessionStart) ? since : sessionStart;
  const inStage = stageStart ? { createdAt: { gt: stageStart } } : {};
  const aiReplies = await prisma.chatMessage.count({ where: { conversationId, author: "bot", authorName: AI_AUTHOR, ...inStage } });
  // Mensagens anteriores do cliente: insistência em tentativa de manipulação leva para a equipe.
  const earlier = await prisma.chatMessage.findMany({ where: { conversationId, author: "customer", ...(lastAnswer ? { createdAt: { lte: lastAnswer.createdAt, ...(sessionStart ? { gt: sessionStart } : {}) } } : { id: { in: [] } }) }, orderBy: { createdAt: "desc" }, take: 20, select: { text: true } });
  const meta = { feature: "agent", conversationId };
  // Fotos já enviadas: na fila, só as mandadas depois da transferência (perguntar de novo na fila reenvia a foto).
  const photos = await prisma.chatMessage.findMany({ where: { conversationId, author: "bot", authorName: AI_AUTHOR, NOT: { metaMedia: { equals: Prisma.DbNull } }, ...inStage }, orderBy: { createdAt: "desc" }, take: 30, select: { metaMedia: true } });
  const sentImageSkus = photos.map((item) => (item.metaMedia as { productImageSku?: string } | null)?.productImageSku).filter((sku): sku is string => !!sku);

  // Últimas mensagens da IA: "essa loja" resolve para a unidade citada nelas.
  // Mensagens da IA deste atendimento: âncora de produto (ficha + foto) e de loja (endereço citado).
  const aiSession = await prisma.chatMessage.findMany({ where: { conversationId, author: "bot", authorName: AI_AUTHOR, ...inSession }, orderBy: { createdAt: "desc" }, take: 12, select: { text: true, metaMedia: true, attachment: true } });
  const recentAiTexts = aiSession.slice(0, 4).map((item) => item.text ?? "");
  const anchor = extractSessionAnchor(aiSession.slice().reverse().map((item): AnchorMessage => ({
    text: item.text ?? "",
    imageSku: (item.metaMedia as { productImageSku?: string } | null)?.productImageSku ?? null,
    imageUrl: (item.attachment as { url?: string } | null)?.url ?? null,
  })));

  // Nome do contato no cadastro: confirmações de transferência usam ele (nunca o nome citado pelo cliente).
  const contactRow = await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true, city: true, store: true } }).catch(() => null);
  const contactName = contactRow?.name ?? null;
  // Cidade conhecida: cadastro do contato; senão, a cidade da loja da última compra (VMSet).
  const knownCity = contactRow?.city?.trim()
    || (contactRow?.store ? (await prisma.store.findFirst({ where: { name: { contains: contactRow.store, mode: "insensitive" } }, select: { city: true } }).catch(() => null))?.city : null)
    || null;
  // aiContext.lastAnalyzedImage: análise da última foto de produto deste atendimento (guardada na mensagem da foto).
  const analyzed = await prisma.chatMessage.findMany({ where: { conversationId, author: "customer", NOT: { metaMedia: { equals: Prisma.DbNull } }, ...inSession }, orderBy: { createdAt: "desc" }, take: 20, select: { metaMedia: true } }).catch(() => []);
  const lastAnalyzedImage = sanitizeImageAnalysis(analyzed.map((item) => (item.metaMedia as { analysis?: unknown } | null)?.analysis).find(Boolean));
  const catalogContext = sanitizeCatalogContext(analyzed.map((item) => (item.metaMedia as { aiContext?: unknown } | null)?.aiContext).find(Boolean));

  const [linkedCpf, hasPendingFinancial] = await Promise.all([linkedCpfForPhone(conversation.phone).catch(() => null), pendingApproval(conversationId).then(Boolean).catch(() => false)]);
  let run: AgentRun;
  try {
    const previousConversation = aiReplies === 0 ? await prisma.chatConversation.findFirst({
      where: { contactId: conversation.contactId, id: { not: conversation.id }, closedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
      select: { id: true },
    }) : null;
    // "digitando..." no WhatsApp do cliente antes de mídia, estoque e modelo (renova uma vez após 20 s).
    run = await withTyping(() => sendTypingIndicator(latest.externalId), () => runAiAgent({
      settings,
      // Figurinha sozinha vale como reação ("👍"): depois da despedida, o protocolo de silêncio se aplica.
      pendingText: pending.map((item) => item.text || (mediaKind(item) === "sticker" ? "👍" : "")).join("\n"),
      // Mídia que a IA precisa ler (áudio, vídeo, documento); foto e figurinha não contam.
      hasMedia: pending.some((item) => hasMediaPayload(item) && mediaKind(item) !== "image" && mediaKind(item) !== "sticker"),
      aiReplies,
      meta,
      loadMedia: () => customerMedia(pending, meta),
      earlierCustomerTexts: earlier.map((item) => item.text),
      contactId: conversation.contactId,
      buildContext: async () => (await conversationContext(conversation, { includeHistory: settings.useCustomerOrders, sessionOnly: true })).text,
      queued,
      lastAiText: lastAnswer?.author === "bot" && lastAnswer.authorName === AI_AUTHOR ? lastAnswer.text : null,
      recentAiTexts,
      sentImageSkus,
      anchor,
      listedProducts: extractListedProducts(aiSession.slice().reverse().map((item) => item.text ?? "")),
      selectedProductRef: pending.map((item) => (item.metaMedia as { selectedProductRef?: string } | null)?.selectedProductRef).filter(Boolean).at(-1) ?? null,
      lastAnalyzedImage,
      catalogContext,
      contactName,
      knownCity,
      isReturningContact: !!previousConversation,
      // Parcelas: CPF só quando o telefone leva a um único cadastro do VMSet; aprovação pendente evita nova consulta.
      linkedCpf,
      hasPendingFinancial,
    }));
  } catch (error) {
    // Já na fila: a equipe vai atender de qualquer forma, sem transferir de novo.
    if (queued) { console.warn(`[ai] ${conversationId}: espera assistida sem resposta (${error instanceof Error ? error.message : error})`); return; }
    // IA fora do ar: ninguém fica sem resposta, a conversa vai para a equipe.
    return handoff(conversation, settings, error instanceof AiError ? `IA indisponível (${error.message})` : "IA indisponível");
  }
  const { outcome } = run;
  // Parcelas/crediário: o resultado do VMSet fica pendente no /chat; o cliente recebe só o aviso de aguardo.
  if (run.financialApproval) {
    try {
      await createFinancialApproval(conversationId, run.financialApproval);
    } catch (error) {
      console.warn(`[ai] ${conversationId}: aprovação financeira não gravada`, error);
      return handoff(conversation, settings, "Consulta de parcelas: não foi possível preparar a aprovação do operador");
    }
  }
  // Guarda a análise da foto na mensagem dela (a próxima pergunta "qual o nome desse modelo?" usa este dado).
  const photoMessage = run.imageAnalysis ? pending.filter((item) => mediaKind(item) === "image").at(-1) : undefined;
  if (photoMessage && run.imageAnalysis) {
    const current = (photoMessage.metaMedia ?? {}) as Record<string, unknown>;
    await prisma.chatMessage.update({ where: { id: photoMessage.id }, data: { metaMedia: { ...current, analysis: run.imageAnalysis } as unknown as Prisma.InputJsonValue } }).catch((error) => console.warn(`[ai] ${conversationId}: análise da foto não salva`, error));
  }
  if (run.catalogContext && JSON.stringify(run.catalogContext) !== JSON.stringify(catalogContext)) {
    const target = pending[pending.length - 1];
    const current = await prisma.chatMessage.findUniqueOrThrow({ where: { id: target.id }, select: { metaMedia: true } });
    const metadata = current.metaMedia && typeof current.metaMedia === "object" && !Array.isArray(current.metaMedia) ? current.metaMedia : {};
    await prisma.chatMessage.update({ where: { id: target.id }, data: { metaMedia: { ...metadata, aiContext: run.catalogContext } } });
  }
  // Receita lida (foto ou PDF): vai para o receituário do cliente, uma por mensagem (a nota do transbordo continua).
  await saveReadPrescriptions(run.documents, { contactId: conversation.contactId, conversationId });
  // Funil de vendas: receita, modelo consultado, orçamento ou loja para comprar criam/avançam a oportunidade do contato.
  if (skillEnabled(await loadSkills(), "pipeline_automatico")) await recordSalesEvents({ contactId: conversation.contactId, conversationId, events: turnSalesEvents(run, pending.map((item) => item.text ?? "").join("\n")) });
  // Encerramento silencioso: nada é enviado e a conversa não é transferida.
  if (outcome.action === "no_reply") { console.log(`[ai] ${conversationId}: sem resposta (${outcome.reason})`); return; }
  if (queued) return replyWhileQueued(conversationId, outcome, run.image, latest.externalId, run.location, run.interactiveList, run.singleReply, run.visualCatalog);
  if (outcome.trigger === "catalog_miss" || outcome.trigger === "prescription") {
    // A própria resposta já avisa que vai encaminhar: sem a mensagem de transferência repetida.
    if (isWindowOpen(conversation.lastInboundAt)) await sendAiReply(conversation, outcome.reply, null, latest.externalId);
    // Receita/comprovante: fila comercial (ou financeiro) quando a IA escolhe a fila; o resumo vai na nota interna.
    return handoff(conversation, settings, outcome.reason, outcome.queue || undefined, false);
  }
  // Pessoa pedida pelo nome: confirmação → fila dela → atribuição direta (se ela puder receber agora).
  if (outcome.trigger === "staff") return handoffToStaff(conversation, settings, outcome, latest.externalId);
  if (outcome.trigger !== "ai") return handoff(conversation, settings, outcome.reason);

  // Pode ter sido assumida enquanto a IA pensava.
  const fresh = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!fresh || (await conversationMode(fresh)).mode === "paused") return;

  if (outcome.action === "handoff") {
    // Sem fluxo de transbordo ativo, a resposta da IA é o aviso; com fluxo, o aviso é o do fluxo (/automacoes).
    const replied = !!outcome.reply && !(await hasActiveHandoffFlow().catch(() => false));
    if (replied) await sendAiReply(fresh, outcome.reply, null, latest.externalId);
    return handoff(fresh, settings, outcome.reason, outcome.queue, !replied);
  }
  // Encerramento pela IA (só atendimento exclusivo dela): despedida → encerramento oficial → pesquisa de satisfação,
  // a mesma sequência do botão "Encerrar" do /chat.
  if (outcome.action === "resolved" && run.close?.close && !fresh.assigneeId && !fresh.closedAt) {
    const steps = await runAiClose(outcome.reply, {
      sendFarewell: (text) => sendAiReply(fresh, text, null, latest.externalId),
      close: async () => {
        try {
          await closeConversation(fresh, null, `Atendimento encerrado pela IA: ${outcome.reason}`, "");
          return true;
        } catch (error) {
          if (error instanceof ChatRuleError) return false;
          throw error;
        }
      },
      survey: () => sendSatisfactionSurvey(fresh, null),
    });
    console.log(`[ai] ${conversationId}: encerramento pela IA (${steps.join(" → ")})`);
    return;
  }
  await sendAiReply(fresh, outcome.reply, run.image, latest.externalId, run.location, run.interactiveList, run.singleReply, run.visualCatalog);
}

/**
 * Espera assistida: responde sem transferir de novo (a conversa já está na fila). Transbordo pedido pelo modelo
 * vira só a resposta; gatilhos sem resposta (mídia, limite) ficam em silêncio para a equipe ver.
 * Confere de novo antes de enviar: se um atendente assumiu ou escreveu enquanto a IA pensava, não responde.
 */
/** Resposta da IA ao cliente: com foto do produto (legenda) quando houver; se a foto falhar, segue em texto. */
async function sendAiReply(conversation: ChatConversation, text: string, image?: ProductImage | null, typingMessageId?: string | null, location?: StoreLocation | null, list?: InteractiveShowcase | null, singleReply?: boolean, catalog?: VisualCatalog | null) {
  if (catalog?.items.length) {
    const sent = await sendVisualCatalog(conversation, catalog, typingMessageId);
    if (location) await sendStoreLocation(conversation, location);
    return sent;
  }
  if (list) {
    const sent = await sendAutomaticMessage(conversation, text, () => sendWhatsAppInteractiveList(conversation.phone, list).catch((error) => {
      console.warn(`[ai] ${conversation.id}: lista interativa recusada, enviando em texto (${error instanceof Error ? error.message : error})`);
      return sendText(conversation.phone, text.replace(/\s*---SPLIT---\s*/gi, "\n\n"));
    }), toChatInteractive(list), AI_AUTHOR);
    if (location) await sendStoreLocation(conversation, location);
    return sent;
  }
  if (singleReply) {
    const sent = image
      ? await sendAutomaticImage(conversation, image.url, text, AI_AUTHOR, () => invalidateProductImage(image.sku), image.sku)
      : await sendAutomaticMessage(conversation, text, undefined, undefined, AI_AUTHOR);
    if (location) await sendStoreLocation(conversation, location);
    return sent;
  }
  // Vitrine numerada: sai como Lista Interativa nativa; se a Meta recusar, a mesma lista em texto (o histórico guarda o texto).
  const sendText_ = (part: string) => (list && parseShowcase(part).length >= 2
    ? sendAutomaticMessage(conversation, part, () => sendWhatsAppInteractiveList(conversation.phone, list).catch((error) => {
      console.warn(`[ai] ${conversation.id}: lista interativa recusada, enviando em texto (${error instanceof Error ? error.message : error})`);
      return sendText(conversation.phone, part);
    }), toChatInteractive(list), AI_AUTHOR)
    : sendAutomaticMessage(conversation, part, undefined, undefined, AI_AUTHOR));
  // Bolhas separadas por ---SPLIT---: a 1ª pode ser foto com legenda; as seguintes saem em texto, com "digitando..." e pausa curta.
  // Cadência configurada em /ia › Mensagens picadas (desligado: tudo numa mensagem só).
  const cadence = await readAiSettings();
  const parts = cadence.splitReplies ? splitBubbles(text, cadence.maxBubbles) : [joinBubbles(text)].filter(Boolean);
  const sent = await sendBubbles(parts, {
    sendFirst: (part) => (image ? sendAutomaticImage(conversation, image.url, part, AI_AUTHOR, () => invalidateProductImage(image.sku), image.sku) : sendText_(part)),
    sendNext: (part) => sendText_(part),
    typing: () => sendTypingIndicator(typingMessageId),
    delay: (next) => bubbleDelayFor(cadence, next),
  });
  if (location) await sendStoreLocation(conversation, location);
  return sent;
}

/** Localização da loja logo depois da resposta: pin nativo (coordenadas) ou link do Google Maps com o endereço. */
async function sendStoreLocation(conversation: ChatConversation, location: StoreLocation) {
  const text = locationText(location);
  return deliverLocation(location, {
    sendPin: async () => {
      const message = await sendAutomaticMessage(conversation, text, () => sendLocation(conversation.phone, { latitude: location.latitude!, longitude: location.longitude!, name: location.nome, address: location.endereco }), undefined, AI_AUTHOR);
      if (message?.delivery === "failed") throw new Error("pin recusado");
    },
    sendText: (body) => sendAutomaticMessage(conversation, body, undefined, undefined, AI_AUTHOR),
  }).catch((error) => console.warn(`[ai] ${conversation.id}: localização não enviada (${error instanceof Error ? error.message : error})`));
}

async function replyWhileQueued(conversationId: string, outcome: AgentOutcome, image?: ProductImage | null, typingMessageId?: string | null, location?: StoreLocation | null, list?: InteractiveShowcase | null, singleReply?: boolean, catalog?: VisualCatalog | null) {
  const fresh = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
  if (!fresh || (await conversationMode(fresh)).mode !== "queued") return;
  if (!outcome.reply || !isWindowOpen(fresh.lastInboundAt)) return;
  await sendAiReply(fresh, outcome.reply, image, typingMessageId, location, list, singleReply, catalog);
}

/** Espaço entre as fotos do catálogo: preserva a ordem exata no WhatsApp do cliente. */
const CATALOG_PHOTO_GAP_MS = 500;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Catálogo visual: abertura curta → 1 foto por modelo com legenda limpa (em ordem) → pergunta de escolha. */
async function sendVisualCatalog(conversation: ChatConversation, catalog: VisualCatalog, typingMessageId?: string | null) {
  let sent = catalog.opening.trim() ? await sendAutomaticMessage(conversation, catalog.opening, undefined, undefined, AI_AUTHOR) : null;
  for (const [position, item] of catalog.items.entries()) {
    if (position > 0 || sent) await wait(CATALOG_PHOTO_GAP_MS);
    // Foto recusada (URL quebrada/Meta): a legenda sai em texto e a foto é marcada inválida no cache.
    sent = (await sendAutomaticImage(conversation, item.imageUrl, item.caption, AI_AUTHOR, () => invalidateProductImage(item.sku), item.sku)) ?? sent;
  }
  await sendTypingIndicator(typingMessageId).catch(() => undefined);
  await wait(CATALOG_PHOTO_GAP_MS);
  if (catalog.closing.trim()) sent = await sendAutomaticMessage(conversation, catalog.closing, undefined, undefined, AI_AUTHOR);
  return sent;
}

/** imageSku: foto de produto que acompanhou esta resposta (o teste não reenvia a mesma foto). */
export type PlaygroundMessage = { from: "customer" | "ai"; text: string; imageSku?: string; imageUrl?: string; catalogContext?: CatalogContext; /** Item tocado na lista interativa simulada. */ selectedProductRef?: string; /** Análise da foto de produto desta mensagem do cliente (como no metaMedia do WhatsApp). */ imageAnalysis?: ImageAnalysis };
/** queued: simula o cliente já na fila (espera assistida), com o mesmo pipeline de produto. sessionId: sessão de teste (nova a cada "Limpar"). */
export type PlaygroundOptions = { profile?: SimulatedProfileId; ignoreMediaTrigger?: boolean; queued?: boolean; sessionId?: string; /** Nome do contato simulado (ex.: "Vivi"); sem ele, o do perfil. */ contactName?: string; /** Cidade do cadastro simulado (sem ela, a IA pergunta antes de listar produtos). */ knownCity?: string };
export type PlaygroundResult = AgentOutcome & {
  /** O que o cliente receberia no WhatsApp (resposta e/ou mensagem de transferência). */
  messages: string[];
  /** Eventos que criariam/avançariam a oportunidade no funil de vendas (WhatsApp). */
  salesEvents?: SalesEvent[];
  /** Passo do fluxo de parcelas e o card de aprovação que iria para o operador. */
  financial?: PlaygroundFinancial;
  /** Fila para onde a conversa iria na transferência. */
  handoffQueue: string;
  /** Como a fila foi definida: escolha da IA validada, fila padrão (fallback), fixa ou a atual. */
  handoffQueueSource?: QueueSource;
  /** Pessoa pedida pelo nome a quem a conversa seria atribuída direto. */
  assignee?: string;
  /** A IA fez a pergunta de triagem do setor em vez de transferir. */
  triage?: boolean;
  /** Encerraria a conversa (resolvido com a opção ligada). */
  wouldClose: boolean;
  /** A IA quis encerrar, mas a trava fixa impediu (motivo). */
  closeBlocked?: string;
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
  image?: { url: string; source: "cache" | "web"; query: string; sku: string };
  /** Fichas de produto consultadas (web ou cache) e cores com saldo. */
  details?: DetailsLog[];
  /** Localização que sairia logo depois da resposta (pin ou link do Google Maps). */
  location?: StoreLocation;
  /** Receitas/comprovantes lidos antes do transbordo (resumo que vai na nota do atendente). */
  documents?: ReadDocument[];
  /** Lista interativa que o WhatsApp mostraria no lugar da vitrine em texto. */
  interactiveList?: InteractiveShowcase;
  /** Sessão de teste que gerou esta resposta (a tela descarta respostas de uma sessão já limpa). */
  sessionId?: string;
  /** Produto e loja fixados nesta sessão de teste. */
  anchor?: SessionAnchor;
  /** Análise da foto enviada nesta mensagem (a tela guarda na mensagem do cliente e reenvia, como no WhatsApp). */
  imageAnalysis?: ImageAnalysis;
  catalogContext?: CatalogContext;
  /** Catálogo com fotos como chega no WhatsApp: messages = abertura, 1 legenda por foto (na ordem) e a pergunta. */
  visualCatalog?: VisualCatalog;
};

/**
 * Teste da página /ia: mesmo motor (runAiAgent) e mesmo formato de contexto do WhatsApp, com os parâmetros
 * da tela (mesmo ainda não salvos) e um cliente fictício (novo ou recorrente com pedidos no ERP).
 * Não envia nada ao cliente. O anexo (opcional) pertence à última mensagem do cliente.
 */
export async function simulateAgent(settings: AiSettings, messages: PlaygroundMessage[], userId: string, attachment?: AiMediaInput, options: PlaygroundOptions = {}): Promise<PlaygroundResult> {
  const meta = { feature: "playground", userId, settings };
  const profile = SIMULATED_PROFILES.find((item) => item.id === options.profile) ?? SIMULATED_PROFILES[0];
  const contactName = options.contactName?.trim() || profile.name;
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
    earlierCustomerTexts: messages.slice(0, lastAi + 1).filter((message) => message.from === "customer").map((message) => message.text).reverse(),
    lastAiText: lastAi >= 0 ? messages[lastAi].text : null,
    recentAiTexts: messages.filter((message) => message.from === "ai").slice(-4).reverse().map((message) => message.text),
    sentImageSkus: messages.map((message) => message.imageSku).filter((sku): sku is string => !!sku),
    // Âncora só das mensagens desta sessão de teste (o "Limpar" começa outra, vazia).
    anchor: extractSessionAnchor(messages.filter((message) => message.from === "ai").map((message) => ({ text: message.text, imageSku: message.imageSku ?? null, imageUrl: message.imageUrl ?? null }))),
    listedProducts: extractListedProducts(messages.filter((message) => message.from === "ai").map((message) => message.text)),
    selectedProductRef: messages.slice(lastAi + 1).map((message) => message.selectedProductRef).filter(Boolean).at(-1) ?? null,
    lastAnalyzedImage: messages.map((message) => message.imageAnalysis).filter((item): item is ImageAnalysis => !!item).at(-1) ?? null,
    catalogContext: messages.map((message) => message.catalogContext).filter((item): item is CatalogContext => !!item).at(-1),
    contactName,
    knownCity: options.knownCity ?? null,
    isReturningContact: profile.id === "recorrente",
    queued: options.queued ? { queueName: "Vendas" } : null,
    // Mesmas regras do WhatsApp: falha de leitura vira aviso ao cliente (não erro na tela).
    loadMedia: async () => (attachment ? [await prepareMediaSafe(attachment, meta)] : []),
    buildContext: (media) => {
      const history = media ? attachSummary(messages, media.summary) : messages;
      // Mesmo formato de linha do WhatsApp (IA aparece como "Robô"), um minuto entre mensagens.
      const conversation = history
        .map((message, index) => transcriptLine({ author: message.from === "customer" ? "customer" : "bot", authorName: message.from === "ai" ? AI_AUTHOR : null, text: message.text, internal: false, attachment: null, createdAt: new Date(now - (history.length - index) * 60_000) }))
        .filter(Boolean)
        .join("\n");
      return formatContext({ contactName, queueName: null, subject: "", includeHistory: settings.useCustomerOrders, history: simulatedHistory(profile.id), conversation });
    },
  });

  const { outcome, media } = run;
  const target = outcome.action === "handoff" ? await handoffQueue(settings, null, outcome.queue, outcome.staffQueueId) : null;
  return {
    ...outcome,
    messages: run.visualCatalog ? [run.visualCatalog.opening, ...run.visualCatalog.items.map((item) => item.caption), run.visualCatalog.closing].filter(Boolean)
      : run.interactiveList || run.singleReply ? [withoutSplitMarkers(outcome.reply)] : customerMessages(outcome, settings, { customer: contactName, queue: target?.name }),
    visualCatalog: run.visualCatalog ?? undefined,
    assignee: outcome.assigneeName,
    handoffQueue: target?.name ?? "",
    handoffQueueSource: target?.source,
    triage: run.humanMode === "triage" || undefined,
    wouldClose: outcome.action === "resolved" && !!run.close?.close,
    closeBlocked: run.close && !run.close.close && run.close.blocked ? CLOSE_BLOCK_LABELS[run.close.blocked] : undefined,
    media: media ? { kind: media.kind, summary: media.summary, ...(media.transcript !== undefined ? { transcript: media.transcript } : {}) } : undefined,
    mediaHandoff: run.mediaTriggerSkipped || undefined,
    search: run.search ?? undefined,
    injection: run.injection.risk === "none" ? undefined : run.injection,
    stock: run.stock?.length ? run.stock : undefined,
    image: run.image ? { url: run.image.url, source: run.image.source, query: run.image.query, sku: run.image.sku } : undefined,
    details: run.details?.length ? run.details : undefined,
    location: run.location ?? undefined,
    documents: run.documents?.length ? run.documents : undefined,
    interactiveList: run.interactiveList ?? undefined,
    sessionId: options.sessionId,
    anchor: run.anchor,
    imageAnalysis: run.imageAnalysis ?? undefined,
    catalogContext: run.catalogContext,
    // Simulação: mostra o que iria para o funil de vendas (o teste não grava no pipeline).
    salesEvents: await (async () => { const events = skillEnabled(await loadSkills(), "pipeline_automatico") ? turnSalesEvents(run, pendingText) : []; return events.length ? events : undefined; })(),
    // Parcelas: o teste mostra o card que o operador veria no /chat (o CPF completo nunca sai do servidor).
    financial: run.financialLog ? { ...run.financialLog, ...(run.financialApproval ? { approval: { customerNameVmset: run.financialApproval.customerNameVmset, customerCpfMasked: run.financialApproval.customerCpfMasked, installmentsSummary: run.financialApproval.installmentsSummary, draftMessage: run.financialApproval.draftMessage, transcribedText: run.financialApproval.transcribedText, nameMatches: run.financialApproval.nameMatches } } : {}) } : undefined,
  };
}
