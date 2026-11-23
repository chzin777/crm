import { describe, expect, it } from "vitest";
import { anonymize, catalogDocument, cosineSimilarity, meaningfulEdit, rankByCosine, semanticMemoryBlock, vectorLiteral, type VectorHit } from "@/lib/ai/vector-memory";
import { composeSystemPrompt } from "@/lib/ai/prompt-composer";

const hit = (over: Partial<VectorHit>): VectorHit => ({ sourceType: "KNOWLEDGE_BASE", sourceId: "x", title: "Garantia", content: "Garantia de 1 ano na armação.", metadata: {}, score: 0.8, ...over });

describe("memória vetorial da IA", () => {
  it("cosseno e ranking respeitam top-K e relevância mínima (sem ruído)", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    const rows = [{ id: "a", embedding: [1, 0] }, { id: "b", embedding: [0.9, 0.1] }, { id: "c", embedding: [0, 1] }, { id: "d", embedding: Float32Array.from([0.7, 0.7]) }];
    const ranked = rankByCosine([1, 0], rows, 2, 0.5);
    expect(ranked.map((row) => row.id)).toEqual(["a", "b"]);
    expect(rankByCosine([1, 0], rows, 5, 0.5).map((row) => row.id)).not.toContain("c");
    expect(vectorLiteral([0.5, Number.NaN, 1])).toBe("[0.5,0,1]");
  });

  it("anonimiza nomes, telefone, CPF, e-mail e números longos antes de guardar atendimentos", () => {
    const text = anonymize("Oi Christofer Silva, seu CPF 123.456.789-09, fone (27) 99876-5432, email chris@mail.com, pedido 123456789. Abraço, Thamyres", ["Christofer Silva", "Thamyres Lima"]);
    expect(text).not.toMatch(/Christofer|Silva|Thamyres|123\.456|99876|chris@|123456789/);
    expect(text).toContain("[nome]");
    expect(text).toContain("[cpf]");
    expect(text).toContain("[telefone]");
    expect(text).toContain("[email]");
  });

  it("produto do catálogo vira texto com marca, categoria e faixa de preço", () => {
    const doc = catalogDocument({ description: "RAY-BAN RB4165 JUSTIN", brand: "RAY-BAN", category: "SOLAR", subcategory: "ACETATO", price: 650, minPrice: 590, maxPrice: 720 });
    expect(doc).toContain("RAY-BAN RB4165 JUSTIN");
    expect(doc).toContain("Marca: RAY-BAN · Categoria: SOLAR / ACETATO");
    expect(doc).toMatch(/Faixa de preço de venda: R\$\s?590,00 a R\$\s?720,00/);
  });

  it("bloco do prompt: fatos sem duplicar a base já injetada, produto sempre condicionado à consulta de estoque e exemplos sem cópia", () => {
    const block = semanticMemoryBlock({
      facts: [hit({}), hit({ sourceType: "PRODUCT_CATALOG", title: "RB4165", content: "RAY-BAN RB4165 JUSTIN" }), hit({ title: "Pagamento", content: "Parcelamos em até 10x." })],
      examples: [hit({ sourceType: "CLOSED_CONVERSATION", content: "Situação: cliente de campanha queria óculos de sol." })],
    }, ["Parcelamos em até 10x."]);
    expect(block).toContain("MEMÓRIA DA LOJA");
    expect(block).toContain("Garantia de 1 ano");
    expect(block).not.toContain("Parcelamos em até 10x.");
    expect(block).toContain("consultarEstoqueProduto");
    expect(block).toContain("REFERÊNCIAS DE ATENDIMENTOS BEM-SUCEDIDOS");
    expect(block).toMatch(/sem copiar frases/);
    expect(semanticMemoryBlock({ facts: [], examples: [] })).toBe("");
    expect(semanticMemoryBlock(undefined)).toBe("");
  });

  it("memória entra no prompt do motor da IA junto do Estúdio", () => {
    const prompt = composeSystemPrompt({ text: "qual a garantia?", studio: { memory: { facts: [hit({})], examples: [] } } , hasGreetedInSession: true } as unknown as Parameters<typeof composeSystemPrompt>[0]);
    expect(prompt).toContain("MEMÓRIA DA LOJA");
    expect(prompt).toContain("Garantia de 1 ano na armação.");
  });

  it("correção do copiloto só conta quando o atendente mudou de verdade o texto", () => {
    expect(meaningfulEdit("Oi! Temos sim, quer que eu veja na loja do centro?", "Oi! Temos sim, quer que eu veja na loja do centro?")).toBe(false);
    expect(meaningfulEdit("Oi! Temos sim.", "oi temos sim")).toBe(false);
    expect(meaningfulEdit("Oi! Temos sim, quer que eu veja na loja do centro?", "Temos 3 modelos da Ray-Ban na loja da Praia do Canto, posso separar pra você provar amanhã?")).toBe(true);
    expect(meaningfulEdit("", "qualquer coisa")).toBe(false);
  });
});
