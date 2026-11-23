import { describe, expect, it } from "vitest";
import { sanitizeAiResponse } from "@/lib/ai/sanitize";

const NO_DASH_PUNCTUATION = /(^|[^\p{L}\p{N}])-|-($|[^\p{L}\p{N}])|[‒-―−]/mu;

describe("sanitizeAiResponse: nenhum travessão, meia-risca ou hífen como pontuação", () => {
  it.each([
    ["Temos sim — e chegou modelo novo essa semana!", "Temos sim, e chegou modelo novo essa semana!"],
    ["Temos sim—e chegou modelo novo", "Temos sim, e chegou modelo novo"],
    ["Perfeito – já separo pra você.", "Perfeito, já separo pra você."],
    ["Oi, Christofer - tudo certo com seus óculos?", "Oi, Christofer, tudo certo com seus óculos?"],
    ["Claro! — posso ver isso agora", "Claro! posso ver isso agora"],
    ["Funciona de segunda a sábado — 9h às 18h.", "Funciona de segunda a sábado, 9h às 18h."],
    ["Fica entre R$ 300–500 nessa linha", "Fica entre R$ 300 a 500 nessa linha"],
    ["Tudo certo --- já te mando", "Tudo certo, já te mando"],
    ["Ótimo 😊 — me conta a cidade?", "Ótimo 😊, me conta a cidade?"],
    ["Fechado, te espero —", "Fechado, te espero"],
    ["(— ou se preferir, passo amanhã)", "(ou se preferir, passo amanhã)"],
  ])("%s", (input, expected) => {
    const output = sanitizeAiResponse(input);
    expect(output).toBe(expected);
    expect(output).not.toMatch(NO_DASH_PUNCTUATION);
  });

  it("listas com traço viram linhas limpas", () => {
    const output = sanitizeAiResponse("Separei estas opções:\n- Ray-Ban Justin\n  – Oakley Holbrook\n— Prada PR 17WS\n• Vogue VO5286");
    expect(output).toBe("Separei estas opções:\nRay-Ban Justin\nOakley Holbrook\nPrada PR 17WS\nVogue VO5286");
    expect(output).not.toMatch(NO_DASH_PUNCTUATION);
  });

  it("preserva hífen dentro de palavras, telefones, códigos e endereços", () => {
    const text = "A Ray-Ban RB4165-601 tá na loja da Av. T-8, fone (27) 99876-5432, guarda-chuva e pós-venda inclusos.";
    expect(sanitizeAiResponse(text)).toBe(text);
  });

  it("ficha de produto e marcador de bolhas também saem limpos", () => {
    const output = sanitizeAiResponse("📍 *Loja Setor Bueno* - Goiânia — 2 unidades\n---SPLIT---\nQuer reservar?");
    expect(output).toBe("📍 *Loja Setor Bueno*, Goiânia, 2 unidades\n\nQuer reservar?");
  });

  it("texto sem traço não muda e vazio continua vazio", () => {
    expect(sanitizeAiResponse("Oi! Tudo bem? Me conta qual modelo você viu.")).toBe("Oi! Tudo bem? Me conta qual modelo você viu.");
    expect(sanitizeAiResponse("")).toBe("");
  });
});

describe("sanitizeAiResponse: parêntese antes do traço", () => {
  it("vírgula depois de parêntese fechando", () => {
    expect(sanitizeAiResponse("📍 *Loja Jardim Goiás* - Goiânia (Av. Deputado Jamel Cecilio, 3300) — 2 unidades")).toBe("📍 *Loja Jardim Goiás*, Goiânia (Av. Deputado Jamel Cecilio, 3300), 2 unidades");
  });
});
