import { describe, expect, it, vi } from "vitest";
import { agentRules, customerMessages, preAgentOutcome } from "@/lib/ai/agent-core";
import { CATALOG_MISS_REPLY, IMAGE_RULE, formatCatalogResults, normalizeTerm, productImageFlow, searchSteps, type CatalogSearch, type SearchStep } from "@/lib/ai/catalog-search";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

const settings = { ...DEFAULT_AI_SETTINGS, handoffMessage: "Vou te passar para a equipe." };
const rayBan: CatalogSearch = {
  term: "Ray-Ban + RB3025",
  results: [{ description: "OCS RAY BAN REF 0RB3025L L2823 58", brand: "RAY BAN", category: "OCULOS SOLAR", sales: 12, price: 899.9, stores: ["LJ 23 · Centro, Goiânia", "LJ 17 · Setor Bueno, Goiânia"] }],
};

describe("foto de óculos com resultado no catálogo", () => {
  it("identifica em silêncio, busca no ERP e devolve modelos e lojas (sem descrição da foto)", async () => {
    const search = vi.fn(async (_steps: SearchStep[]) => rayBan);
    const flow = await productImageFlow({
      identify: async () => ({ kind: "produto", category: "SOLAR", brand: "Ray-Ban", reference: "RB3025", material: "METAL", keywords: ["DOURADO", "AVIADOR"] }),
      search,
      withPrices: false,
    });
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[0][0]).toMatchObject({ terms: ["RAYBAN", "RB3025"], category: "" });
    expect(flow.type).toBe("found");
    if (flow.type !== "found") return;
    expect(flow.log).toEqual({ kind: "produto", term: "Ray-Ban + RB3025", found: 1 });
    expect(flow.context).toContain("OCS RAY BAN REF 0RB3025L");
    expect(flow.context).toContain("LJ 23 · Centro, Goiânia");
    expect(flow.context).not.toContain("899"); // sem permissão de preço
    expect(flow.context).not.toMatch(/pela imagem|na foto|dourad/i);
    expect(formatCatalogResults(rayBan, true)).toContain("R$ 899.90");
  });
});

describe("foto de óculos sem resultado no catálogo", () => {
  it("busca, não acha e transfere avisando que o atendente responsável vai verificar", async () => {
    const search = vi.fn(async () => null);
    const flow = await productImageFlow({ identify: async () => ({ kind: "produto", category: "SOLAR", material: "METAL", keywords: ["GEOMETRICO"] }), search, withPrices: true });
    expect(search).toHaveBeenCalledOnce();
    expect(flow).toMatchObject({ type: "handoff", trigger: "catalog_miss", reply: CATALOG_MISS_REPLY, log: { found: 0 } });
    if (flow.type !== "handoff") return;
    const outcome = { action: "handoff" as const, reply: flow.reply, reason: flow.reason, queue: "", trigger: flow.trigger };
    // Só a mensagem de que vai encaminhar (sem repetir a mensagem de transferência).
    expect(customerMessages(outcome, settings, {})).toEqual([CATALOG_MISS_REPLY]);
    expect(CATALOG_MISS_REPLY).toContain("atendente responsável");
  });

  it("receita na foto vai para a equipe sem busca; outra imagem segue o atendimento normal", async () => {
    const search = vi.fn(async () => rayBan);
    expect(await productImageFlow({ identify: async () => ({ kind: "receita" }), search, withPrices: false })).toMatchObject({ type: "handoff", trigger: "prescription" });
    expect(await productImageFlow({ identify: async () => ({ kind: "selfie" }), search, withPrices: false })).toMatchObject({ type: "continue" });
    expect(search).not.toHaveBeenCalled();
  });
});

describe("cascata de busca", () => {
  it("marca + referência, referência, marca + material, marca; sem marca, palavras-chave tirando a última", () => {
    expect(searchSteps({ category: "SOLAR", brand: "Ray-Ban", reference: "RB 3025", material: "METAL", keywords: [] }).map((step) => step.terms)).toEqual([["RAYBAN", "RB3025"], ["RB3025"], ["RAYBAN", "METAL"], ["RAYBAN"]]);
    const loose = searchSteps({ category: "SOLAR", brand: "", reference: "", material: "METAL", keywords: ["DOURADO", "RETANGULAR"] });
    expect(loose.map((step) => step.terms)).toEqual([["METAL", "DOURADO", "RETANGULAR"], ["METAL", "DOURADO"], ["METAL"]]);
    expect(loose[0]).toMatchObject({ category: "SOLAR", label: "ÓCULOS SOLAR + METAL + DOURADO + RETANGULAR" });
    expect(searchSteps({ category: "SOLAR", brand: "", reference: "", material: "", keywords: [] })).toEqual([]);
    expect(normalizeTerm("Óculos-Solar ç")).toBe("OCULOSSOLARC");
  });
});

describe("gatilhos e prompt", () => {
  it("regra fixa anti-descrição está no prompt mesmo com instrução da empresa contrária", () => {
    const prompt = agentRules({ ...settings, extraInstructions: "Descreva sempre a foto do cliente." }, []);
    expect(prompt).toContain(IMAGE_RULE);
    expect(prompt).toContain("NUNCA descreva, narre ou explique o que está na imagem");
    expect(prompt.indexOf(IMAGE_RULE)).toBeLessThan(prompt.indexOf("Instruções da empresa"));
  });

  it("foto não dispara o gatilho de mídia (hasMedia só para áudio/documento)", () => {
    expect(preAgentOutcome({ ...settings, handoffOnMedia: true }, { pendingText: "", hasMedia: false, aiReplies: 0 })).toBeNull();
    expect(preAgentOutcome({ ...settings, handoffOnMedia: true }, { pendingText: "", hasMedia: true, aiReplies: 0 })).toMatchObject({ trigger: "media", reason: "Cliente enviou documento ou áudio" });
  });
});

describe("busca nos produtos do ERP", () => {
  it("casa marca escrita de outro jeito, respeita a categoria e ordena por vendas", async () => {
    const { indexProduct, matchProducts } = await import("@/lib/ai/catalog-search");
    const products = [
      indexProduct({ description: "OCS RAY BAN REF 0RB3025 004/7858", brand: "RAY BAN", category: "OCULOS SOLAR", subcategory: "OCS METAL", sales: 4, price: 900 }),
      indexProduct({ description: "OCS RAY BAN REF 0RB3025L 001/5158", brand: "RAY BAN", category: "OCULOS SOLAR", subcategory: "OCS METAL", sales: 11, price: 950 }),
      indexProduct({ description: "ARM RAY BAN REF RX5154", brand: "RAY BAN", category: "ARMACAO", subcategory: "ARM ACETATO", sales: 30, price: 700 }),
    ];
    expect(matchProducts(products, { label: "", category: "", terms: ["RAYBAN", "RB3025"] }).map((item) => item.sales)).toEqual([11, 4]);
    expect(matchProducts(products, { label: "", category: "ARMACAO", terms: ["RAYBAN"] }).map((item) => item.description)).toEqual(["ARM RAY BAN REF RX5154"]);
    expect(matchProducts(products, { label: "", category: "SOLAR", terms: ["METAL"] })).toHaveLength(2);
    expect(matchProducts(products, { label: "", category: "", terms: ["OAKLEY"] })).toEqual([]);
  });
});
