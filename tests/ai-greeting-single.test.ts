import { describe, expect, it } from "vitest";
import { buildSystemPrompt, GREETING_RULES } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { fixDoubleGreeting, splitAiResponseMessages } from "@/lib/ai/bubbles";

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
    for (const piece of ["SAUDAÇÃO ÚNICA", "PROIBIDO juntar duas saudações", "\"Boa tarde! Oi, Christofer\"", "Boa tarde, Christofer! 😊 Em que posso te ajudar?", "Tudo ótimo por aqui, e com você? 😊"]) expect(GREETING_RULES).toContain(piece);
  });
});
