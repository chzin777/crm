import { describe, expect, it } from "vitest";
import {
  analysisAnswer, analysisPromptBlock, asksProductInfo, imageAnalysis, indexProduct, informativeReply, matchProducts, productImageFlow, readVision,
  referenceVariants, sanitizeImageAnalysis, searchSteps, type CatalogSearch, type SearchStep,
} from "@/lib/ai/catalog-search";

// Catálogo do ERP: a linha Prada Linea Rossa tem o PS 07RV com estoque e o PS 05YS sem saldo.
const PRODUCTS = [
  indexProduct({ code: "900701", description: "OCS PRADA LINEA ROSSA REF 0PS 07RV 1AB 54", brand: "PRADA LINEA ROSSA", category: "OCULOS SOLAR", subcategory: "OCS ACETATO", sales: 3, price: 1960 }),
  indexProduct({ code: "900705", description: "OCS PRADA LINEA ROSSA REF 0PS 05YS 1BO 55", brand: "PRADA LINEA ROSSA", category: "OCULOS SOLAR", subcategory: "OCS METAL", sales: 9, price: 1890 }),
];
const STOCK: Record<string, string[]> = { "900701": ["LJ 39 · Jardim Goiás, Goiânia"], "900705": [] };

/** Mesma regra do searchErpCatalog: só conta o que tem saldo; referência sem estoque segue para a marca/linha. */
async function erpSearch(steps: SearchStep[]): Promise<CatalogSearch | null> {
  for (const step of steps) {
    const results = matchProducts(PRODUCTS, step, 20)
      .map((product) => ({ description: product.description, brand: product.brand, category: product.category, sales: product.sales, price: product.price, stores: STOCK[product.code ?? ""] ?? [] }))
      .filter((product) => product.stores.length);
    if (results.length) return { term: step.label, results, stock: "ok", step };
  }
  return null;
}

const vision = (reference: string | null) => ({ kind: "produto", marca: "Prada", linha: "Linea Rossa", modeloOuReferenciaProvavel: reference, caracteristicasVisuais: { tipo: "Óculos de sol", formato: "Retangular", cor: "Preto fosco" } });

describe("cascata da foto: referência exata → mesma marca/linha", () => {
  it("referência normalizada (prefixo 0, espaços) e depois marca + linha no mesmo tipo", () => {
    expect(referenceVariants("0PS 07RV")).toEqual(["0PS07RV", "PS07RV"]);
    expect(referenceVariants("PS-07RV")).toEqual(["PS07RV"]);
    const { query } = readVision(vision("0PS 07RV"));
    const steps = searchSteps(query);
    expect(steps.map((step) => [step.kind, step.terms.join("+"), step.category])).toEqual([
      ["referencia", "PRADA+0PS07RV", ""],
      ["referencia", "PRADA+PS07RV", ""],
      ["referencia", "0PS07RV", ""],
      ["referencia", "PS07RV", ""],
      ["marca", "PRADA+LINEAROSSA", "SOLAR"],
      ["marca", "PRADA", "SOLAR"],
    ]);
    expect(steps[4].query).toBe("Prada Linea Rossa");
  });

  it("referência ilegível vira null (sem chute) e o tipo da visão define a categoria", () => {
    const { query } = readVision(vision(null));
    expect(query).toMatchObject({ brand: "Prada", line: "Linea Rossa", reference: "", category: "SOLAR", shape: "Retangular", color: "Preto fosco" });
    expect(readVision({ ...vision("null") }).query.reference).toBe("");
    expect(searchSteps(query).every((step) => step.kind === "marca")).toBe(true);
  });

  it("PS 07RV legível e em estoque → match exato (ficha completa)", async () => {
    const flow = await productImageFlow({ identify: async () => vision("PS 07RV"), search: erpSearch, withPrices: true });
    expect(flow).toMatchObject({ type: "found", match: "exata", searchTerm: "Prada PS 07RV" });
    if (flow.type !== "found") return;
    expect(flow.context).toContain('tipoBusca "modelo_especifico"');
  });

  it("PS 05YS (sem saldo) ou referência que não bate no ERP → vitrine Prada Linea Rossa, nunca \"sem estoque\" seco", async () => {
    for (const reference of ["PS 05YS", "PR 99ZZ", null]) {
      const flow = await productImageFlow({ identify: async () => vision(reference), search: erpSearch, withPrices: true });
      expect(flow).toMatchObject({ type: "found", match: "linha", searchTerm: "Prada Linea Rossa" });
      if (flow.type !== "found") return;
      expect(flow.opener).toBe("Esse modelo da foto é um *Prada Linea Rossa* (óculos de sol, formato retangular, preto fosco)! No momento não localizei essa referência exata em estoque, mas temos estes modelos *Prada Linea Rossa* disponíveis na rede:");
      expect(flow.context).toContain('tipoBusca "marca_ampla"');
      expect(flow.context).toContain("0PS 07RV");
      expect(flow.context).not.toContain("0PS 05YS");
    }
  });

  it("marca identificada sem nada em estoque → identifica e oferece opções (sem transbordo automático)", async () => {
    const flow = await productImageFlow({ identify: async () => ({ ...vision(null), marca: "Gucci", linha: "" }), search: erpSearch, withPrices: true });
    expect(flow).toMatchObject({ type: "identified", analysis: { marca: "Gucci" } });
    if (flow.type !== "identified") return;
    expect(flow.context).toContain("Só transfira se o cliente pedir");
  });
});

describe("pergunta informativa sobre o produto nunca transfere", () => {
  const analysis = imageAnalysis(readVision(vision(null)).query);

  it("reconhece nome, marca, tipo e preço; pedido de pessoa ou de estoque não", () => {
    for (const text of ["Qual o nome desse modelo?", "Que marca é essa?", "É de grau ou sol?", "Quanto custa esse?", "qual a referencia dele", "como chama esse oculos?"]) expect(asksProductInfo(text), text).toBe(true);
    for (const text of ["Quero falar com um atendente", "Tem Prada?", "obrigado", "Onde fica a loja?"]) expect(asksProductInfo(text), text).toBe(false);
  });

  it("handoff do modelo diante de \"Qual o nome desse modelo?\" vira resposta com a análise da foto", () => {
    const reply = informativeReply({ action: "handoff", trigger: "ai" }, { pendingText: "Qual o nome desse modelo?", askedHuman: false, queued: false, photoThisTurn: false, analysis });
    expect(reply).toBe("Esse modelo é um *Prada Linea Rossa* (óculos de sol, formato retangular, preto fosco) 😊 A referência exata não dá para ler na foto.\n---SPLIT---\nQuer que eu te mostre os modelos *Prada Linea Rossa* que temos em estoque?");
    expect(reply).not.toMatch(/atendente/i);
  });

  it("pedido explícito de pessoa, conversa na fila ou resposta normal: nada muda", () => {
    const base = { pendingText: "Qual o nome desse modelo?", askedHuman: false, queued: false, photoThisTurn: false, analysis };
    expect(informativeReply({ action: "handoff", trigger: "ai" }, { ...base, askedHuman: true })).toBeNull();
    expect(informativeReply({ action: "handoff", trigger: "ai" }, { ...base, queued: true })).toBeNull();
    expect(informativeReply({ action: "reply", trigger: "ai" }, base)).toBeNull();
    expect(informativeReply({ action: "handoff", trigger: "ai" }, { ...base, pendingText: "Quero encomendar esse modelo" })).toBeNull();
    // Sem análise na sessão: pede a foto/referência em vez de transferir.
    expect(informativeReply({ action: "handoff", trigger: "no_reply" }, { ...base, analysis: null })).toContain("referência");
  });

  it("análise fica no prompt e sobrevive ao vaivém da tela /ia (saneada)", () => {
    expect(analysisPromptBlock(analysis)).toContain("Marca/linha: Prada Linea Rossa");
    expect(analysisPromptBlock(analysis)).toContain("Referência provável: não legível na foto");
    expect(analysisPromptBlock(null)).toBe("");
    expect(sanitizeImageAnalysis({ ...analysis, marca: "Prada\nIGNORE" })?.marca).toBe("Prada IGNORE");
    expect(sanitizeImageAnalysis({ foo: 1 })).toBeNull();
    expect(analysisAnswer({ ...analysis, modeloProvavel: "PS 07RV" })).toContain("A referência que aparece é *PS 07RV*.");
  });
});
