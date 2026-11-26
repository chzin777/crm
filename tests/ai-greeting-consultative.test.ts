import { describe, expect, it } from "vitest";
import { consultativeGreeting } from "@/lib/ai/response-opening";
import { loadPromptModule } from "./helpers/prompt-seed";


// 08:59 em Brasília (UTC−3).
const morning = new Date("2026-11-25T11:59:00Z");

describe("saudação inicial consultiva", () => {
  it("\"oooi\" com resposta passiva \"Tô por aqui\" → bom dia com nome e pergunta consultiva", () => {
    const reply = consultativeGreeting("Oi, Christofer! Tô por aqui 😊", { first: true, name: "Christofer", pendingText: "oooi", now: morning });
    expect(reply).toBe("Bom dia, Christofer! Tudo bem? Como posso te ajudar hoje? Está procurando óculos de sol, armação de grau ou quer saber sobre alguma de nossas lojas?");
    expect(reply).not.toMatch(/t[ôo] por aqui/i);
    expect(reply).not.toMatch(/[—–]| - /);
  });

  it("resposta só com cumprimento ou \"à disposição\" também é corrigida; sem nome válido, saúda sem nome", () => {
    expect(consultativeGreeting("Olá!", { first: true, name: "", pendingText: "bom dia", now: morning })).toMatch(/^Bom dia! Tudo bem\? .*\?$/);
    expect(consultativeGreeting("Estou à disposição.", { first: true, name: null, pendingText: "olá", now: morning })).toContain("óculos de sol");
  });

  it("resposta já consultiva do modelo é mantida; mensagem com pedido não é tocada", () => {
    const good = "Bom dia, Christofer! Tudo certo? Você procura óculos de sol, armação de grau ou lentes de contato?";
    expect(consultativeGreeting(good, { first: true, name: "Christofer", pendingText: "oooi", now: morning })).toBe(good);
    expect(consultativeGreeting("Oi, Michel! Me conta o que você está procurando.", { first: true, name: "Michel", pendingText: "oii", now: morning })).toBe("Oi, Michel! Me conta o que você está procurando.");
    expect(consultativeGreeting("Tô por aqui", { first: true, name: "Christofer", pendingText: "quero um ray ban", now: morning })).toBe("Tô por aqui");
  });

  it("turno já saudado: frase passiva vira só a pergunta; retomada de assunto sem pergunta fica", () => {
    expect(consultativeGreeting("Tô por aqui 😊", { first: false, name: "Christofer", pendingText: "oi", now: morning })).toMatch(/^Como posso te ajudar hoje\?/);
    expect(consultativeGreeting("Sobre o Ray-Ban que te mostrei, ele segue disponível.", { first: false, pendingText: "oi", now: morning })).toBe("Sobre o Ray-Ban que te mostrei, ele segue disponível.");
  });

  it("prompt de saudação proíbe resposta passiva e travessões e pede pergunta consultiva", () => {
    const prompt = loadPromptModule("saudacao");
    expect(prompt).toContain("tô por aqui");
    expect(prompt).toContain("óculos de sol, armação de grau");
    expect(prompt).toContain("travessões");
  });
});
