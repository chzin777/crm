/**
 * Pedido para falar com um atendente/vendedor pelo nome ("Leandro", "Preciso falar com Leandro", "Falar com a Ana").
 * Puro (sem banco): a lista de colaboradores entra por parâmetro. Um nome solto nunca é tratado como o nome do
 * próprio cliente, a menos que ele diga "meu nome é..." / "aqui é o...".
 */

/** Colaborador ativo do CRM e a fila principal dele (a primeira, na ordem das filas). */
export type StaffMember = { id: string; name: string; queueId: string | null; queueName: string | null };
export type StaffRequest = { name: string; staff: StaffMember | null };

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const firstName = (name: string) => plain(name).split(" ")[0] ?? "";

/** O cliente se apresentando: aí o nome é dele mesmo. */
const SELF_INTRO = /\b(meu nome e|me chamo|aqui e (o|a)|aqui quem fala e|quem fala e|sou (o|a)|eu sou)\b/;
/** Verbos de pedido de pessoa ("preciso falar com", "chama o", "cadê a"). */
const ASKS = /\b(falar|fala|conversar|chamar|chama|chame|atendimento|atendid[oa]|atender|atende|quero|queria|preciso|precisava|procuro|procurando|cade|transfere|transferir|passa|passar)\b/;
/** Palavras que podem aparecer junto do nome sem mudar o pedido. */
const FILLERS = new Set(["o", "a", "com", "oi", "ola", "bom", "boa", "dia", "tarde", "noite", "por", "favor", "pf", "pfv", "pfvr", "e", "ai", "ei", "hey", "seu", "sr", "sra", "ta", "esta", "pode", "ser", "obrigado", "obrigada", "de", "novo", "pra", "para", "mim"]);
/** Depois de "falar com": não é nome de pessoa. */
const NOT_NAMES = new Set([
  "atendente", "atendentes", "alguem", "uma", "um", "pessoa", "humano", "humana", "vendedor", "vendedora", "vendedores", "gerente", "responsavel", "voce", "vc", "voces", "ele", "ela",
  "eles", "elas", "loja", "setor", "financeiro", "suporte", "equipe", "time", "dono", "dona", "senhor", "senhora", "moca", "moco", "rapaz", "menina", "pessoal", "robo", "bot", "ia", "operador",
  "consultor", "consultora", "otica", "oticas", "brasil", "comercial", "vendas", "sac", "ouvidoria", "medico", "medica", "doutor", "doutora", "dr", "dra", "voces", "vcs", "mesmo", "mesma", "ja", "agora",
  "isso", "esse", "essa", "sobre", "meu", "minha", "receita", "pedido", "oculos", "lente", "lentes", "armacao", "urgente", "rapido", "hoje", "amanha", "aqui", "la", "quem", "nao", "sim",
  "sua", "seu", "teu", "tua", "nosso", "nossa", "todos", "ninguem", "algum", "alguma", "comigo", "atendimento", "ate", "mais", "outro", "outra", "certo", "cliente", "voceis",
]);

/** Colaborador pelo nome: nome completo primeiro, depois o primeiro nome (só se for único). */
export function matchStaff(staff: StaffMember[], query: string): StaffMember | null {
  const wanted = plain(query);
  if (!wanted) return null;
  const full = staff.filter((member) => plain(member.name) === wanted || (wanted.includes(" ") && plain(member.name).startsWith(`${wanted} `)));
  if (full.length === 1) return full[0];
  const byFirst = staff.filter((member) => firstName(member.name) === wanted.split(" ")[0]);
  if (byFirst.length === 1) return byFirst[0];
  // Dois "Leandro": o sobrenome citado decide.
  const second = wanted.split(" ")[1];
  const narrowed = second ? byFirst.filter((member) => plain(member.name).split(" ").includes(second)) : [];
  return narrowed.length === 1 ? narrowed[0] : null;
}

/** Nome como o cliente escreveu, com a inicial maiúscula ("leandro" → "Leandro"). */
function displayName(original: string, word: string) {
  const token = original.split(/[^\p{L}]+/u).find((part) => plain(part) === word) ?? word;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Pedido de pessoa específica na mensagem do cliente:
 * - nome de colaborador cadastrado, solto ("Leandro", "Oi Leandro") ou com pedido ("Preciso falar com Leandro");
 * - nome não cadastrado só com pedido explícito ("falar com a Ana", vendedor da loja física).
 * Nome do próprio cliente sozinho ou apresentação ("meu nome é...") não contam.
 */
export function detectStaffRequest(text: string, staff: StaffMember[], contactName?: string | null): StaffRequest | null {
  const clean = plain(text);
  if (!clean || SELF_INTRO.test(clean)) return null;
  const words = clean.split(" ");
  if (words.length > 10) return null;
  const asks = ASKS.test(clean);
  const contactFirst = contactName ? firstName(contactName) : "";
  const content = words.filter((word) => !FILLERS.has(word));
  // Nome solto: depois de tirar saudação e "o/a/com", sobra só o nome (ou nome + sobrenome).
  const bare = content.length >= 1 && content.length <= 2 && !content.some((word) => ASKS.test(word));
  // Com pedido: só a primeira palavra logo depois do último verbo (+ sobrenome): "preciso falar com o Leandro" →
  // "leandro"; "quero ver armação rosa" não chama a Rosa.
  const verbAt = words.reduce((last, word, index) => (ASKS.test(word) ? index : last), -1);
  const afterVerb = verbAt >= 0 ? words.slice(verbAt + 1).filter((word) => !FILLERS.has(word) && word !== "do" && word !== "da").slice(0, 2) : [];
  // Nome solto com 2 palavras só vale como nome + sobrenome do colaborador ("tem rosa?" não chama a Rosa).
  if (!asks && bare && content.length === 2) {
    const member = matchStaff(staff, content.join(" "));
    return member && plain(member.name).split(" ").includes(content[1]) ? { name: member.name.split(" ")[0], staff: member } : null;
  }
  const candidates = asks ? afterVerb : bare ? content : [];
  for (let index = 0; index < Math.min(candidates.length, 1); index += 1) {
    const word = candidates[index];
    if (word.length < 3 || NOT_NAMES.has(word)) continue;
    if (!asks && word === contactFirst) return null;
    const pair = candidates[index + 1] ? `${word} ${candidates[index + 1]}` : word;
    const member = matchStaff(staff, pair) ?? matchStaff(staff, word);
    if (member) return { name: member.name.split(" ")[0], staff: member };
  }
  // Fora do cadastro (vendedor da loja): só com pedido explícito "falar/conversar/chamar com <nome>".
  const explicit = clean.match(/\b(?:falar|fala|conversar|atendid[oa]|atendimento)\s+com\s+(?:o\s+|a\s+)?([a-z]{3,})\b/);
  const name = explicit?.[1];
  if (name && !NOT_NAMES.has(name) && name !== "com") return { name: displayName(text, name), staff: null };
  return null;
}

/** Primeiro nome do contato para a saudação (nomes genéricos ou números ficam de fora). */
export function contactFirstName(contactName?: string | null) {
  const first = (contactName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}{2,}$/u.test(first) || /^(cliente|contato|whatsapp|teste|usuario|usuário)$/i.test(first)) return "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Artigo pelo final do nome ("o Leandro", "a Ana"). */
const article = (name: string) => (/a$/i.test(name) ? "a" : "o");

/** Confirmação obrigatória antes de transferir para a pessoa pedida (nunca transferência silenciosa). */
export function staffConfirmation(contactName: string | null | undefined, staffName: string) {
  const first = contactFirstName(contactName);
  return `Claro${first ? `, ${first}` : ""}! Vou te transferir agora mesmo para falar com ${article(staffName)} ${staffName}. Só um instante! 😊`;
}

/** Aviso padrão de transferência quando a empresa não configurou mensagem própria. */
export function defaultHandoffNotice(contactName?: string | null) {
  const first = contactFirstName(contactName);
  return `Claro${first ? `, ${first}` : ""}! Vou te transferir agora mesmo para um dos nossos atendentes. Só um instante! 😊`;
}

/** Regra fixa do prompt: nome solto é do atendente pedido, nunca do cliente; nada de transferência silenciosa. */
export const STAFF_NAME_RULES = [
  "NOMES PRÓPRIOS E TRANSFERÊNCIA (regras fixas):",
  '- Nunca presuma que um nome próprio solto enviado pelo cliente (ex.: "Leandro") é o nome do próprio cliente, principalmente se você já o chamou pelo nome dele. Um nome solto depois da saudação geralmente é o vendedor/atendente com quem o cliente quer falar. Só trate como nome do cliente se ele disser "Meu nome é..." ou "Aqui é o...".',
  "- Continue chamando o cliente pelo nome do cadastro; nunca troque pelo nome que ele citou.",
  "- Nunca faça transferência silenciosa: ao transferir para fila ou atendente (action \"handoff\"), escreva em reply a mensagem avisando o cliente que está transferindo.",
].join("\n");

/** Dica do turno: a mensagem é só um nome que não é o do cliente (vendedor de loja fora do cadastro). */
export function bareNameHint(text: string, contactName?: string | null) {
  const clean = plain(text);
  const words = clean.split(" ").filter((word) => word && !FILLERS.has(word));
  if (words.length !== 1 || words[0].length < 3 || NOT_NAMES.has(words[0]) || ASKS.test(words[0]) || SELF_INTRO.test(clean)) return "";
  const contact = contactFirstName(contactName);
  if (contact && plain(contact) === words[0]) return "";
  const name = displayName(text, words[0]);
  return `ATENÇÃO NESTE TURNO: a mensagem do cliente é uma palavra solta ("${name}"). Se for um nome próprio, NÃO é o nome do cliente${contact ? ` (ele se chama ${contact})` : ""}: provavelmente é o vendedor/atendente com quem ele quer falar. Pergunte se deseja falar com ${article(name)} ${name} ou transfira avisando em reply. Nunca chame o cliente de ${name}.`;
}
