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
  // LGPD: SAIR/PARAR interrompe na hora qualquer automação ativa desses cadastros.
  if (command === "opt_out") await cancelAutomationsForPhone(phone);
  return result.count;
}

async function cancelAutomationsForPhone(phone: string) {
  try {
    const { cancelAutomationsForContacts, contactIdsForPhone } = await import("@/lib/automations/engine-db");
    await cancelAutomationsForContacts(await contactIdsForPhone(phone));
  } catch (error) {
    console.error("[automacoes] cancelar por opt-out:", error);
  }
}

/** Ids e telefones de quem pediu para não receber campanhas. */
export async function loadOptOutKeys() {
  const rows = await prisma.contact.findMany({ where: { marketingOptOut: true }, select: { id: true, phone: true } });
  return optOutKeys(rows);
}
