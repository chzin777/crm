import "server-only";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";

/** As campanhas ficam na lista JSON do workspace; uma campanha excluída some deste mapa. */
export async function campaignNames() {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: "campaigns" }, select: { value: true } });
  const list = Array.isArray(row?.value) ? (row.value as unknown as { id: string; nome: string }[]) : [];
  return new Map(list.map((campaign) => [campaign.id, campaign.nome]));
}

// O cadastro tem telefones repetidos: o disparo pode ter saído por outro contato do mesmo número.
async function samePhoneContactIds(contactId: string, phone: string) {
  const contacts = await prisma.contact.findMany({ where: { phone: { in: phoneVariants(phone) } }, select: { id: true } });
  return [...new Set([contactId, ...contacts.map((contact) => contact.id)])];
}

// Envios cujas respostas foram descartadas ("Não é resposta da campanha", ex.: robôs): não recebem novas respostas.
const IGNORED_REPLIES_KEY = "campaign-replies-ignored";

async function ignoredReplyMessageIds() {
  const row = await prisma.crmWorkspaceData.findUnique({ where: { key: IGNORED_REPLIES_KEY }, select: { value: true } });
  return new Set(Array.isArray(row?.value) ? (row.value as unknown[]).filter((id): id is string => typeof id === "string") : []);
}

/** Quem cita o disparo responde a ele; sem citação, vale o disparo só se ele foi o último envio ao contato. */
async function findRepliedCampaign(contactIds: string[], receivedAt: Date, quotedId: string | undefined) {
  const select = { id: true, campaignId: true, sentAt: true } as const;
  const ignored = await ignoredReplyMessageIds();
  const quoted = quotedId ? await prisma.campaignMessage.findUnique({ where: { whatsappMsgId: quotedId }, select }) : null;
  if (quoted) return ignored.has(quoted.id) ? null : quoted;

  const latest = await prisma.campaignMessage.findFirst({
    where: { contactId: { in: contactIds }, status: { in: ["sent", "delivered", "read", "replied"] }, sentAt: { lte: receivedAt } },
    orderBy: { sentAt: "desc" },
    select,
  });
  // O último envio descartado não passa a resposta para uma campanha mais antiga.
  if (!latest?.sentAt || ignored.has(latest.id)) return null;

  const laterChatMessage = await prisma.chatMessage.findFirst({
    where: {
      conversation: { contactId: { in: contactIds } },
      author: { in: ["agent", "bot"] },
      internal: false,
      createdAt: { gt: latest.sentAt, lte: receivedAt },
    },
    select: { id: true },
  });
  return laterChatMessage ? null : latest;
}

type InboundReply = {
  conversation: { id: string; campaignId: string | null };
  contactId: string;
  phone: string;
  receivedAt: Date;
  quotedId: string | undefined;
};

/** Registra a resposta na campanha e identifica a campanha na conversa. */
export async function attributeCampaignReply({ conversation, contactId, phone, receivedAt, quotedId }: InboundReply) {
  const contactIds = await samePhoneContactIds(contactId, phone);
  const message = await findRepliedCampaign(contactIds, receivedAt, quotedId);
  if (!message) return;

  await prisma.campaignMessage.updateMany({ where: { id: message.id, repliedAt: null }, data: { repliedAt: receivedAt, status: "replied" } });
  if (conversation.campaignId === message.campaignId) return;
  const campaignName = (await campaignNames()).get(message.campaignId);
  if (campaignName) await prisma.chatConversation.update({ where: { id: conversation.id }, data: { campaignId: message.campaignId, campaignName } });
}

/**
 * "Não é resposta da campanha": desfaz a resposta registrada nos envios ao contato (a métrica volta ao status anterior,
 * lido/entregue/enviado) e impede que novas mensagens desse contato contem como resposta a esses envios.
 * Retorna quantas respostas foram descontadas.
 */
export async function discardCampaignReplies(conversation: { contactId: string; phone: string; campaignId: string | null }) {
  const contactIds = await samePhoneContactIds(conversation.contactId, conversation.phone);
  const [replied, latest] = await Promise.all([
    prisma.campaignMessage.findMany({
      where: { contactId: { in: contactIds }, repliedAt: { not: null }, ...(conversation.campaignId ? { campaignId: conversation.campaignId } : {}) },
      select: { id: true, deliveredAt: true, readAt: true, sentAt: true },
    }),
    prisma.campaignMessage.findFirst({
      where: { contactId: { in: contactIds }, sentAt: { not: null }, ...(conversation.campaignId ? { campaignId: conversation.campaignId } : {}) },
      orderBy: { sentAt: "desc" },
      select: { id: true },
    }),
  ]);
  for (const message of replied) {
    await prisma.campaignMessage.update({
      where: { id: message.id },
      data: { repliedAt: null, status: message.readAt ? "read" : message.deliveredAt ? "delivered" : "sent" },
    });
  }
  const toIgnore = [...replied.map((message) => message.id), ...(latest ? [latest.id] : [])];
  if (toIgnore.length > 0) {
    const ignored = await ignoredReplyMessageIds();
    for (const id of toIgnore) ignored.add(id);
    const value = [...ignored];
    await prisma.crmWorkspaceData.upsert({
      where: { key: IGNORED_REPLIES_KEY },
      create: { key: IGNORED_REPLIES_KEY, value },
      update: { value },
    });
  }
  return replied.length;
}

/** Campanhas às quais o contato já respondeu, da mais recente para a mais antiga. */
export async function campaignOrigins(contactId: string, phone: string) {
  const contactIds = await samePhoneContactIds(contactId, phone);
  const replies = await prisma.campaignMessage.findMany({
    where: { contactId: { in: contactIds }, repliedAt: { not: null } },
    orderBy: { repliedAt: "desc" },
    take: 10,
    select: { campaignId: true, repliedAt: true },
  });
  if (replies.length === 0) return [];
  const names = await campaignNames();
  const seen = new Set<string>();
  return replies.flatMap((reply) => {
    const name = names.get(reply.campaignId);
    if (!name || seen.has(reply.campaignId)) return [];
    seen.add(reply.campaignId);
    return [{ id: reply.campaignId, name, repliedAt: reply.repliedAt }];
  });
}
