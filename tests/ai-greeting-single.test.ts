import { describe, expect, it } from "vitest";
import { buildSystemPrompt, formatContext, greetingName } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { fixDoubleGreeting, splitAiResponseMessages } from "@/lib/ai/bubbles";
import { GREETING_RULES, SEED_MODULES } from "./helpers/prompt-seed";

describe("saudação sem nome real de exemplo no prompt", () => {
  it("system prompt não traz nomes hardcoded nos templates de saudação, só o marcador <PRIMEIRO_NOME>", () => {
    for (const firstReply of [true, false]) {
      const prompt = buildSystemPrompt({ modules: SEED_MODULES, settings: DEFAULT_AI_SETTINGS, info: "", firstReply });
      expect(prompt).not.toMatch(/Christofer/i);
      // saudacao.md só entra no primeiro turno; depois, o núcleo proíbe abrir com "Boa tarde"/"Oi" de novo.
      if (firstReply) expect(prompt).toContain("SAUDAÇÃO (primeira resposta desta conversa)");
      else expect(prompt).toContain("SEM SAUDAÇÃO REPETIDA");
    }
  });

  it.each([
    ["Christofer Silva", "Christofer"],
    ["maria clara", "Maria"],
    ["", ""],
    [null, ""],
    ["5562999998888", ""],
    ["+55 (62) 99999-8888", ""],
    ["😎🔥", ""],
    ["Ju", ""],
    ["Cliente", ""],
  ])("primeiro nome para saudação de %j → %j", (name, expected) => {
    expect(greetingName(name)).toBe(expected);
  });

  it("se a IA copiar o marcador, o cliente recebe a saudação limpa", () => {
    expect(splitAiResponseMessages("Boa tarde, <PRIMEIRO_NOME>! 😊 Em que posso te ajudar?")).toEqual(["Boa tarde! 😊 Em que posso te ajudar?"]);
    expect(splitAiResponseMessages("Oi <PRIMEIRO_NOME>, tudo bem?")).toEqual(["Oi, tudo bem?"]);
  });

  it("contato sem nome: contexto manda saudar sem nome, sem inventar", () => {
    const base = { queueName: null, subject: "", includeHistory: false, history: null, conversation: "Cliente: oi" };
    const noName = formatContext({ ...base, contactName: "5562999998888" });
    expect(noName).toContain("Primeiro nome para a saudação: (sem nome válido: saúde sem nome)");
    expect(noName).not.toMatch(/Christofer|<PRIMEIRO_NOME>/);
    expect(formatContext({ ...base, contactName: "Ana Paula" })).toContain("Primeiro nome para a saudação: Ana");
  });
});

describe("saudação única", () => {
  it("corrige dupla saudação no início da resposta", () => {
    expect(fixDoubleGreeting("Boa tarde! Oi, Christofer 😊")).toBe("Boa tarde, Christofer 😊");
    expect(fixDoubleGreeting("Boa tarde! Oi Christofer! Como posso te ajudar?")).toBe("Boa tarde, Christofer! Como posso te ajudar?");
    expect(fixDoubleGreeting("Bom dia! Olá! Tudo ótimo por aqui, e com você?")).toBe("Bom dia! Tudo ótimo por aqui, e com você?");
    expect(fixDoubleGreeting("Olá! Bom dia, Maria! Em que posso te ajudar?")).toBe("Bom dia, Maria! Em que posso te ajudar?");
    expect(fixDoubleGreeting("Oi, boa noite, Ana!")).toBe("Boa noite, Ana!");
    // Saudação única fica como está; "oi" no meio do texto não é mexido.
    for (const ok of ["Boa tarde, Christofer! 😊 Como posso te ajudar hoje?", "Oi, Christofer! 😊 Em que posso te ajudar?", "Boa tarde! Oito unidades disponíveis."]) expect(fixDoubleGreeting(ok)).toBe(ok);
    expect(splitAiResponseMessages("Boa tarde! Oi, Christofer 😊 Em que posso te ajudar?")).toEqual(["Boa tarde, Christofer 😊 Em que posso te ajudar?"]);
  });

  it("prompt proíbe duas saudações juntas e não traz frase pronta para copiar", () => {
    const prompt = buildSystemPrompt({ modules: SEED_MODULES, settings: DEFAULT_AI_SETTINGS, info: "", firstReply: true });
    expect(prompt).toContain(GREETING_RULES.split("{{")[0]);
    for (const piece of ["Uma saudação só", "sem nome válido, cumprimente sem nome e sem inventar um", "com palavras suas e diferentes a cada conversa"]) expect(GREETING_RULES).toContain(piece);
    // Nenhum modelo de frase entre aspas (o modelo tende a copiar literalmente).
    expect(GREETING_RULES).not.toMatch(/"[^"]{12,}"/);
  });
});
