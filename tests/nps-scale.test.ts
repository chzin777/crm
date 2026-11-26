import { describe, expect, it } from "vitest";
import { NPS_TEMPLATE, consolidateByCustomer, npsBand, npsMetrics, npsOrderKey, npsTemplateParams, parseNps10 } from "@/lib/nps-scale";
import { NPS_SCALE_TEXT, DEFAULT_CHAT_SETTINGS, npsCommentPrompt, npsPrompt } from "@/lib/chat/settings";

describe("NPS 0 a 10: classificação", () => {
  it("0 a 6 baixa (detrator), 7 e 8 boa (neutro), 9 e 10 excelente (promotor)", () => {
    expect([0, 3, 6].map(npsBand)).toEqual(["detractor", "detractor", "detractor"]);
    expect([7, 8].map(npsBand)).toEqual(["neutral", "neutral"]);
    expect([9, 10].map(npsBand)).toEqual(["promoter", "promoter"]);
  });

  it("NPS oficial = % promotores − % detratores, com soma e média", () => {
    const metrics = npsMetrics([10, 9, 8, 6, 0]);
    expect(metrics).toMatchObject({ count: 5, sum: 33, average: 6.6, promoters: 2, neutrals: 1, detractors: 2, nps: 0 });
    expect(npsMetrics([10, 10, 9, 7]).nps).toBe(75);
    expect(npsMetrics([]).nps).toBeNull();
    // Notas fora da escala (antigas ou inválidas) não entram.
    expect(npsMetrics([11, -1, 5.5, 10]).count).toBe(1);
  });
});

describe("NPS 0 a 10: leitura da resposta no WhatsApp", () => {
  it("aceita número, nota por extenso e formas comuns", () => {
    expect(parseNps10("10")).toBe(10);
    expect(parseNps10("0")).toBe(0);
    expect(parseNps10(" 9! ")).toBe(9);
    expect(parseNps10("Nota 8")).toBe(8);
    expect(parseNps10("dez")).toBe(10);
    expect(parseNps10("7 - foi bom")).toBe(7);
    expect(parseNps10("10/10")).toBe(10);
    expect(parseNps10("", "nps_6")).toBe(6);
  });

  it("frase solta ou número fora da escala não vira nota", () => {
    expect(parseNps10("2 óculos")).toBeNull();
    expect(parseNps10("comprei 3")).toBeNull();
    expect(parseNps10("11")).toBeNull();
    expect(parseNps10("quero ver armações")).toBeNull();
    expect(parseNps10("")).toBeNull();
  });
});

describe("NPS 0 a 10: consolidado por cliente", () => {
  it("soma e média geral do cliente com a última nota de cada pesquisa", () => {
    const [ana, bia] = consolidateByCustomer([
      { contactId: "ana", surveyType: "ATENDIMENTO", score: 10, answeredAt: "2026-10-01T12:00:00Z" },
      { contactId: "ana", surveyType: "PRODUTO_ADAPTACAO", score: 7, answeredAt: "2026-10-31T12:00:00Z" },
      { contactId: "bia", surveyType: "ATENDIMENTO", score: 4, answeredAt: "2026-10-05T12:00:00Z" },
    ]);
    expect(ana).toMatchObject({ contactId: "ana", count: 2, sum: 17, average: 8.5, latest: { ATENDIMENTO: 10, PRODUTO_ADAPTACAO: 7 } });
    expect(bia).toMatchObject({ contactId: "bia", count: 1, sum: 4, average: 4, latest: { ATENDIMENTO: 4 } });
  });
});

describe("NPS 0 a 10: modelo da Meta e textos", () => {
  it("modelo pronto sem travessões ou hífens e com 3 variáveis", () => {
    expect(NPS_TEMPLATE.body).not.toMatch(/[-–—]/);
    expect(NPS_TEMPLATE.footer).not.toMatch(/[-–—]/);
    expect(NPS_TEMPLATE.body.match(/\{\{\d\}\}/g)).toEqual(["{{1}}", "{{2}}", "{{3}}"]);
    expect(NPS_TEMPLATE.examples).toHaveLength(3);
    expect(NPS_SCALE_TEXT).not.toMatch(/[-–—]/);
  });

  it("variáveis padrão por tipo de pesquisa e chave do pedido", () => {
    expect(npsTemplateParams("ATENDIMENTO")).toEqual(["primeiro_nome", "fixo:Óticas Brasil", "fixo:o atendimento que você recebeu na loja"]);
    expect(npsTemplateParams("PRODUTO_ADAPTACAO")[2]).toBe("fixo:seus óculos novos e a adaptação às lentes");
    expect(npsOrderKey("Loja Centro", "123")).toBe("Loja Centro-123");
    expect(npsOrderKey("", "123")).toBeNull();
  });

  it("pergunta salva de 1 a 5 passa a 0 a 10 e o convite ao comentário antigo vira o novo", () => {
    expect(npsPrompt({ ...DEFAULT_CHAT_SETTINGS, npsPromptText: "De 1 a 5, como você avalia o atendimento?" })).toBe("De 0 a 10, como você avalia o atendimento?");
    const legacy = "Sentimos muito que sua experiência não tenha sido ideal. Poderia nos contar brevemente o que podemos melhorar?";
    expect(npsCommentPrompt({ ...DEFAULT_CHAT_SETTINGS, npsCommentText: legacy })).toBe(DEFAULT_CHAT_SETTINGS.npsCommentText);
    expect(npsCommentPrompt({ ...DEFAULT_CHAT_SETTINGS, npsCommentText: "" })).toBe("");
  });
});
