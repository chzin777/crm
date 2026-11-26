import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/agent-core";
import { asksEyeExam, BUSINESS_HARD_RULES, claimsEyeExam, consultarLojas, CONSULTAR_LOJAS_TOOL, guardBusinessReply, mentionedCity } from "@/lib/ai/business-guard";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import type { StoreInfo } from "@/lib/ai/stock";

// Cadastro: Goiânia (Setor Marista), Paraíso (Tocantins) e a 502 encerrada; nenhuma loja em Trindade.
const marista: StoreInfo = { name: "LJ 10 MARISTA", address: "AVENIDA T-10", addressNumber: "1300", neighborhood: "SETOR MARISTA", city: "Goiânia", state: "GO", lat: -16.70, lng: -49.26 };
const paraiso: StoreInfo = { name: "LJ 20 PARAISO", address: "AVENIDA TRANSBRASILIANA", addressNumber: "500", neighborhood: "CENTRO", city: "Paraíso do Tocantins", state: "TO", lat: -10.17, lng: -48.88 };
const closed: StoreInfo = { name: "LJ 502 ENCERRADA", address: "RUA 1", addressNumber: "1", neighborhood: "CENTRO", city: "Trindade", state: "GO" };
const directory = new Map<string, StoreInfo>([["10", marista], ["20", paraiso], ["502", closed]]);

describe("exame de vista", () => {
  it("\"Vocês fazem exame de vista?\" → resposta deixa claro que NÃO realizamos", () => {
    expect(asksEyeExam("Vocês fazem exame de vista?")).toBe(true);
    const guarded = guardBusinessReply({ customerText: "Vocês fazem exame de vista?", reply: "Sim! Fazemos exame de vista em todas as lojas, quer agendar?", directory });
    expect(guarded.fixed).toBe("exam");
    expect(guarded.reply).toMatch(/não realiza exame de vista/i);
    expect(guarded.reply).toMatch(/receita/i);
  });

  it("resposta correta (negativa) passa intacta; afirmação de exame em outra pergunta é bloqueada", () => {
    const ok = "A Óticas Brasil não realiza exame de vista, mas com a sua receita fazemos o orçamento.";
    expect(guardBusinessReply({ customerText: "Vocês fazem exame de vista?", reply: ok, directory }).fixed).toBeNull();
    expect(claimsEyeExam("Realizamos exame de vista gratuito na compra!")).toBe(true);
    expect(guardBusinessReply({ customerText: "Quanto custa uma armação?", reply: "A partir de R$ 199. Realizamos exame de vista gratuito na compra!", directory }).fixed).toBe("exam");
    expect(guardBusinessReply({ customerText: "Fiz exame semana passada, segue a receita", reply: "Recebi sua receita! A equipe vai conferir.", directory }).fixed).toBeNull();
  });

  it("regra inegociável entra no prompt do sistema e a marca não cita mais exames", () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain(BUSINESS_HARD_RULES);
    expect(prompt).not.toMatch(/armações e exames de vista/);
  });
});

describe("consultar_lojas e cidade sem loja", () => {
  it("\"Qual o endereço da loja de Trindade?\" → sem endereço de Paraíso nem rua inventada", () => {
    expect(mentionedCity("Qual o endereço da loja de Trindade?")).toBe("Trindade");
    const tool = consultarLojas(directory, { cidade: "trindade" });
    expect(tool).toMatchObject({ encontrada: false, cidade_consultada: "trindade" });
    expect(JSON.stringify(tool)).not.toMatch(/Transbrasiliana|Rua 1\b/i);

    const wrong = "Claro! Nossa loja fica na Avenida Transbrasiliana, 500 - Centro. https://www.google.com/maps/search/?api=1&query=x";
    const guarded = guardBusinessReply({ customerText: "Qual o endereço da loja de Trindade?", reply: wrong, directory, locationText: "Óticas Brasil - Centro Av. Transbrasiliana, 500 - Centro - Paraíso do Tocantins" });
    expect(guarded.fixed).toBe("city");
    expect(guarded.dropLocation).toBe(true);
    expect(guarded.reply).toMatch(/não possuímos unidade da Óticas Brasil em Trindade/i);
    expect(guarded.reply).not.toMatch(/Transbrasiliana|Rua\s+\d|Avenida/i);
  });

  it("resposta que já diz não haver loja em Trindade passa, mas o pin de outra cidade não sai", () => {
    const guarded = guardBusinessReply({ customerText: "tem loja em Trindade?", reply: "Ainda não temos loja em Trindade 😕 A mais perto fica em Goiânia, no Setor Marista.", directory, locationText: "Óticas Brasil - Setor Marista Av. T-10, 1300 - Goiânia" });
    expect(guarded.fixed).toBeNull();
    expect(guarded.dropLocation).toBe(true);
  });

  it("Goiânia / Setor Marista → endereço oficial exato do cadastro (loja 502 encerrada nunca aparece)", () => {
    expect(CONSULTAR_LOJAS_TOOL.function.name).toBe("consultar_lojas");
    const result = consultarLojas(directory, { cidade: "goiania", bairro: "setor marista" });
    expect(result.encontrada).toBe(true);
    if (!result.encontrada) return;
    expect(result.lojas).toHaveLength(1);
    expect(result.lojas[0]).toMatchObject({ nome: "Óticas Brasil - SETOR MARISTA", cidade: "Goiânia", endereco: "AVENIDA T-10, 1300 - SETOR MARISTA - Goiânia" });
    expect(result.lojas[0].link_maps).toMatch(/^https:\/\//);
    expect(consultarLojas(directory, { termo: "loja do marista" })).toMatchObject({ encontrada: true });
    const all = consultarLojas(directory, {});
    expect(JSON.stringify(all)).not.toContain("ENCERRADA");

    const reply = "Fica na AVENIDA T-10, 1300 - Setor Marista, Goiânia.";
    expect(guardBusinessReply({ customerText: "Qual o endereço da loja de Goiânia no Setor Marista?", reply, directory }).fixed).toBeNull();
    const swapped = guardBusinessReply({ customerText: "Qual o endereço da loja de Goiânia?", reply: "Fica na Avenida Transbrasiliana, 500.", directory });
    expect(swapped.fixed).toBe("city");
    expect(swapped.reply).toContain("AVENIDA T-10, 1300 - SETOR MARISTA - Goiânia");
  });
});
