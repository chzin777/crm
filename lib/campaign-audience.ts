import { phoneVariants } from "@/lib/chat/phone";

/** Destinatário mínimo para deduplicar: id do contato, telefone e (opcional) segmentos de origem. */
export type DedupableRecipient = { id: string; telefone: string; origens?: string[] };

/**
 * Chaves que identificam a mesma pessoa: o id do contato e o celular normalizado (com/sem 55, com/sem o 9º dígito).
 * Dois cadastros com o mesmo número contam como a mesma pessoa e recebem a campanha uma única vez.
 */
export function recipientDedupeKeys(recipient: Pick<DedupableRecipient, "id" | "telefone">) {
  const keys = new Set<string>([`id:${recipient.id}`]);
  if ((recipient.telefone ?? "").replace(/\D/g, "").length >= 10) {
    for (const variant of phoneVariants(recipient.telefone)) {
      const digits = variant.replace(/\D/g, "");
      if (digits.length >= 10) keys.add(`tel:${digits}`);
    }
  }
  return [...keys];
}

/**
 * Remove repetidos (por contato e por telefone), mantendo a primeira ocorrência e somando nela os segmentos
 * de origem das repetidas. Cada pessoa aparece no máximo uma vez no resultado.
 */
export function dedupeRecipients<T extends DedupableRecipient>(list: T[]): { unique: T[]; removed: number } {
  const owner = new Map<string, number>();
  const unique: T[] = [];
  for (const recipient of list) {
    const keys = recipientDedupeKeys(recipient);
    const index = keys.map((key) => owner.get(key)).find((value) => value !== undefined);
    if (index !== undefined) {
      const kept = unique[index];
      if (recipient.origens?.length) {
        unique[index] = { ...kept, origens: [...new Set([...(kept.origens ?? []), ...recipient.origens])] };
      }
      for (const key of keys) if (!owner.has(key)) owner.set(key, index);
      continue;
    }
    const position = unique.push({ ...recipient, origens: recipient.origens ? [...new Set(recipient.origens)] : undefined }) - 1;
    for (const key of keys) owner.set(key, position);
  }
  return { unique, removed: list.length - unique.length };
}

export type SegmentOverlapRow = {
  label: string;
  /** Contatos do segmento (antes de cruzar com os outros). */
  total: number;
  /** Contatos que só existem neste segmento. */
  exclusive: number;
  /** Segmento com contatos, todos já presentes em outros segmentos: não acrescenta ninguém. */
  contained: boolean;
};

export type SegmentOverlapSummary = {
  /** Soma simples dos contatos de cada segmento. */
  rawTotal: number;
  /** Pessoas únicas após unir os segmentos. */
  unique: number;
  /** Pessoas presentes em mais de um segmento selecionado. */
  inMultipleSegments: number;
  /** Registros removidos pela deduplicação (rawTotal - unique). */
  removed: number;
  segments: SegmentOverlapRow[];
};

/** Interseção entre segmentos: soma bruta, únicos, quem está em mais de um e segmentos 100% contidos nos demais. */
export function summarizeSegmentOverlap(groups: { label: string; recipients: Pick<DedupableRecipient, "id" | "telefone">[] }[]): SegmentOverlapSummary {
  const owner = new Map<string, number>();
  const membership: Set<number>[] = [];
  let rawTotal = 0;
  groups.forEach((group, groupIndex) => {
    rawTotal += group.recipients.length;
    for (const recipient of group.recipients) {
      const keys = recipientDedupeKeys(recipient);
      let person = keys.map((key) => owner.get(key)).find((value) => value !== undefined);
      if (person === undefined) person = membership.push(new Set()) - 1;
      membership[person].add(groupIndex);
      for (const key of keys) if (!owner.has(key)) owner.set(key, person);
    }
  });
  const exclusive = groups.map(() => 0);
  let inMultipleSegments = 0;
  for (const groupsOfPerson of membership) {
    if (groupsOfPerson.size > 1) inMultipleSegments++;
    else for (const index of groupsOfPerson) exclusive[index]++;
  }
  return {
    rawTotal,
    unique: membership.length,
    inMultipleSegments,
    removed: rawTotal - membership.length,
    segments: groups.map((group, index) => ({
      label: group.label,
      total: group.recipients.length,
      exclusive: exclusive[index],
      contained: group.recipients.length > 0 && exclusive[index] === 0,
    })),
  };
}
