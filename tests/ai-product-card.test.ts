import { describe, expect, it } from "vitest";
import { buildSystemPrompt, carriesProductExtras } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { splitBubbles } from "@/lib/ai/bubbles";
import { STOCK_RULES } from "@/lib/ai/stock";
import { asksForPhoto, buildDetailsResult, cardGuidance, createProductDetailsService, DETAILS_RULES, parseSheet, PRODUCT_CARD_RULES, ratingLabel, shortLine, shouldSendProductPhoto, type DetailsCacheRow } from "@/lib/ai/product-details";

const WEB = JSON.stringify({
  miniDescricao: "Armação leve em acetato com design oval feminino",
  descricaoDetalhada: "- Material: acetato\n- Formato: oval, aro fechado\n- Público: feminino\n- Lentes: pronta para grau",
  avaliacao: { nota: 4.8, contagem: 120, fonte: "designeroptics.com" },
});

describe("paridade do pipeline de produto com o cliente na fila (alreadyQueued = true)", () => {
  it("o prompt da espera assistida tem as mesmas regras de estoque, ficha e detalhes", () => {
    const queued = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "", queued: { queueName: "Vendas" } });
    const normal = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    for (const rule of [STOCK_RULES, PRODUCT_CARD_RULES, DETAILS_RULES]) {
      expect(queued).toContain(rule);
      expect(normal).toContain(rule);
    }
    expect(PRODUCT_CARD_RULES).toContain("vale antes e depois de o cliente entrar na fila");
  });

  it("na fila, a foto acompanha a resposta mesmo se o modelo marcar transferência (não transfere de novo)", () => {
    expect(carriesProductExtras({ action: "handoff", reply: "Temos sim! *Armação Miu Miu*..." }, true)).toBe(true);
    expect(carriesProductExtras({ action: "handoff", reply: "Temos sim!" }, false)).toBe(false);
    expect(carriesProductExtras({ action: "reply", reply: "Temos sim!" }, false)).toBe(true);
    expect(carriesProductExtras({ action: "no_reply", reply: "" }, true)).toBe(false);
  });

  it("foto: 1ª consulta do SKU na etapa, de novo depois de entrar na fila e sempre que o cliente pedir para ver", () => {
    // Primeira consulta do modelo: envia.
    expect(shouldSendProductPhoto({ sku: "108564", sentSkus: [], pendingText: "tem o ray-ban justin?" })).toBe(true);
    // Já enviada nesta etapa e o cliente só pediu mais detalhes: não repete a mesma foto.
    expect(shouldSendProductPhoto({ sku: "108564", sentSkus: ["108564"], pendingText: "quero saber mais detalhes" })).toBe(false);
    // Na fila, só contam as fotos enviadas depois da transferência (lista vazia) → pergunta de novo, foto de novo.
    expect(shouldSendProductPhoto({ sku: "108564", sentSkus: [], pendingText: "e o justin, ainda tem?" })).toBe(true);
    // Pedido explícito sempre envia.
    expect(shouldSendProductPhoto({ sku: "108564", sentSkus: ["108564"], pendingText: "me manda a foto dele" })).toBe(true);
    expect(asksForPhoto("quero ver esse modelo")).toBe(true);
    expect(asksForPhoto("quanto custa?")).toBe(false);
  });
});

describe("ficha resumida na 1ª consulta e descrição detalhada em \"mais detalhes\"", () => {
  it("pesquisa vira ficha com mini-descrição (≤120), descrição detalhada e avaliação, guardada no cache de 30 dias", async () => {
    const rows = new Map<string, DetailsCacheRow>();
    let calls = 0;
    const service = createProductDetailsService({ cache: { get: async (key) => rows.get(key) ?? null, set: async (row) => { rows.set(row.key, { ...row, updatedAt: new Date() }); } }, search: async () => { calls += 1; return `Aqui está:\n${WEB}`; } });
    const first = await service("MIU MIU|0MU 01XV", "p");
    const second = await service("MIU MIU|0MU 01XV", "p");
    expect(first.sheet).toEqual({ miniDescricao: "Armação leve em acetato com design oval feminino", descricaoDetalhada: "- Material: acetato\n- Formato: oval, aro fechado\n- Público: feminino\n- Lentes: pronta para grau", avaliacaoWeb: { nota: "4,8", contagem: 120, fonte: "designeroptics.com" } });
    expect(second).toMatchObject({ source: "cache", sheet: first.sheet });
    expect(calls).toBe(1);
    expect(ratingLabel(first.sheet?.avaliacaoWeb)).toBe("⭐ 4,8 (120 avaliações)");
    expect(shortLine("x".repeat(200))!.length).toBeLessThanOrEqual(120);
  });

  it("primeira consulta: regra da ficha (nome, mini-descrição, preço, quantidade, avaliação, lojas) + 2ª bolha com ---SPLIT---", () => {
    const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(prompt).toContain(PRODUCT_CARD_RULES);
    for (const piece of ["Nome humanizado", "miniDescricao em 1 linha", "precoVenda em R$", "unidades disponíveis na rede", "avaliacaoWeb", "agrupadas por cidade/região", "---SPLIT---"]) expect(PRODUCT_CARD_RULES).toContain(piece);
    // A resposta no formato da ficha vira 2 bolhas: ficha (legenda da foto) e pergunta de continuação.
    const reply = "*Armação Miu Miu (ref. 0MU 01XV)*\nArmação leve em acetato com design oval feminino\n💰 *R$ 1.290,00* · 3 unidades disponíveis na rede · ⭐ 4,8\n\n📍 *Goiânia*\n• *Loja Setor Bueno* — Av. T-8, 235\n\n---SPLIT---\n\nQuer que eu te passe os detalhes técnicos completos desse modelo ou prefere a localização dessa loja?";
    const parts = splitBubbles(reply);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("R$ 1.290,00");
    expect(parts[1]).toMatch(/detalhes técnicos completos/);
  });

  it("orientação da ficha no resultado de estoque: preço, quantidade, mini-descrição e avaliação só se existir", () => {
    const withRating = cardGuidance({ nomeProduto: "Óculos de sol Ray-Ban (ref. RB4165 Justin)", miniDescricao: "Óculos quadrado em nylon com lentes UV400", precoVenda: "R$ 1.000,00", totalDisponivelRede: 2, avaliacaoWeb: "⭐ 4,8" });
    expect(withRating).toContain("*Óculos de sol Ray-Ban (ref. RB4165 Justin)*\nÓculos quadrado em nylon com lentes UV400\n💰 *R$ 1.000,00* · 2 unidades disponíveis na rede · ⭐ 4,8");
    expect(withRating).toContain("---SPLIT---");
    const noRating = cardGuidance({ nomeProduto: "X", miniDescricao: null, precoVenda: "R$ 500,00", totalDisponivelRede: 1, avaliacaoWeb: null });
    expect(noRating).toContain("💰 *R$ 500,00* · 1 unidade disponível na rede");
    expect(noRating).not.toContain("⭐");
    expect(noRating).toContain("Não mencione avaliação nem nota");
  });

  it("\"mais detalhes\": entrega a descrição detalhada sem repetir a ficha nem as lojas", () => {
    const sheet = parseSheet(WEB);
    const result = buildDetailsResult({ nomeProduto: "Armação Miu Miu (ref. 0MU 01XV)", referencia: "0MU 01XV", found: true, details: { text: sheet!.descricaoDetalhada, sheet, source: "cache" }, variations: [{ nomeProduto: "Armação Miu Miu (ref. 0MU 01XV)", cor: "1AB1O1", totalDisponivel: 2, lojas: ["Loja Setor Bueno"] }], stock: "ok" });
    expect(result.descricaoDetalhada).toContain("Material: acetato");
    expect(result.miniDescricao).toBe("Armação leve em acetato com design oval feminino");
    expect(result.orientacao).toContain("sem repetir a lista de lojas nem a ficha resumida");
    expect(PRODUCT_CARD_RULES).toContain("NÃO repita a ficha nem a lista de lojas");
  });

  it("nunca inventa nota: sem avaliação confiável → avaliacaoWeb null e a regra proíbe falar de nota", () => {
    expect(parseSheet(JSON.stringify({ miniDescricao: "Óculos de sol polarizado", descricaoDetalhada: "- Lente polarizada", avaliacao: null }))?.avaliacaoWeb).toBeNull();
    // Nota sem fonte, fora da escala ou em texto: descartada.
    expect(parseSheet(JSON.stringify({ miniDescricao: "x", avaliacao: { nota: 4.5, contagem: 10, fonte: "" } }))?.avaliacaoWeb).toBeNull();
    expect(parseSheet(JSON.stringify({ miniDescricao: "x", avaliacao: { nota: 9, fonte: "site" } }))?.avaliacaoWeb).toBeNull();
    expect(parseSheet(JSON.stringify({ miniDescricao: "x", avaliacao: { nota: "ótima", fonte: "site" } }))?.avaliacaoWeb).toBeNull();
    const result = buildDetailsResult({ nomeProduto: "X", referencia: null, found: true, details: { text: "- a", sheet: { miniDescricao: "x", descricaoDetalhada: "- a", avaliacaoWeb: null }, source: "web" }, variations: [], stock: "ok" });
    expect(result.avaliacaoWeb).toBeNull();
    expect(ratingLabel(null)).toBeNull();
    expect(PRODUCT_CARD_RULES).toContain("avaliacaoWeb null = não fale de nota nem de avaliação");
  });
});
