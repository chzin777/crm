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

/** Quem cita o disparo responde a ele; sem citação, vale o disparo só se ele foi o último envio ao contato. */
async function findRepliedCampaign(contactIds: string[], receivedAt: Date, quotedId: string | undefined) {
  const select = { id: true, campaignId: true, sentAt: true } as const;
  const quoted = quotedId ? await prisma.campaignMessage.findUnique({ where: { whatsappMsgId: quotedId }, select }) : null;
  if (quoted) return quoted;

  const latest = await prisma.campaignMessage.findFirst({
    where: { contactId: { in: contactIds }, status: { in: ["sent", "delivered", "read", "replied"] }, sentAt: { lte: receivedAt } },
    orderBy: { sentAt: "desc" },
    select,
  });
  if (!latest?.sentAt) return null;

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
