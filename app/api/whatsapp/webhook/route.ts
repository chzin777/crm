import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutomation } from "@/lib/chat/automation";
import { notifyChatChange } from "@/lib/chat/events";
import { isCustomerMessage, recordEcho, recordInbound, type MetaInboundMessage } from "@/lib/chat/inbound";
import { phoneVariants } from "@/lib/chat/phone";
import { markBulkItemFailed } from "@/lib/bulk-dispatch";
import { detectOptOutCommand, OPT_IN_REPLY, OPT_OUT_REPLY, type OptOutCommand } from "@/lib/marketing-opt-out";
import { applyOptOutCommand } from "@/lib/marketing-opt-out-db";
import { sendAutomaticMessage } from "@/lib/chat/outbound";
import { reportError } from "@/lib/monitoring/error-reporter";
import { emitInboundMessageById } from "@/lib/automations/engine-db";
import { syncCampaignTemplateStatus } from "@/lib/campaigns";
import { addEngagement, clearInvalidWhatsApp, ENGAGEMENT_POINTS, INVALID_NUMBER_CODES, markInvalidWhatsApp } from "@/lib/engagement";
import { distributeWaiting } from "@/lib/chat/distribution";
import { withMetaCode } from "@/lib/chat/meta-failure";
import { confirmPhoneFallback, tryPhoneFallback, withLateMessage } from "@/lib/chat/phone-fallback";

/** Descadastro/reativação de campanhas pedido pelo próprio cliente. */
async function handleOptOutCommand(conversationId: string, phone: string, command: OptOutCommand, text: string) {
  const updated = await applyOptOutCommand(phone, command, `WhatsApp: "${text.trim().slice(0, 60)}"`);
  console.log(`[whatsapp/webhook] ${command === "opt_out" ? "opt-out" : "reativação"} de campanhas para ${phone} (${updated} cadastro(s))`);
  await sendAutomaticMessage({ id: conversationId, phone }, command === "opt_out" ? OPT_OUT_REPLY : OPT_IN_REPLY);
  return true;
}

// Verificação do webhook (a Meta chama via GET ao cadastrar a URL).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === expected) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(body: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(header.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type StatusEvent = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

type InboundMessageEvent = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  audio?: { transcript?: string };
  document?: { caption?: string };
};

const statusRank = { queued: 0, sent: 1, delivered: 2, read: 3, replied: 4 } as const;

const chatDeliveryBefore = { sent: ["sending"], delivered: ["sending", "sent"], read: ["sending", "sent", "delivered"] } as const;

// Tiques do atendimento: mesma regra de não regredir, por externalId.
async function updateChatDelivery(event: StatusEvent) {
  if (!event.id) return;
  if (event.status === "failed") {
    const error = event.errors?.[0];
    const externalId = event.id;
    // Código junto do motivo ("(#131026) Message Undeliverable."): a bolha traduz e o relógio reconhece o 131000.
    const markFailed = () => prisma.chatMessage.updateMany({
      where: { externalId, delivery: { not: "read" } },
      data: { delivery: "failed", failureReason: withMetaCode(error?.code, error?.error_data?.details ?? error?.title ?? error?.message ?? "Falha informada pela Meta").slice(0, 500) },
    });
    // A falha pode chegar antes de o envio gravar o wamid: espera até 1,5 s pela mensagem antes de desistir.
    await withLateMessage(externalId, markFailed);
    // 131026/131047: uma nova tentativa no mesmo celular com/sem o 9º dígito.
    await tryPhoneFallback(event.id, error?.code).catch((failure) => console.error("[whatsapp/webhook] reenvio com/sem o 9:", failure));
  } else if (event.status === "sent" || event.status === "delivered" || event.status === "read") {
    await prisma.chatMessage.updateMany({
      where: { externalId: event.id, delivery: { in: [...chatDeliveryBefore[event.status]] } },
      data: { delivery: event.status },
    });
    // Entregue pela variante do 9º dígito: conversa e cadastro passam a usar esse número.
    if (event.status !== "sent") await confirmPhoneFallback(event.id).catch((failure) => console.error("[whatsapp/webhook] confirmar número:", failure));
    // Métrica "entregue" dos nós Enviar WhatsApp das automações.
    if (event.status !== "sent") await prisma.automationMessageTouch.updateMany({ where: { externalId: event.id, deliveredAt: null }, data: { deliveredAt: new Date() } });
  } else {
    return;
  }
  const message = await prisma.chatMessage.findUnique({ where: { externalId: event.id }, select: { conversationId: true } });
  if (message) await prisma.chatConversation.update({ where: { id: message.conversationId }, data: { updatedAt: new Date() } });
}

// Atualiza o registro da mensagem da campanha; nunca retrocede o status (ex.: read não volta para delivered).
async function updateMessageStatus(event: StatusEvent) {
  await updateChatDelivery(event).catch((failure) => console.error("[whatsapp/webhook] atualizar entrega do chat:", failure));
  // Número sem WhatsApp (campanha, envio em massa ou chat): sai dos próximos disparos pagos.
  const failure = event.status === "failed" ? event.errors?.[0] : undefined;
  if (failure?.code && INVALID_NUMBER_CODES.has(failure.code) && event.recipient_id) {
    await markInvalidWhatsApp(event.recipient_id, `${failure.code}: ${failure.error_data?.details ?? failure.title ?? failure.message ?? "número indisponível"}`)
      .catch((error) => console.error("[whatsapp/webhook] marcar número inválido:", error));
  }
  if (!event.id || !event.status) return;
  const message = await prisma.campaignMessage.findUnique({ where: { whatsappMsgId: event.id }, select: { id: true, status: true, campaignId: true, contactId: true, phone: true } });
  if (!message) return;
  const at = event.timestamp ? new Date(Number(event.timestamp) * 1000) : new Date();
  if (event.status === "failed") {
    const error = event.errors?.[0];
    const reason = `${error?.code ? `${error.code}: ` : ""}${error?.error_data?.details ?? error?.title ?? error?.message ?? "Falha informada pela Meta"}`.slice(0, 500);
    await prisma.campaignMessage.update({ where: { id: message.id }, data: { status: "failed", failedAt: at, failureReason: reason } });
    // Lotes e envios individuais: a falha que chega depois também aparece em /campanhas.
    await markBulkItemFailed(message.campaignId, { contactId: message.contactId, phone: message.phone }, reason).catch((failure) => console.error("[whatsapp/webhook] atualizar lote:", failure));
    return;
  }
  if (event.status !== "sent" && event.status !== "delivered" && event.status !== "read") return;
  if (message.status !== "failed" && statusRank[message.status as keyof typeof statusRank] >= statusRank[event.status]) return;
  await prisma.campaignMessage.update({
    where: { id: message.id },
    data: { status: event.status, ...(event.status === "sent" ? { sentAt: at } : event.status === "delivered" ? { deliveredAt: at } : { readAt: at }) },
  });
  // Score de engajamento: leitura da campanha (o status nunca retrocede, então conta uma vez por envio).
  if (event.status === "read") await addEngagement(message.contactId, ENGAGEMENT_POINTS.read);
}

// Salva a mensagem recebida; a resposta à campanha é registrada em recordInbound.
async function handleInboundMessage(msg: InboundMessageEvent) {
  if (!msg.id || !msg.from) return;
  const receivedAt = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();
  const text = msg.text?.body ?? msg.image?.caption ?? msg.video?.caption ?? msg.audio?.transcript ?? msg.document?.caption ?? null;
  const mediaType = msg.type === "text" ? null : msg.type ?? null;

  const contact = await prisma.contact.findFirst({
    where: { phone: { in: phoneVariants(msg.from) } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  // Salva mensagem recebida
  await prisma.inboundMessage.upsert({
    where: { whatsappMsgId: msg.id },
    create: { whatsappMsgId: msg.id, contactId: contact?.id ?? null, phone: msg.from, text, mediaType, receivedAt },
    update: { text, mediaType, receivedAt },
  });

  console.log(`[whatsapp/webhook] inbound de ${msg.from} (${msg.id})${contact ? ` → contato ${contact.id}` : " → sem contato"}`);
  // Quem escreve tem WhatsApp: desfaz uma marcação antiga de número inválido.
  await clearInvalidWhatsApp(msg.from).catch((error) => console.error("[whatsapp/webhook] limpar número inválido:", error));
}

// Registra o status de entrega (sent/delivered/read/failed) e o motivo das falhas nos logs.
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.META_APP_SECRET;
  // Sem 200 a Meta reenvia o evento: nada se perde enquanto a chave não estiver certa.
  if (!secret) {
    console.error("[whatsapp/webhook] evento recusado: META_APP_SECRET não está configurado no .env do servidor.");
    return new Response("Webhook not configured", { status: 503 });
  }
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    console.error(`[whatsapp/webhook] assinatura inválida (${raw.length} bytes): confira se META_APP_SECRET é a chave secreta do app desta conta na Meta.`);
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const payload = JSON.parse(raw) as {
      entry?: { changes?: { field?: string; value?: {
        statuses?: StatusEvent[];
        messages?: (InboundMessageEvent & MetaInboundMessage)[];
        message_echoes?: (MetaInboundMessage & { to?: string })[];
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        event?: string;
        message_template_id?: string;
        message_template_name?: string;
        message_template_language?: string;
        reason?: string;
      } }[] }[];
    };
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const profiles = change.value?.contacts ?? [];
        console.log(`[whatsapp/webhook] evento ${change.field ?? "?"}: ${change.value?.messages?.length ?? 0} mensagem(ns), ${change.value?.statuses?.length ?? 0} status`);
        if (change.field === "message_template_status_update" && change.value?.event) {
          try {
            await syncCampaignTemplateStatus({
              id: change.value.message_template_id ?? "",
              name: change.value.message_template_name ?? "",
              language: change.value.message_template_language ?? "",
              status: change.value.event,
              rejectedReason: change.value.reason,
            });
          } catch (failure) {
            console.error("[whatsapp/webhook] atualizar aprovação do template:", failure);
            return new Response("Falha ao atualizar aprovação do template", { status: 500 });
          }
          console.log(`[whatsapp/webhook] template ${change.value.message_template_name ?? change.value.message_template_id}: ${change.value.event}${change.value.reason ? ` — ${change.value.reason}` : ""}`);
          continue;
        }
        for (const echo of change.value?.message_echoes ?? []) {
          let conversationId;
          try {
            conversationId = await recordEcho(echo);
          } catch (failure) {
            console.error("[whatsapp/webhook] gravar mensagem enviada pelo aparelho:", failure);
            return new Response("Falha ao gravar", { status: 500 });
          }
          console.log(conversationId ? `[whatsapp/webhook] mensagem do aparelho ${echo.id} gravada na conversa ${conversationId}` : `[whatsapp/webhook] mensagem do aparelho ${echo.id} ignorada (repetida ou tipo ${echo.type ?? "?"})`);
          if (conversationId) notifyChatChange();
        }
        for (const status of change.value?.statuses ?? []) {
          await updateMessageStatus(status).catch((failure) => console.error("[whatsapp/webhook] atualizar status:", failure));
          notifyChatChange();
          const error = status.errors?.[0];
          console.log(
            `[whatsapp/webhook] ${status.status} para ${status.recipient_id} (${status.id})` +
              (error ? ` — erro ${error.code}: ${error.title ?? error.message}${error.error_data?.details ? ` | ${error.error_data.details}` : ""}` : ""),
          );
        }
        for (const msg of change.value?.messages ?? []) {
          if (!isCustomerMessage(msg.type)) {
            console.log(`[whatsapp/webhook] evento de protocolo ${msg.type ?? "sem tipo"} de ${msg.from} ignorado (${msg.id})`);
            continue;
          }
          await handleInboundMessage(msg).catch((failure) => console.error("[whatsapp/webhook] processar inbound:", failure));
          const profile = profiles.find((item) => item.wa_id === msg.from)?.profile?.name ?? profiles[0]?.profile?.name;
          let recorded;
          try {
            recorded = await recordInbound(msg, profile);
          } catch (failure) {
            // Sem a conversa gravada, a mensagem se perderia: 500 faz a Meta reenviar o evento.
            console.error("[whatsapp/webhook] gravar conversa:", failure);
            void reportError("whatsapp.webhook", failure, { messageId: msg.id });
            return new Response("Falha ao gravar", { status: 500 });
          }
          console.log(recorded ? `[whatsapp/webhook] mensagem ${msg.id} gravada na conversa ${recorded.conversationId}` : `[whatsapp/webhook] mensagem ${msg.id} ignorada (repetida ou reação)`);
          if (recorded) {
            notifyChatChange();
            // SAIR/PARAR (ou REATIVAR/VOLTAR): responde a confirmação e não segue para IA/menu.
            const command = recorded.autoReply ? null : detectOptOutCommand(recorded.text);
            if (command && msg.from) {
              const handled = await handleOptOutCommand(recorded.conversationId, msg.from, command, recorded.text)
                .catch((failure) => { void reportError("whatsapp.opt-out", failure, { phone: msg.from }); return false; });
              if (handled) { notifyChatChange(); continue; }
            }
            // Automações (/automacoes) com gatilho "Mensagem recebida": rodam em segundo plano, sem atrasar o atendimento.
            if (!recorded.autoReply) void emitInboundMessageById(recorded.conversationId, recorded.text).catch((failure) => console.error("[whatsapp/webhook] automações:", failure));
            await runAutomation(recorded).catch((failure) => {
              console.error("[whatsapp/webhook] fluxo automático:", failure);
              void reportError("whatsapp.automation", failure, { conversationId: recorded.conversationId });
            });
            // Fila em rodízio: a conversa que acabou de entrar na fila já sai atribuída a um atendente.
            await distributeWaiting().catch((failure) => console.error("[whatsapp/webhook] rodízio da fila:", failure));
            notifyChatChange();
          }
        }
      }
    }
  } catch (error) {
    console.error("[whatsapp/webhook] payload inválido:", error);
  }
  return NextResponse.json({ ok: true });
}
