import { describe, expect, it } from "vitest";
import { isCustomerProduct } from "@/lib/ai/catalog-search";
import { customerProductName, humanizeErpMentions } from "@/lib/ai/product-card";
import { asksStoreAvailability, repeatsShownModel } from "@/lib/ai/product-details";
import { photoVariants } from "@/lib/ai/photo-response";
import { storeLabel, type StockToolProduct } from "@/lib/ai/stock";
import { aiConversationMode } from "@/lib/chat/queue-rules";

describe("peças de reposição e lentes avulsas fora da vitrine", () => {
  it("descarta lente avulsa, haste, plaqueta, estojo, flanela e acessórios; mantém óculos e lentes de contato", () => {
    expect(isCustomerProduct({ description: "LENTE, LUXOTTICA-POLARIZADA, RB4165L 622/2V", category: "ACESSORIOS", subcategory: "LENTE SOLAR" })).toBe(false);
    expect(isCustomerProduct({ description: "LENTE, LUXOTTICA-POLARIZADA, RB4165L 622/2V", category: null })).toBe(false);
    expect(isCustomerProduct({ description: "HASTE RAY BAN RB4165 PRETA", category: "ACESSORIOS", subcategory: "HASTE" })).toBe(false);
    expect(isCustomerProduct({ description: "PLAQUETA SILICONE", category: "OCULOS SOLAR" })).toBe(false);
    expect(isCustomerProduct({ description: "ESTOJO RIGIDO RAY BAN", category: "ACESSORIOS" })).toBe(false);
    expect(isCustomerProduct({ description: "FLANELA MICROFIBRA", category: "ACESSORIOS", subcategory: "MICROFIBRA FELPUDA" })).toBe(false);
    expect(isCustomerProduct({ description: "LENTE VS 1.56 AR", category: "LENTES", subcategory: "VISAO SIMPLES" })).toBe(false);
    expect(isCustomerProduct({ description: "OCS RAY BAN REF 0RB4165L 622/7157", category: "OCULOS SOLAR", subcategory: "OCS MISTO" })).toBe(true);
    expect(isCustomerProduct({ description: "ARM MIUMIU REF 0MU 01XV 1AB1O1 52", category: "ARMACAO", subcategory: "ARM ACETATO" })).toBe(true);
    expect(isCustomerProduct({ description: "LENTE DE CONTATO ACUVUE OASYS CX 6", category: "LENTES DE CONTATO", subcategory: "LC ESFERICA" })).toBe(true);
  });
});

describe("nome bruto do VMSET nunca chega ao cliente", () => {
  it("\"OCS RAY BAN REF 0RB4165L 622/7157\" → \"Ray-Ban Justin RB4165L\"", () => {
    expect(customerProductName("OCS RAY BAN REF 0RB4165L 622/7157")).toBe("Ray-Ban Justin RB4165L");
    expect(humanizeErpMentions("1. OCS RAY BAN REF 0RB4165L 622/7157, R$ 830,00")).toBe("1. Ray-Ban Justin RB4165L, R$ 830,00");
    expect(humanizeErpMentions("Temos o OCS RAY BAN REF 0RB4165L 622/7157 na loja.")).not.toMatch(/OCS|REF|622\/7157/);
    expect(humanizeErpMentions("Sem nome bruto aqui.")).toBe("Sem nome bruto aqui.");
  });

  it("lista de variações com nome comercial e cor, sem o nome do ERP", () => {
    const variant = (codigo: string, produto: string) => ({ codigo, produto, marca: "RAY BAN", preco: 830, precoVenda: "R$ 830,00", nomeProduto: "", referencia: codigo, lojasNaRegiao: [], precoVariaPorLoja: false, precoSobConsulta: false, totalDisponivelRede: 1, lojasComEstoque: [{ code: "23", loja: "Loja Setor Central de Aparecida de Goiânia", quantidade: 1 }] }) as StockToolProduct;
    const result = photoVariants([variant("1", "OCS RAY BAN REF 0RB4165L 622/7157"), variant("2", "OCS RAY BAN REF 0RB4165L 601/8G 55")], "Ray-Ban Justin");
    expect(result?.text).not.toMatch(/OCS|RAY BAN REF/);
    expect(result?.text).toMatch(/RB4165L, cor 622\/7157/);
  });
});

describe("sem reenvio de foto/ficha do modelo já mostrado", () => {
  it("\"Tem no Buriti shopping?\" sobre modelo com foto enviada → só texto", () => {
    expect(asksStoreAvailability("Tem no Buriti shopping?")).toBe(true);
    expect(repeatsShownModel({ text: "Tem no Buriti shopping?", chosen: false, productCodes: ["57841"], sentImageSkus: ["57841"], shownIds: [] })).toBe(true);
    // Só listado antes (sem foto) e pergunta de loja: também só texto.
    expect(repeatsShownModel({ text: "tem em Aparecida?", chosen: false, productCodes: ["57841"], sentImageSkus: [], shownIds: ["57841"] })).toBe(true);
    // "Quero detalhes desse" com a foto já enviada: sem reenviar.
    expect(repeatsShownModel({ text: "Quero detalhes desse", chosen: false, productCodes: ["57841"], sentImageSkus: ["57841"], shownIds: [] })).toBe(true);
    // Pedido explícito de foto ou de outras cores: pode mostrar de novo.
    expect(repeatsShownModel({ text: "me manda a foto de novo", chosen: false, productCodes: ["57841"], sentImageSkus: ["57841"], shownIds: [] })).toBe(false);
    expect(repeatsShownModel({ text: "tem outras cores?", chosen: false, productCodes: ["57841"], sentImageSkus: ["57841"], shownIds: [] })).toBe(false);
    // Modelo novo na conversa: segue o fluxo normal (ficha + foto).
    expect(repeatsShownModel({ text: "Tem no Buriti shopping?", chosen: false, productCodes: ["99999"], sentImageSkus: ["57841"], shownIds: [] })).toBe(false);
  });
});

describe("IA em silêncio depois do transbordo", () => {
  it("limite de 30 respostas → fila Atendimento Geral: a próxima mensagem do cliente não aciona a IA", () => {
    const conversation = { status: "waiting", assigneeId: null, closedAt: null, menuState: {} };
    expect(aiConversationMode(conversation, { handedOff: true, humanReplied: false })).toBe("paused");
    expect(aiConversationMode(conversation, { handedOff: false, humanReplied: false })).toBe("exclusive");
  });
});

describe("loja do Setor Central sem ambiguidade", () => {
  it("o município entra no nome da unidade", () => {
    const base = { name: "LJ 23", address: "RUA SAO BENTO", addressNumber: "16", neighborhood: "SETOR CENTRAL" };
    expect(storeLabel("23", { ...base, city: "APARECIDA DE GOIANIA" })).toBe("Loja Setor Central de Aparecida de Goiânia — Rua São Bento, 16");
    expect(storeLabel("12", { ...base, city: "GOIANIA" })).toMatch(/^Loja Setor Central de Goiânia/);
    expect(storeLabel("14", { ...base, neighborhood: "SETOR BUENO", city: "GOIANIA" })).toMatch(/^Loja Setor Bueno —/);
  });
});
