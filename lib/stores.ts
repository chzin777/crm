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

const ACCENTS: Record<string, string> = {
  goiania: "Goiânia", brasilia: "Brasília", "aparecida de goiania": "Aparecida de Goiânia", "jardim goias": "Jardim Goiás",
  "setor leste vila nova": "Setor Leste Vila Nova", "setor aeroporto": "Setor Aeroporto", aeroviario: "Aeroviário", "setor oeste": "Setor Oeste",
};
/** "SETOR BUENO" -> "Setor Bueno" (com acento nos nomes conhecidos). */
export function titlePlace(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const known = ACCENTS[text.toLowerCase()];
  if (known) return known;
  return text.toLowerCase().replace(/(^|\s)(\S)/g, (_match, space: string, letter: string) => space + letter.toUpperCase()).replace(/(?<=\s)(De|Da|Do|Dos|Das|E|Os|As)(?=\s)/g, (word) => word.toLowerCase());
}

type StorePlace = { number: number; name?: string | null; neighborhoods?: string[] | null; city?: string | null };

/**
 * Rótulo reconhecível da unidade do ERP: "Loja 18 · Setor Bueno" (Goiânia mostra o bairro; outra cidade, a cidade,
 * e o bairro junto quando a cidade tem mais de uma loja). Sem cadastro: "Loja 18".
 */
export function storeFriendlyLabel(stores: StorePlace[], code: string | null | undefined): string {
  const normalized = (code ?? "").trim().replace(/^0+(?=\d)/, "");
  if (!normalized) return "Loja não informada";
  const store = stores.find((item) => storeErpCode(item.name) === normalized);
  const base = `Loja ${normalized}`;
  if (!store) return base;
  const city = titlePlace(store.city);
  const district = titlePlace(store.neighborhoods?.[0]);
  if (!city || /^goi[aâ]nia$/i.test(city)) return district ? `${base} · ${district}` : base;
  const sameCity = stores.filter((item) => storeErpCode(item.name) && titlePlace(item.city) === city).length;
  return sameCity > 1 && district ? `${base} · ${district}, ${city}` : `${base} · ${city}`;
}

/** Ordem natural pelo nome ("LJ 2" antes de "LJ 10"). */
export const compareStoreNames = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
