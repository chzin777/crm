import { buildShowcaseList, fit, LIST_LIMITS, type InteractiveShowcase } from "@/lib/ai/interactive-showcase";
import type { StockToolProduct } from "@/lib/ai/stock";

export function photoVariants(products: StockToolProduct[], name: string, _fromPhoto = true): { list: InteractiveShowcase; text: string } | null {
  const available = products.filter((product) => product.lojasComEstoque.length > 0).slice(0, 8);
  const models = available.map((product) => ({
    nomeComercial: product.produto,
    referencia: `#${product.codigo}`,
    precoVenda: product.precoVenda,
    precoVaria: false,
    codigos: [product.codigo],
  }));
  const list = buildShowcaseList(models);
  if (!list) return null;
  // Só rótulo da lista nativa (dado, não conversa): o comentário ao cliente é escrito pelo modelo.
  const opening = `*${name}* — variações com estoque`;
  const lines = available.map((product, index) => `${index + 1}. *${product.produto} (Ref. #${product.codigo})*${product.precoVenda ? ` — ${product.precoVenda}` : ""}`);
  const rows = list.rows.map((row, index) => ({
    ...row,
    title: `Variação ${index + 1}`,
    description: fit([available[index].produto, available[index].precoVenda].filter(Boolean).join(" • "), LIST_LIMITS.rowDescription),
  }));
  return { list: { ...list, bodyText: opening, rows }, text: lines.join("\n") };
}
