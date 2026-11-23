/**
 * Mensagem vaga, curta ou acidental ("aa", "?", "k", "ok", "hmm", uma letra, emoji solto): não dá para entender
 * um pedido. A IA reage como gente, em cima do que a loja tinha dito, sem fingir que entendeu nem puxar catálogo.
 * Sem banco: testável.
 */
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Respostas curtas que têm sentido próprio (confirmação/negação): dependem da pergunta anterior, não são "cortadas". */
const SHORT_ANSWERS = /^(ok+|okay|blz|beleza|sim+|s|nao+|n|ja|ta|tá|certo|pode|claro|obg|obrigad[oa]|vlw|valeu|show|top|bom|boa)$/;

export type VagueKind = "accidental" | "short_answer" | null;

export function classifyVague(text: string): VagueKind {
  const raw = text.trim();
  if (!raw) return null;
  const letters = plain(raw).replace(/[^a-z0-9]/g, "");
  if (SHORT_ANSWERS.test(plain(raw).replace(/[^a-z\s]/g, "").trim())) return "short_answer";
  // Só pontuação/emoji/símbolos, ou 1 a 3 caracteres sem sentido ("aa", "k", "?", "hm", "ss" é tratado acima).
  if (!letters) return "accidental";
  if (letters.length <= 3 && !/^\d+$/.test(letters)) return "accidental";
  // Letra repetida ("aaaa", "kkkk" é risada e vem antes como ruído) ou teclado esmagado curto.
  if (/^(.)\1{2,}$/.test(letters) && letters.length <= 8) return "accidental";
  return null;
}

/** Bloco do prompt para o turno com mensagem vaga. */
export function vagueMessageBlock(kind: VagueKind) {
  if (kind === "accidental") {
    return "MENSAGEM VAGA NESTE TURNO: o cliente mandou algo sem conteúdo claro (parece acidental ou cortado). Releia a última mensagem da loja e reaja como uma pessoa no WhatsApp: comente com leveza que a mensagem parece ter cortado/chegado incompleta e retome o assunto que estava em aberto, com o primeiro nome se houver. NÃO diga \"Entendi\", não mude de assunto e não ofereça catálogo.";
  }
  if (kind === "short_answer") {
    return "RESPOSTA CURTA NESTE TURNO (sim/ok/não/beleza...): é a resposta à última coisa que a loja disse ou perguntou. Interprete em cima daquilo e siga a conversa a partir dali (confirme, dê o próximo passo ou agradeça), sem reiniciar o atendimento e sem perguntas genéricas de qualificação.";
  }
  return "";
}
