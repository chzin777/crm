/**
 * Lojas: `Store.number` é só um sequencial interno (1, 2, 3...). O código real da unidade no ERP vem no nome
 * cadastrado ("LJ 13 UNILENTES...", "OPTICA BRASIL LTDA LJ 05 (BAIXADA)") e é ele que fica em Contact.store ("13", "5").
 */

/** Nome exibido: o nome cadastrado; "Loja <número>" só se a loja não tiver nome. */
export function storeDisplayName(store: { number: number; name?: string | null }) {
  return store.name?.trim() || `Loja ${store.number}`;
}

/** Código da unidade no ERP lido do nome ("LJ 05" -> "5"), ou null quando o nome não traz "LJ <número>". */
export function storeErpCode(name: string | null | undefined): string | null {
  const match = /\bLJ\s*0*(\d+)/i.exec(name ?? "");
  return match ? match[1] || "0" : null;
}

/**
 * Nome da unidade de uma venda do ERP a partir do código da loja ("13", "013"): o nome cadastrado cujo "LJ <n>" bate;
 * sem cadastro, "LJ <código>"; sem código, "Loja não informada".
 */
export function storeNameForErpCode(stores: { number: number; name?: string | null }[], code: string | null | undefined) {
  const normalized = (code ?? "").trim().replace(/^0+(?=\d)/, "");
  if (!normalized) return "Loja não informada";
  const store = stores.find((item) => storeErpCode(item.name) === normalized);
  return store ? storeDisplayName(store) : `LJ ${normalized}`;
}

/** Ordem natural pelo nome ("LJ 2" antes de "LJ 10"). */
export const compareStoreNames = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
