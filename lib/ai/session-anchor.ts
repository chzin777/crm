import { expandModelNicknames, KNOWN_BRANDS } from "@/lib/ai/product-names";

/**
 * Âncora do atendimento atual (ActiveSessionContext): produto e loja fixados nas mensagens da IA DESTA sessão.
 * Extraída de forma determinística (ficha 🕶️, linhas 📍 e localização enviada); nunca vem de atendimentos
 * encerrados nem de testes anteriores. Sem banco nem rede.
 */

export type ActiveProduct = { sku: string | null; referencia: string | null; nomeComercial: string; marca: string | null; ultimaFotoEnviadaUrl: string | null };
export type ActiveStore = { lojaId: string | null; nome: string; cidade: string | null; enderecoCompleto: string };
export type SessionAnchor = { activeProduct: ActiveProduct | null; activeStore: ActiveStore | null };
/** Mensagem da IA nesta sessão (mais antigas primeiro), com a foto de produto que foi junto, se houver. */
export type AnchorMessage = { text: string; imageSku?: string | null; imageUrl?: string | null };

export const EMPTY_ANCHOR: SessionAnchor = { activeProduct: null, activeStore: null };

/** Linhas da sessão atual: só o que veio depois do início do atendimento (reabertura); null = conversa inteira. */
export function sessionRows<T extends { createdAt: Date }>(rows: T[], since: Date | null): T[] {
  return since ? rows.filter((row) => row.createdAt > since) : rows;
}

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const compact = (value: string) => norm(value).replace(/[^A-Z0-9]/g, "");
const words = (value: string) => ` ${norm(value).replace(/[^A-Z0-9]+/g, " ").trim()} `;

/** Marca no começo do nome comercial ("Ray-Ban Aviator Classic" → "Ray-Ban"). */
function brandOf(name: string) {
  const key = KNOWN_BRANDS.map(compact).filter((brand) => compact(name).startsWith(brand)).sort((a, b) => b.length - a.length)[0];
  if (!key) return null;
  const parts = name.split(/\s+/);
  for (let size = 1; size <= parts.length; size += 1) if (compact(parts.slice(0, size).join(" ")).length >= key.length) return parts.slice(0, size).join(" ");
  return null;
}

/** "🕶️ *Ray-Ban Aviator Classic | Ref. RB3025*" da ficha montada no código. */
const CARD_PRODUCT = /🕶️\s*\*([^*|\n]+?)(?:\s*\|\s*Ref\.\s*([^*\n]+?))?\s*\*/;

function productFrom(message: AnchorMessage): ActiveProduct | null {
  const match = message.text.match(CARD_PRODUCT);
  if (!match) return null;
  const nomeComercial = match[1].trim();
  return { sku: message.imageSku || null, referencia: match[2]?.trim() || null, nomeComercial, marca: brandOf(nomeComercial), ultimaFotoEnviadaUrl: message.imageUrl || null };
}

const STREET = /\b(Rua|R\.|Avenida|Av\.?|Alameda|Al\.|Rodovia|Pra[cç]a|Quadra|Qd\.?)\s+[^\n()]*\d[^\n()]*/i;

/** Lojas citadas com endereço numa mensagem: ficha ("📍 *Loja X* – Cidade (Rua 9, 2106)"), texto livre e localização enviada. */
export function storesIn(text: string): ActiveStore[] {
  const found: ActiveStore[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const name = line.match(/\bLoja\s+([^\n*()–—,]+)/);
    if (!name) return;
    const nome = `Loja ${name[1].trim().replace(/\s+-\s*$/, "")}`;
    const after = line.slice((name.index ?? 0) + name[0].length);
    let endereco = "";
    let cidade: string | null = null;
    const paren = [...after.matchAll(/\(([^()]*\d[^()]*)\)/g)].pop();
    const dash = after.match(/[–—]\s*([^()\n]*\d[^()\n]*)$/);
    if (paren) {
      endereco = paren[1];
      const city = after.slice(0, paren.index).replace(/^[\s*]*[–—-]?\s*/, "").trim();
      cidade = city && !/\d/.test(city) ? city : null;
    } else if (dash) endereco = dash[1];
    else if (STREET.test(after)) endereco = after.match(STREET)![0];
    // Localização enviada: "📍 *Óticas Brasil - Loja X*" e o endereço na linha de baixo.
    else if (/📍/.test(line) && lines[index + 1] && /\d/.test(lines[index + 1]) && !/^https?:/i.test(lines[index + 1].trim())) endereco = lines[index + 1];
    endereco = endereco.replace(/\*/g, "").replace(/^\s*(na|no|em)\s+/i, "").trim().replace(/[.!;,]+$/, "");
    if (!endereco) return;
    if (!found.some((store) => compact(store.nome) === compact(nome) && compact(store.enderecoCompleto) === compact(endereco))) found.push({ lojaId: null, nome, cidade, enderecoCompleto: endereco });
  });
  return found;
}

/**
 * Âncora a partir das mensagens da IA desta sessão (mais antigas primeiro): o produto é o da ficha mais recente;
 * a loja é a da mensagem mais recente que cita lojas com endereço, só quando ela cita exatamente uma.
 */
export function extractSessionAnchor(aiMessages: AnchorMessage[]): SessionAnchor {
  let activeProduct: ActiveProduct | null = null;
  let activeStore: ActiveStore | null = null;
  let storeDecided = false;
  for (let index = aiMessages.length - 1; index >= 0; index -= 1) {
    const message = aiMessages[index];
    if (!activeProduct) activeProduct = productFrom(message);
    if (!storeDecided) {
      const stores = storesIn(message.text);
      if (stores.length) {
        storeDecided = true;
        if (stores.length === 1) activeStore = stores[0];
      }
    }
    if (activeProduct && storeDecided) break;
  }
  // A foto do produto pode ter ido numa mensagem sem a ficha (legenda dividida): vale a mais recente do mesmo modelo.
  if (activeProduct && !activeProduct.sku) {
    const withPhoto = [...aiMessages].reverse().find((message) => message.imageSku);
    if (withPhoto && productFrom(withPhoto)?.nomeComercial === activeProduct.nomeComercial) activeProduct = { ...activeProduct, sku: withPhoto.imageSku!, ultimaFotoEnviadaUrl: withPhoto.imageUrl || null };
  }
  return { activeProduct, activeStore };
}

/** Números de modelo de 4 dígitos ("RB3025", "0RB3025", "3025") citados num texto. */
export function modelNumbers(text: string) {
  return [...norm(text).matchAll(/(?:^|[^A-Z0-9])0?(?:[A-Z]{2,3})?\s?(\d{4})[A-Z]?(?![0-9])/g)].map((match) => match[1]);
}

/** O cliente pediu mais sobre o modelo ("mais detalhes", "como ele é?", "fala mais dele"). */
export function asksProductDetails(text: string) {
  return /\bmais\s+(detalhes?|informa[cç](?:ão|ao|ões|oes)|infos?)\b|\bdetalh(?:e|es|a|ar)\b|\bcomo\s+(?:ele|ela)\s+(?:[eé]|fica)(?![\p{L}])|\bcomo\s+[eé]\s+(?:ele|ela|esse|essa)\b|\bfal[ae]\s+mais\b|\bconta\s+mais\b|\bsobre\s+(?:ele|ela|esse|essa)\b|\bcaracter[ií]stic|\bmateria(?:l|is)\b|\bmedidas?\b|\bespecifica[cç]/iu.test(text);
}

/** Palavras comuns que também são chaves de marca e não identificam outro produto. */
const WEAK_BRANDS = new Set(["META", "POLO", "JULIO", "COACH", "D&G"]);

/** A mensagem cita outro modelo (referência ou apelido diferente) ou outra marca que não a do produto fixado. */
export function mentionsOtherProduct(text: string, product: ActiveProduct) {
  const own = modelNumbers(`${product.referencia ?? ""} ${expandModelNicknames(product.nomeComercial)}`);
  const cited = modelNumbers(expandModelNicknames(text));
  if (cited.some((number) => !own.includes(number))) return true;
  const ownBrand = compact(product.marca ?? product.nomeComercial);
  const hay = words(text);
  return KNOWN_BRANDS.some((brand) => {
    if (WEAK_BRANDS.has(brand)) return false;
    const key = compact(brand);
    if (ownBrand.includes(key) || key.includes(ownBrand)) return false;
    return hay.includes(` ${norm(brand).replace(/[^A-Z0-9]+/g, " ").trim()} `) || (key.length >= 6 && hay.replace(/ /g, "").includes(key));
  });
}

/** Follow-up do produto fixado: pede detalhes sem citar outro modelo. */
export function isProductFollowUp(text: string, anchor: SessionAnchor) {
  return !!anchor.activeProduct && asksProductDetails(text) && !mentionsOtherProduct(text, anchor.activeProduct);
}

/** O cliente pediu localização/endereço/como chegar. */
export function asksStoreLocation(text: string) {
  return /\blocaliza[cç](?:ão|ao)\b|\bendere[cç]o\b|\bmapa\b|\bcomo\s+(?:eu\s+)?(?:chego|chegar|fa[cç]o\s+(?:pra|para)\s+chegar)\b|\bonde\s+(?:fica\b|[eé](?![\p{L}]))|\bpin\b/iu.test(text);
}

/** Pedido no singular ("a loja", "essa loja"): sem "lojas", "unidades", "outra loja". */
export function refersToSingleStore(text: string) {
  return !/\b(lojas|unidades|filiais|outras?\s+(?:loja|unidade)s?|todas)\b/i.test(text);
}

/** O cliente nomeou um lugar ("loja do Setor Bueno", "no shopping", "Rua 95"): quem decide é o nome citado. */
export function namesAnotherPlace(text: string) {
  return /\bloja\s+(?:do|da|de|no|na|em)\s+\p{L}/iu.test(text) || /\b(setor|bairro|shopping|avenida|av\.|rua|jardim|parque|vila|centro)\b/i.test(text);
}

/** Follow-up da loja fixada: localização pedida no singular, sem nomear outro lugar, com uma loja já informada nesta sessão. */
export function isStoreFollowUp(text: string, anchor: SessionAnchor) {
  return !!anchor.activeStore && asksStoreLocation(text) && refersToSingleStore(text) && !namesAnotherPlace(text);
}

/** Texto da âncora para o prompt (dados do atendimento atual, nunca regra). */
export function anchorPromptBlock(anchor: SessionAnchor) {
  const lines: string[] = [];
  if (anchor.activeProduct) {
    const product = anchor.activeProduct;
    lines.push(`- activeProduct: ${product.nomeComercial}${product.referencia ? ` | Ref. ${product.referencia}` : ""}${product.sku ? ` | SKU ${product.sku}` : ""}${product.ultimaFotoEnviadaUrl || product.sku ? " | foto já enviada" : ""}`);
  }
  if (anchor.activeStore) lines.push(`- activeStore: ${anchor.activeStore.nome} — ${anchor.activeStore.enderecoCompleto}${anchor.activeStore.cidade ? ` (${anchor.activeStore.cidade})` : ""}`);
  if (!lines.length) return "";
  return ["ÂNCORA DO ATENDIMENTO ATUAL (fixada no código a partir das suas mensagens desta sessão):", ...lines].join("\n");
}

/** Regra fixa do prompt: nunca misturar modelos nem reabrir a lista de lojas quando a loja já foi informada. */
export const SESSION_ANCHOR_RULES = [
  "ÂNCORA DA SESSÃO (regra fixa):",
  "- Cada atendimento começa do zero: use só a conversa atual. Nunca traga produtos, lojas ou fotos de atendimentos anteriores.",
  "- Antes de responder sobre detalhes, material, formato ou lentes de um produto, confira o activeProduct (o modelo fixado nesta conversa). Quando o cliente pedir \"mais detalhes\", \"como ele é?\" ou \"fala mais dele\" sem citar outro modelo, consulte e descreva SOMENTE o activeProduct (mesma referência). Nunca misture características de outro modelo (ex.: atribuir nylon/formato quadrado do Justin a um Aviator de metal) e nunca envie foto de outro modelo.",
  "- Se você já informou uma loja com endereço específico (ex.: Rua 9, 2106) e o cliente pedir a localização \"da loja\" / \"dessa loja\", envie a localização desse exato endereço (enviarLocalizacaoLoja com o nome e a rua da activeStore, ex.: \"Setor Marista Rua 9 2106\") sem abrir nova lista de unidades.",
].join("\n");
