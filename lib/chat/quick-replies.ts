/** Respostas rápidas do atendimento: tipos e regras compartilhadas entre tela e API. */

export type QuickReply = {
  id: string;
  title: string;
  text: string;
  shortcut: string;
  category: string | null;
  isGlobal: boolean;
  mine: boolean;
  automatic: boolean;
  triggers: string[];
  variations: string[];
  queueId: string | null;
};

export const QUICK_REPLY_CATEGORIES = ["Geral", "Vendas", "Pós-venda", "Financeiro", "Laboratório", "Saudação"] as const;
export const QUICK_REPLY_MAX = 4096;

/** "/Pix Rápido" → "pix-rapido": sem barra, minúsculo, sem acento, só letras, números, - e _. */
export function normalizeShortcut(value: string) {
  return value
    .trim()
    .replace(/^\/+/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

/** Busca por atalho, título, categoria ou texto. */
export function matchesQuickReply(item: Pick<QuickReply, "title" | "shortcut" | "text" | "category">, term: string) {
  const query = term.trim().toLowerCase().replace(/^\//, "");
  if (!query) return true;
  return [item.shortcut, item.title, item.category ?? "", item.text].some((value) => value.toLowerCase().includes(query));
}
