import { describe, expect, it } from "vitest";
import { buildSystemPrompt, formatContext, greetingName, GREETING_RULES } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { fixDoubleGreeting, splitAiResponseMessages } from "@/lib/ai/bubbles";

describe("saudação sem nome real de exemplo no prompt", () => {
  it("system prompt não traz nomes hardcoded nos templates de saudação, só o marcador <PRIMEIRO_NOME>", () => {
    for (const firstReply of [true, false]) {
      const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "", firstReply });
      expect(prompt).not.toMatch(/Christofer/i);
      expect(prompt).toContain("Boa tarde, <PRIMEIRO_NOME>! 😊");
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

  it("prompt proíbe duas saudações juntas e traz os exemplos", () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain(GREETING_RULES);
    for (const piece of ["SAUDAÇÃO ÚNICA", "CONTATO SEM NOME", "Boa tarde! 😊 Em que posso te ajudar?", "NUNCA copie nomes de exemplos", "PROIBIDO juntar duas saudações", "\"Boa tarde! Oi, <PRIMEIRO_NOME>\"", "Boa tarde, <PRIMEIRO_NOME>! 😊 Em que posso te ajudar?", "Tudo ótimo por aqui, e com você? 😊"]) expect(GREETING_RULES).toContain(piece);
  });
});
