import "server-only";
import { prisma } from "@/lib/prisma";
import { phoneVariants } from "@/lib/chat/phone";
import { optOutKeys, type OptOutCommand } from "@/lib/marketing-opt-out";

/** Marca (ou desmarca) todos os cadastros do telefone; o cadastro tem números repetidos. */
export async function applyOptOutCommand(phone: string, command: OptOutCommand, reason: string) {
  const where = { phone: { in: phoneVariants(phone) } };
  const result = await prisma.contact.updateMany({
    where,
    data: command === "opt_out"
      ? { marketingOptOut: true, marketingOptOutAt: new Date(), marketingOptOutReason: reason.slice(0, 200) }
      : { marketingOptOut: false, marketingOptOutAt: null, marketingOptOutReason: null },
  });
  return result.count;
}

/** Ids e telefones de quem pediu para não receber campanhas. */
export async function loadOptOutKeys() {
  const rows = await prisma.contact.findMany({ where: { marketingOptOut: true }, select: { id: true, phone: true } });
  return optOutKeys(rows);
}
