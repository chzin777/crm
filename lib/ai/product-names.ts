/**
 * Nome do produto como o cliente entende: o cadastro do ERP traz siglas ("ARM MIUMIU REF 0MU 01XV 19P1O150");
 * a IA recebe "Armação Miu Miu (ref. 0MU 01XV)". Sem banco nem rede.
 */

const TYPES: Record<string, string> = {
  ARM: "Armação", ARMACAO: "Armação", OCS: "Óculos de sol", OCU: "Óculos", OCG: "Óculos de grau", OC: "Óculos",
  LC: "Lente de contato", LCT: "Lente de contato", LEN: "Lente", ACE: "Acessório", ACESS: "Acessório", CLIP: "Clip-on",
};
const BRANDS: Record<string, string> = {
  MIUMIU: "Miu Miu", "MIU MIU": "Miu Miu", RAYBAN: "Ray-Ban", "RAY BAN": "Ray-Ban", "RAY-BAN": "Ray-Ban", OAKLEY: "Oakley", PRADA: "Prada",
  "PRADA LINEA ROSSA": "Prada Linea Rossa", VOGUE: "Vogue", ARNETTE: "Arnette", "EMPORIO ARMANI": "Emporio Armani", ARMANI: "Armani",
  "DOLCE GABBANA": "Dolce & Gabbana", "DOLCE & GABBANA": "Dolce & Gabbana", "D&G": "Dolce & Gabbana", VERSACE: "Versace", BURBERRY: "Burberry",
  "MICHAEL KORS": "Michael Kors", "TOMMY HILFIGER": "Tommy Hilfiger", "CAROLINA HERRERA": "Carolina Herrera", CHILLI: "Chilli Beans",
  "CHILLI BEANS": "Chilli Beans", GUCCI: "Gucci", DIOR: "Dior", CHANEL: "Chanel", TIFFANY: "Tiffany & Co.", COACH: "Coach",
  "RALPH LAUREN": "Ralph Lauren", POLO: "Polo Ralph Lauren", JULIO: "Julio", "ANA HICKMANN": "Ana Hickmann", EVOKE: "Evoke", SPEEDO: "Speedo",
  "RAY BAN META": "Ray-Ban Meta", META: "Meta",
};

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const title = (value: string) => value.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
/** Token com dígito é código ("0MU", "01XV", "RB4165"); só letras é nome ("JUSTIN" → "Justin"). */
const refToken = (token: string) => (/\d/.test(token) || token.length <= 2 ? token.toUpperCase() : title(token));

export type ErpName = { tipo: string | null; marca: string | null; referencia: string | null; cor: string | null; tamanho: string | null };

/**
 * Lê o padrão do ERP "<TIPO> <MARCA> REF <MODELO...> <COR> [<TAMANHO>]": o tamanho é o número final (2 dígitos)
 * e a cor é o código logo antes dele, quando sobram pelo menos 2 partes de referência.
 */
export function parseErpName(description: string, brand?: string | null): ErpName {
  const text = norm(description).replace(/\bREF[-.:]?\s*/, "REF ");
  const tokens = text.split(" ").filter(Boolean);
  const at = tokens.indexOf("REF");
  const head = at >= 0 ? tokens.slice(0, at) : tokens;
  const tipo = head[0] && TYPES[head[0]] ? TYPES[head[0]] : null;
  const brandRaw = norm(brand ?? "") || head.slice(tipo ? 1 : 0).join(" ");
  const marca = brandRaw ? BRANDS[brandRaw] ?? BRANDS[brandRaw.replace(/\s/g, "")] ?? title(brandRaw) : null;
  if (at < 0) return { tipo, marca, referencia: null, cor: null, tamanho: null };
  const ref = tokens.slice(at + 1);
  let tamanho: string | null = null;
  if (ref.length >= 2 && /^\d{2}$/.test(ref[ref.length - 1])) tamanho = ref.pop() ?? null;
  const cor = ref.length >= 2 ? ref.pop() ?? null : null;
  return { tipo, marca, referencia: ref.length ? ref.map(refToken).join(" ") : null, cor, tamanho };
}

/** "ARM MIUMIU REF 0MU 01XV 19P1O150" → "Armação Miu Miu (ref. 0MU 01XV)". */
export function humanizeProductName(description: string, brand?: string | null) {
  const parsed = parseErpName(description, brand);
  if (!parsed.referencia) {
    // Sem padrão de referência: só tira a sigla do tipo e acerta maiúsculas.
    const words = norm(description).split(" ");
    const rest = TYPES[words[0]] ? [TYPES[words[0]], ...words.slice(1).map(refToken)] : words.map(refToken);
    return rest.join(" ").trim();
  }
  return [parsed.tipo, parsed.marca].filter(Boolean).join(" ") + ` (ref. ${parsed.referencia})`;
}

/** Chave do modelo (todas as cores e tamanhos): marca + referência sem a cor. */
export function modelKey(description: string, brand?: string | null) {
  const parsed = parseErpName(description, brand);
  return parsed.referencia ? `${norm(parsed.marca ?? "")}|${norm(parsed.referencia)}` : null;
}

/** Regra fixa do prompt: nomes humanizados e redação variada, sem oferecer o que já foi dito. */
export const NATURAL_RULES = [
  "LINGUAGEM NATURAL (regra fixa):",
  "- Nunca despeje o nome bruto do sistema (ex.: \"ARM MIUMIU REF 0MU 01XV 19P1O150\"). Use o campo nomeProduto das ferramentas, já traduzido (ex.: \"Armação Miu Miu (ref. 0MU 01XV)\"), ou um nome natural como \"esse modelo da Miu Miu\" depois da primeira menção. Códigos de cor/tamanho só se o cliente pedir.",
  "- Varie a redação: nunca repita a mesma frase ou a mesma estrutura das suas mensagens anteriores (leia a conversa). Não comece toda resposta com \"Temos o ...\".",
  "- Nunca ofereça algo que você já entregou na conversa: se já disse o nome ou o endereço da loja, NÃO ofereça \"te passar o nome da loja certinho\" nem repita o endereço sem necessidade. Ofereça o próximo passo lógico: enviar a localização no mapa, ver outras cores/variações, detalhes do modelo ou reservar na loja.",
  "- Sem frases vazias como \"Posso te ajudar com disponibilidade e lojas\": responda com conteúdo real ou faça uma pergunta específica.",
].join("\n");

/** Marcas conhecidas (chaves do cadastro do ERP), usadas para reconhecer busca só por marca. */
export const KNOWN_BRANDS = Object.keys(BRANDS);

/**
 * Nome comercial dos modelos mais conhecidos (o ERP só traz a referência: "0RB4165L"). Chave: marca|número do modelo.
 * Usado na vitrine/ficha ("Ray-Ban Justin") e na busca ("Ray-Ban Justin" → RB4165).
 */
const MODEL_NAMES: Record<string, string> = {
  "RAYBAN|4165": "Justin", "RAYBAN|3025": "Aviator Classic", "RAYBAN|3026": "Aviator Large Metal II", "RAYBAN|2140": "Original Wayfarer",
  "RAYBAN|2132": "New Wayfarer", "RAYBAN|4105": "Wayfarer Folding", "RAYBAN|4171": "Erika", "RAYBAN|3447": "Round Metal", "RAYBAN|3016": "Clubmaster",
  "RAYBAN|3548": "Hexagonal", "RAYBAN|4187": "Chris", "RAYBAN|3136": "Caravan", "RAYBAN|3029": "Outdoorsman II", "RAYBAN|4202": "Andy",
  "OAKLEY|9102": "Holbrook", "OAKLEY|9417": "Holbrook XL", "OAKLEY|9013": "Frogskins", "OAKLEY|9208": "Radar EV Path", "OAKLEY|9406": "Sutro",
  "OAKLEY|9188": "Flak 2.0 XL", "OAKLEY|9263": "Turbine", "OAKLEY|9014": "Gascan",
};
/** Prefixos de óculos de sol das referências (RB, OO); armação de grau (RX, OX) tem outros modelos. */
const SUN_PREFIX: Record<string, string> = { RAYBAN: "RB", OAKLEY: "OO" };
const brandKey = (marca: string | null) => (marca ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** "Ray-Ban" + "RB4165L" → "Justin"; referência de armação (RX) ou modelo desconhecido → null. */
export function modelNickname(marca: string | null, referencia: string | null) {
  const brand = brandKey(marca);
  const match = (referencia ?? "").toUpperCase().match(/\b0?([A-Z]{2})?(\d{4})/);
  if (!match || !SUN_PREFIX[brand]) return null;
  if (match[1] && match[1] !== SUN_PREFIX[brand]) return null;
  return MODEL_NAMES[`${brand}|${match[2]}`] ?? null;
}

/** "Ray-Ban Justin" → "Ray-Ban RB4165" (para casar com a referência do ERP); sem apelido conhecido, o termo volta igual. */
export function expandModelNicknames(term: string) {
  const text = norm(term).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ");
  for (const [key, name] of Object.entries(MODEL_NAMES).sort((a, b) => b[1].length - a[1].length)) {
    const [brand, number] = key.split("|");
    const nick = norm(name);
    if (!new RegExp(`(^| )${nick.replace(/[.]/g, "\.")}( |$)`).test(text)) continue;
    // Apelido sem marca ("o Justin") vale para a marca dona do apelido; com outra marca no termo, não mexe.
    const hasOtherBrand = Object.keys(SUN_PREFIX).some((other) => other !== brand && text.replace(/ /g, "").includes(other));
    if (hasOtherBrand) continue;
    return `${term.replace(new RegExp(name.replace(/[.]/g, "\."), "i"), "").trim()} ${SUN_PREFIX[brand]}${number}`.replace(/\s+/g, " ").trim();
  }
  return term;
}

/**
 * Código-base da referência para agrupar o mesmo modelo: sem "REF", espaços, o "0" interno e o prefixo de 2 letras
 * da linha ("0RB4165L", "RB4165L" e "4165L" → "4165L"; "0MU 01XV" → "01XV").
 */
export function referenceKey(referencia: string | null | undefined) {
  const text = (referencia ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\bREF\b[-.:]?/g, "").replace(/[^A-Z0-9]/g, "");
  return text.replace(/^0?[A-Z]{2}(?=\d)/, "").replace(/^0(?=\d{4})/, "");
}

/** Família do modelo (marca + código-base): cores, tamanhos e grafias da referência viram um item só. */
export function modelFamilyKey(description: string, brand?: string | null) {
  const parsed = parseErpName(description, brand);
  if (!parsed.referencia) return null;
  return `${(parsed.marca ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")}|${referenceKey(parsed.referencia)}`;
}
