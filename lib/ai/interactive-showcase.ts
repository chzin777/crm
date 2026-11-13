/**
 * Vitrine da busca ampla como Lista Interativa nativa do WhatsApp (type "interactive", interactive.type "list"):
 * o cliente toca em "Ver modelos", escolhe na gaveta e a escolha volta como list_reply com o id do produto.
 * Sem banco nem rede: os limites da Meta (botão 20, título da seção 24, linha 24/72, até 10 linhas) valem aqui.
 */
import type { ShowcaseModel } from "@/lib/ai/stock-showcase";
import type { ChatInteractiveList } from "@/lib/chat/types";

export const LIST_LIMITS = { body: 1024, button: 20, sectionTitle: 24, rowTitle: 24, rowDescription: 72, rowId: 200, rows: 10 } as const;
/** Modelos na gaveta (a vitrine já vem com até 8 deduplicados). */
export const LIST_MAX_ROWS = 8;
export const PRODUCT_SELECT_PREFIX = "product_select:";
export const LIST_BUTTON = "Ver modelos";
export const LIST_SECTION = "Modelos em estoque";

export type ShowcaseListRow = { id: string; title: string; description: string };
export type InteractiveShowcase = { bodyText: string; buttonText: string; sectionTitle: string; rows: ShowcaseListRow[] };

/** Corta no limite com reticências (nunca passa do máximo da Meta). */
export function fit(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Identificador do item: referência comercial; sem referência (#código), o código interno. */
const rowKey = (model: Pick<ShowcaseModel, "referencia" | "codigos">) => (model.referencia?.replace(/^#/, "").trim() || model.codigos[0] || "").slice(0, LIST_LIMITS.rowId - PRODUCT_SELECT_PREFIX.length);

/** Título da linha (≤ 24): "Ref. PS 07RV"; referência longa ou só código interno → nome comercial curto. */
function rowTitle(model: Pick<ShowcaseModel, "nomeComercial" | "referencia">) {
  const ref = model.referencia && !model.referencia.startsWith("#") ? model.referencia : "";
  if (ref && `Ref. ${ref}`.length <= LIST_LIMITS.rowTitle) return `Ref. ${ref}`;
  if (ref && ref.length <= LIST_LIMITS.rowTitle) return ref;
  return fit(model.nomeComercial, LIST_LIMITS.rowTitle);
}

/** Lista interativa da vitrine: 2+ modelos distintos (1 modelo só não precisa de escolha). */
export function buildShowcaseList(models: Pick<ShowcaseModel, "nomeComercial" | "referencia" | "precoVenda" | "precoVaria" | "codigos">[], brand?: string | null): InteractiveShowcase | null {
  const rows: ShowcaseListRow[] = [];
  for (const model of models) {
    const key = rowKey(model);
    if (!key || rows.some((row) => row.id === `${PRODUCT_SELECT_PREFIX}${key}`)) continue;
    const price = model.precoVenda ? `${model.precoVaria ? "a partir de " : ""}${model.precoVenda}` : "";
    rows.push({ id: `${PRODUCT_SELECT_PREFIX}${key}`, title: rowTitle(model), description: fit([model.nomeComercial, price].filter(Boolean).join(" • "), LIST_LIMITS.rowDescription) });
    if (rows.length >= LIST_MAX_ROWS) break;
  }
  if (rows.length < 2) return null;
  const name = brand?.trim();
  const bodyText = fit(`Temos vários modelos${name ? ` *${name}*` : ""} disponíveis em estoque! Toque no botão abaixo para escolher um modelo e ver a foto e os detalhes:`, LIST_LIMITS.body);
  return { bodyText, buttonText: LIST_BUTTON, sectionTitle: LIST_SECTION, rows };
}

/** Payload oficial da Meta Cloud API (limites revalidados no envio). */
export function interactiveListPayload(to: string, list: InteractiveShowcase) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: fit(list.bodyText, LIST_LIMITS.body) },
      action: {
        button: fit(list.buttonText, LIST_LIMITS.button),
        sections: [{
          title: fit(list.sectionTitle, LIST_LIMITS.sectionTitle),
          rows: list.rows.slice(0, LIST_LIMITS.rows).map((row) => ({ id: row.id.slice(0, LIST_LIMITS.rowId), title: fit(row.title, LIST_LIMITS.rowTitle), ...(row.description ? { description: fit(row.description, LIST_LIMITS.rowDescription) } : {}) })),
        }],
      },
    },
  };
}

/** Estrutura guardada na mensagem do atendimento (a equipe vê a lista como o cliente recebeu). */
export function toChatInteractive(list: InteractiveShowcase): ChatInteractiveList {
  return { type: "list", body: list.bodyText, button: list.buttonText, sections: [{ title: list.sectionTitle, rows: list.rows }] };
}

/** Referência/código escolhido na lista ("product_select:PS 07RV" → "PS 07RV"); outro id → null. */
export function productSelectRef(id: string | null | undefined) {
  if (!id?.startsWith(PRODUCT_SELECT_PREFIX)) return null;
  return id.slice(PRODUCT_SELECT_PREFIX.length).trim() || null;
}

/** Texto legível da escolha no histórico: "Quero ver o modelo: Prada Linea Rossa (Ref. PS 07RV)". */
export function selectionText(ref: string, title?: string, description?: string) {
  const name = (description ?? "").split(" • ")[0].replace(/…$/, "").trim() || (title ?? "").replace(/^Ref\.\s*/i, "").trim();
  const hasRef = name.replace(/[^a-z0-9]/gi, "").toUpperCase().includes(ref.replace(/[^a-z0-9]/gi, "").toUpperCase());
  return `Quero ver o modelo: ${name && !hasRef ? `${name} (Ref. ${ref})` : name || `Ref. ${ref}`}`;
}
