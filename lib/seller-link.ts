import "server-only";
import { prisma } from "@/lib/prisma";

/** CPF só com dígitos e sem zeros à esquerda (o VMSet às vezes guarda sem eles). */
export const cpfKey = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** "123.456.789-09" → "12345678909"; inválido/vazio → null. */
export function parseCpf(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 11 ? digits : undefined;
}

/**
 * Liga o vendedor do VMSet ao usuário do CRM pelo e-mail (cadastro do parceiro no VMSet) ou pelo CPF.
 * Só preenche vendedor ainda sem usuário (vínculo manual nunca é sobrescrito) e só quando um único usuário bate.
 */
export async function linkSellersByContact(userIds?: string[]) {
  const [users, sellers] = await Promise.all([
    prisma.user.findMany({ where: userIds ? { id: { in: userIds } } : {}, select: { id: true, email: true, cpf: true } }),
    prisma.seller.findMany({ where: { userId: null }, select: { id: true, cpf: true, emails: true } }),
  ]);
  let linked = 0;
  for (const seller of sellers) {
    const cpf = cpfKey(seller.cpf);
    const emails = seller.emails.map((email) => email.trim().toLowerCase());
    const matches = users.filter((user) => (cpf && cpfKey(user.cpf) === cpf) || emails.includes(user.email.trim().toLowerCase()));
    if (matches.length !== 1) continue;
    const updated = await prisma.seller.updateMany({ where: { id: seller.id, userId: null }, data: { userId: matches[0].id } });
    linked += updated.count;
  }
  return linked;
}
