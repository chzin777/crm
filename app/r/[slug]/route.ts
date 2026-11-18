import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ slug: string }> };

/** Robôs de pré-visualização (WhatsApp, Facebook, Telegram...) abrem o link sem o cliente clicar: não contam. */
const PREVIEW_BOT = /facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|twitterbot|linkedinbot|discordbot|skypeuripreview|googlebot|bingbot|bot\b|crawler|spider|preview/i;

/**
 * Link curto rastreado (público): registra o clique (contato, histórico da conversa) e dispara o gatilho
 * "Clicou em link rastreado" antes de redirecionar para o destino. Falha no registro nunca impede o redirect.
 */
export async function GET(request: Request, { params }: Context) {
  const { slug } = await params;
  const link = /^[A-Za-z0-9]{4,16}$/.test(slug) ? await prisma.trackedLink.findUnique({ where: { slug } }).catch(() => null) : null;
  if (!link) return new NextResponse("Link não encontrado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);
  if (!PREVIEW_BOT.test(userAgent)) {
    try {
      const now = new Date();
      await prisma.$transaction([
        prisma.trackedLinkClick.create({ data: { linkId: link.id, contactId: link.contactId, userAgent } }),
        prisma.trackedLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 }, lastClickAt: now } }),
      ]);
      if (link.contactId) {
        const contactId = link.contactId;
        const [{ triggerAutomations }, { addSystemMessage }] = await Promise.all([import("@/lib/automations/engine-db"), import("@/lib/chat/conversation")]);
        const conversation = await prisma.chatConversation.findFirst({ where: { contactId }, orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } }, select: { id: true } });
        if (conversation) await addSystemMessage(conversation.id, `Cliente clicou no link rastreado: ${link.url}`.slice(0, 500)).catch(() => undefined);
        void triggerAutomations({ type: "trigger_link_click", url: link.url }, { contactId, conversationId: conversation?.id ?? null, vars: { link: link.url } })
          .catch((error: unknown) => console.error("[links] gatilho de clique:", error));
      }
    } catch (error) {
      console.error(`[links] clique em ${slug} não registrado:`, error);
    }
  }
  return NextResponse.redirect(link.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
