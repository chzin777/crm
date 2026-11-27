import "server-only";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";

/**
 * "Só os próprios clientes" (Permissões do cargo, chave app.somenteMeusClientes): Funil e Contatos mostram só
 * clientes que compraram com o vendedor do VMSet ligado ao usuário ou cujas conversas ele atendeu.
 * Retorna null quando o usuário vê tudo.
 */
export const OWN_CLIENTS_KEY = "app.somenteMeusClientes";

const nameKey = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toUpperCase();

const memo = new Map<string, { at: number; ids: Set<string> | null }>();
const TTL_MS = 60_000;

export async function ownContactIds(userId: string): Promise<Set<string> | null> {
  const hit = memo.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  const ids = await loadOwnContactIds(userId);
  memo.set(userId, { at: Date.now(), ids });
  if (memo.size > 500) memo.delete(memo.keys().next().value as string);
  return ids;
}

async function loadOwnContactIds(userId: string): Promise<Set<string> | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, roleRef: { select: { permissions: true } } } });
  if (!user || isAdminRole(user.role)) return null;
  const permissions = user.roleRef?.permissions;
  const stored = typeof permissions === "object" && permissions !== null && !Array.isArray(permissions) ? (permissions as Record<string, unknown>) : {};
  if (stored[OWN_CLIENTS_KEY] !== true) return null;

  const seller = await prisma.seller.findFirst({ where: { userId }, orderBy: { active: "desc" }, select: { name: true } });
  const variants = seller ? [...new Set([seller.name.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR"), nameKey(seller.name)])] : [];
  const [bought, attended] = await Promise.all([
    variants.length
      ? prisma.$queryRaw<{ id: string }[]>`
          SELECT c.id FROM "Contact" c
          WHERE c."sourceKey" IN (
            SELECT DISTINCT "sourceKey" FROM "VmsetSale" WHERE "sourceKey" IS NOT NULL AND upper(trim(seller)) = ANY(${variants}::text[])
          )`
      : Promise.resolve([]),
    prisma.chatConversation.findMany({ where: { assigneeId: userId }, select: { contactId: true }, distinct: ["contactId"] }),
  ]);
  return new Set([...bought.map((row) => row.id), ...attended.map((row) => row.contactId)]);
}

type Card = { contactId?: unknown };
const cardContact = (card: unknown) => (typeof card === "object" && card !== null ? (card as Card).contactId : undefined);

/** Cards do funil que o usuário enxerga (card sem contato fica só para quem vê tudo). */
export const ownCards = (cards: unknown[], ids: Set<string>) => cards.filter((card) => {
  const contactId = cardContact(card);
  return typeof contactId === "string" && ids.has(contactId);
});

/** Salvar o funil visto pela metade: mantém os cards dos outros e troca só os do usuário. */
export const mergeOwnCards = (stored: unknown[], incoming: unknown[], ids: Set<string>) => [
  ...stored.filter((card) => !ownCards([card], ids).length),
  ...ownCards(incoming, ids),
];
