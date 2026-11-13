import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STORE_QUESTION, splitAiResponseMessages, tidyBubble, BUBBLE_DELAY_MAX_MS, BUBBLE_DELAY_MIN_MS, BUBBLE_SPLIT, bubbleDelay, FORMAT_RULES, joinBubbles, sendBubbles, splitBubbles } from "@/lib/ai/bubbles";
import { buildSystemPrompt, customerMessages, interpretDecision } from "@/lib/ai/agent-core";
import { deliverImageOrText } from "@/lib/ai/product-image";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

const LIST = "Temos o *Ray-Ban Meta* disponível nestas unidades:\n\n📍 *Goiânia*\n• *Setor Bueno* — Av. T-8, 235\n\n📍 *Águas Claras (DF)*\n• *Areal* — QS 1, Rua 210";
const QUESTION = "Qual dessas lojas fica mais fácil pra você ir experimentar?";

describe("divisão da resposta em bolhas", () => {
  it("---SPLIT--- vira 2 mensagens limpas, sem vazar o separador", () => {
    const parts = splitBubbles(`${LIST}\n\n${BUBBLE_SPLIT}\n\n${QUESTION}`);
    expect(parts).toEqual([LIST, QUESTION]);
    expect(parts.join(" ")).not.toMatch(/split/i);
    // Variações do separador também são aceitas.
    expect(splitBubbles(`Lista\n--- split ---\nPergunta?`)).toEqual(["Lista", "Pergunta?"]);
    expect(splitBubbles(`Lista\n-----SPLIT-----Pergunta?`)).toEqual(["Lista", "Pergunta?"]);
  });

  it("resposta sem separador segue numa bolha; partes vazias somem; no máximo 3", () => {
    expect(splitBubbles("Tudo ótimo por aqui, e com você?")).toEqual(["Tudo ótimo por aqui, e com você?"]);
    expect(splitBubbles(`${BUBBLE_SPLIT}\nOi!\n${BUBBLE_SPLIT}\n${BUBBLE_SPLIT}`)).toEqual(["Oi!"]);
    expect(splitBubbles(`a ${BUBBLE_SPLIT} b ${BUBBLE_SPLIT} c ${BUBBLE_SPLIT} d`)).toEqual(["a", "b", "c d"]);
    expect(joinBubbles(`A ${BUBBLE_SPLIT} B`)).toBe("A\n\nB");
  });

  it("resposta só com o separador conta como vazia (vai para a equipe)", () => {
    expect(interpretDecision({ action: "reply", reply: BUBBLE_SPLIT })).toMatchObject({ action: "handoff", trigger: "no_reply" });
  });

  it("o teste da página /ia recebe cada bolha como uma mensagem", () => {
    const outcome = interpretDecision({ action: "reply", reply: `${LIST}\n${BUBBLE_SPLIT}\n${QUESTION}` });
    expect(customerMessages(outcome, { handoffMessage: "" }, {})).toEqual([LIST, QUESTION]);
  });
});

describe("envio sequencial no WhatsApp", () => {
  it("2 requisições na Cloud API na ordem, com digitando e pausa de 600 a 1000 ms entre elas", async () => {
    const calls: string[] = [];
    const meta = vi.fn(async (body: { type: string; text?: { body: string }; status?: string }) => {
      calls.push(body.status === "read" ? "typing" : `${body.type}:${body.text?.body ?? ""}`);
      return { messages: [{ id: `wamid.${calls.length}` }] };
    });
    const sleeps: number[] = [];
    const sent = await sendBubbles(splitBubbles(`${LIST}\n${BUBBLE_SPLIT}\n${QUESTION}`), {
      sendFirst: (text) => meta({ type: "text", text: { body: text } }),
      sendNext: (text) => meta({ type: "text", text: { body: text } }),
      typing: () => meta({ type: "", status: "read" }),
      sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(sent).toBe(2);
    expect(calls).toEqual([`text:${LIST}`, "typing", `text:${QUESTION}`]);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(BUBBLE_DELAY_MIN_MS);
    expect(sleeps[0]).toBeLessThanOrEqual(BUBBLE_DELAY_MAX_MS);
    expect(bubbleDelay(() => 0)).toBe(600);
    expect(bubbleDelay(() => 1)).toBe(1000);
  });

  it("foto com legenda na primeira bolha e a pergunta logo depois em texto; falha do digitando não interrompe", async () => {
    const order: string[] = [];
    await sendBubbles(splitBubbles(`${LIST}\n${BUBBLE_SPLIT}\n${QUESTION}`), {
      sendFirst: (text) => deliverImageOrText({ sendImage: async (caption) => { order.push(`image:${caption}`); }, sendText: async (t) => { order.push(`text:${t}`); }, invalidate: async () => undefined }, text),
      sendNext: async (text) => { order.push(`text:${text}`); },
      typing: async () => { throw new Error("Meta fora"); },
      sleep: async () => undefined,
    });
    expect(order).toEqual([`image:${LIST}`, `text:${QUESTION}`]);
  });
});

describe("regras fixas de formatação e cadência no prompt", () => {
  it("agrupamento por cidade/região, negrito do WhatsApp e pergunta final em bolha separada", () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain(FORMAT_RULES);
    expect(prompt).toContain("agrupe por cidade/região");
    expect(prompt).toContain("nunca misture DF com Goiás");
    expect(prompt).toContain("📍 *Cidade*");
    expect(prompt).toContain("• *Nome da loja* — endereço");
    expect(prompt).toContain(`escreva ${BUBBLE_SPLIT} (sozinho numa linha) antes da pergunta final`);
    expect(prompt).toContain("No máximo 5 lojas".replace("No", "no"));
  });
});

describe("segunda bolha garantida (splitAiResponseMessages)", () => {
  const STORES = "Temos o *Ray-Ban Meta* disponível nestas unidades:\n\n📍 *Goiânia*\n• *Loja Setor Bueno* — Av. T-8 esq. com Rua 27, 235\n• *Loja Setor Marista* — Rua 135 esq. com Av. Americano do Brasil, 208";

  it("com ---SPLIT--- (e variações [SPLIT] e linha ---): 2 mensagens limpas na ordem", () => {
    const ask = "Qual dessas lojas fica melhor pra você? Assim já te passo os detalhes do modelo certo!";
    for (const sep of ["\n\n---SPLIT---\n\n", "\n[SPLIT]\n", "\n---\n"]) {
      const parts = splitAiResponseMessages(`${STORES}${sep}${ask}`);
      expect(parts).toEqual([STORES, ask]);
      expect(parts.join("\n")).not.toMatch(/SPLIT|^---$/m);
    }
  });

  it("lista de lojas sem ---SPLIT--- e com pergunta no último parágrafo: a pergunta vira a 2ª bolha", () => {
    expect(splitAiResponseMessages(`${STORES}\n\nQual dessas fica mais fácil pra você ir?`)).toEqual([STORES, "Qual dessas fica mais fácil pra você ir?"]);
    // Pergunta colada na última linha da lista (sem linha em branco) também é separada.
    expect(splitAiResponseMessages(`${STORES}\nQual delas prefere?`)).toEqual([STORES, "Qual delas prefere?"]);
  });

  it("só a lista de lojas, sem pergunta final: injeta a pergunta de condução como 2ª bolha", () => {
    expect(splitAiResponseMessages(STORES)).toEqual([STORES, DEFAULT_STORE_QUESTION]);
    expect(splitAiResponseMessages(`${STORES}\n\nTodas abrem às 9h.`)).toEqual([`${STORES}\n\nTodas abrem às 9h.`, DEFAULT_STORE_QUESTION]);
  });

  it("resposta comum (sem lista de lojas) não ganha pergunta extra", () => {
    expect(splitAiResponseMessages("Abrimos sábado das 9h às 13h.")).toEqual(["Abrimos sábado das 9h às 13h."]);
    expect(splitAiResponseMessages("A loja do Bueno fica na Av. T-8, 235. Quer que eu veja outro modelo?")).toHaveLength(1);
  });

  it("sem ---SPLIT---: informação + oferta/pergunta em parágrafos separados viram 2 bolhas limpas", () => {
    const info = "No momento não temos modelos *Versace* em estoque na rede.";
    const offer = "Se quiser, posso te encaminhar para um atendente verificar encomenda ou opções parecidas.";
    expect(splitAiResponseMessages(`${info}\n\n${offer}`)).toEqual([info, offer]);
    expect(splitAiResponseMessages(`${info}\n\n\n\nQuer que eu veja modelos parecidos?`)).toEqual([info, "Quer que eu veja modelos parecidos?"]);
    expect(splitAiResponseMessages(`Abrimos sábado das 9h às 13h.\n\nPosso te passar a loja mais perto?`)).toEqual(["Abrimos sábado das 9h às 13h.", "Posso te passar a loja mais perto?"]);
    // Último parágrafo informativo (sem pergunta/oferta): segue numa bolha, sem linha em branco no meio.
    expect(splitAiResponseMessages("Abrimos sábado.\n\nDomingo fechamos.")).toEqual(["Abrimos sábado. Domingo fechamos."]);
  });

  it("com ---SPLIT--- explícito: 2 mensagens sem linhas vazias sobrando", () => {
    const parts = splitAiResponseMessages("No momento não temos modelos *Versace* em estoque na rede.\n\n\n---SPLIT---\n\n\nSe quiser, posso te encaminhar para um atendente.\n\nO que acha?");
    expect(parts).toEqual(["No momento não temos modelos *Versace* em estoque na rede.", "Se quiser, posso te encaminhar para um atendente. O que acha?"]);
    for (const part of parts) expect(part).not.toMatch(/\n\s*\n|^\s|\s$/);
  });

  it("bolha com lista mantém as quebras (no máximo uma linha em branco)", () => {
    expect(tidyBubble("*Ray-Ban*\nÓculos leve\n\n\n\n📍 *Goiânia*\n• *Loja Bueno* — Av. T-8")).toBe("*Ray-Ban*\nÓculos leve\n\n📍 *Goiânia*\n• *Loja Bueno* — Av. T-8");
  });

  it("prompt: regra para toda resposta com o exemplo Versace e proibição de linha em branco em mensagem curta", () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain("VALE PARA TODA RESPOSTA (não só listas de lojas)");
    expect(prompt).toContain("No momento não temos modelos *Versace* em estoque na rede.\n---SPLIT---\nSe quiser, posso te encaminhar para um atendente verificar encomenda ou opções parecidas. O que acha?");
    expect(prompt).toContain("Proibido usar linha em branco (quebra dupla) para separar frases dentro da mesma mensagem curta");
  });

  it("prompt traz a regra obrigatória com o exemplo literal do ---SPLIT---", () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain("REGRA OBRIGATÓRIA DE DUAS MENSAGENS");
    expect(prompt).toContain("• *Loja Setor Marista* — Rua 135 esq. com Av. Americano do Brasil, 208\n\n---SPLIT---\n\nQual dessas lojas fica melhor pra você?");
  });
});
