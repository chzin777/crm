import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeFieldValue, readCustomFields, readDefinition, type ContactFieldDefinition } from "@/lib/contact-fields";

/** Campos personalizados no banco: definições e gravação de valores (tela, automações e IA). */

export async function listFieldDefinitions(): Promise<ContactFieldDefinition[]> {
  const rows = await prisma.contactFieldDef.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return rows.map(readDefinition);
}

/**
 * Grava valores (chave → valor) no contato: só chaves definidas e valores válidos para o tipo; "" limpa o campo.
 * Devolve os campos atualizados e as chaves recusadas (com o motivo).
 */
export async function setContactFields(contactId: string, values: Record<string, unknown>) {
  const defs = new Map((await listFieldDefinitions()).map((def) => [def.key, def]));
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { customFields: true } });
  if (!contact) throw new Error("Contato não encontrado.");
  const fields = readCustomFields(contact.customFields);
  const rejected: { key: string; reason: string }[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const def = defs.get(key);
    if (!def) { rejected.push({ key, reason: "campo não existe" }); continue; }
    const value = normalizeFieldValue(def, raw);
    if (value === null) { rejected.push({ key, reason: def.type === "select" ? `use uma das opções: ${def.options.join(", ")}` : `valor inválido para ${def.type}` }); continue; }
    if (value) fields[key] = value;
    else delete fields[key];
  }
  await prisma.contact.update({ where: { id: contactId }, data: { customFields: fields as Prisma.InputJsonValue } });
  return { fields, rejected };
}
