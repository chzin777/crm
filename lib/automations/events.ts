/** Eventos do CRM que disparam automações, calculados sem banco (testável). */

type StageCard = { id: string; contactId?: string; coluna: string; pipelineId?: string };

/** Cards que entraram numa etapa (novos ou com coluna diferente da anterior). */
export function stageChanges(before: StageCard[], after: StageCard[]): { contactId: string; stage: string; cardId: string }[] {
  const previous = new Map(before.map((card) => [card.id, card.coluna]));
  return after
    .filter((card) => !!card.contactId && previous.get(card.id) !== card.coluna)
    .map((card) => ({ contactId: card.contactId!, stage: card.coluna, cardId: card.id }));
}

/** Tags novas na conversa (comparação sem caixa). */
export function addedTags(before: string[], after: string[]): string[] {
  const had = new Set(before.map((tag) => tag.toLowerCase()));
  return after.filter((tag) => !had.has(tag.toLowerCase()));
}
