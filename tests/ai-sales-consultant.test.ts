import { describe, expect, it } from "vitest";
import { asksCustomerCity, cityQuestion, extractBudget, isProductBrowseRequest, wantsCheap } from "@/lib/ai/catalog-context";
import { activeClosing, activeCta, asksSpecificModel, budgetBlock, conversationBudget, conversationWantsKids, isGatedStockCall, mergeProactiveReply, needsCityFirst, SALES_CONSULTANT_RULES, withBudgetArgs } from "@/lib/ai/sales-consultant";
import { isKidsProduct, mentionsKids } from "@/lib/ai/catalog-search";
import { FORMAT_RULES } from "@/lib/ai/bubbles";
import { applyPriceFilter, diverseByBrand, formatShowcase, type ShowcaseModel } from "@/lib/ai/stock-showcase";
import { STOCK_TOOL } from "@/lib/ai/stock";
import { cardOpening } from "@/lib/ai/product-card";

describe("orçamento na fala do cliente", () => {
  it.each([
    ["queria algo até 250 reais", { maxPrice: 250 }],
    ["até R$ 1.200", { maxPrice: 1200 }],
    ["entre 200 e 400", { minPrice: 200, maxPrice: 400 }],
    ["acima de 500 reais", { minPrice: 500 }],
    ["uns 300 conto", { maxPrice: 300 }],
    ["quero uma armação", {}],
    ["tem o RB4165?", {}],
  ])("%s", (text, expected) => {
    expect(extractBudget(text)).toEqual(expected);
  });

  it("pedido de barata ordena pelas mais acessíveis", () => {
    for (const text of ["armação barata", "algo mais em conta", "a de melhor preço", "uma mais acessível"]) expect(wantsCheap(text)).toBe(true);
    expect(wantsCheap("quero a mais bonita")).toBe(false);
  });

  it("o orçamento mais recente da conversa vale", () => {
    expect(conversationBudget(["até 300 reais", "Goiânia", "pensando melhor, até 250"]).budget).toEqual({ maxPrice: 250 });
    expect(conversationBudget(["armação baratinha", "Goiânia"]).cheap).toBe(true);
    expect(budgetBlock({ maxPrice: 250 }, true)).toContain("maxPrice 250, sortBy \"price_asc\"");
  });
});

describe("regra de ouro geográfica", () => {
  it("pedido de vitrine sem cidade pergunta antes; modelo específico, foto ou cidade conhecida não", () => {
    const base = { knownCity: "", photo: false, selectedProduct: false, queued: false };
    expect(needsCityFirst({ ...base, text: "vocês têm armação de grau barata?" })).toBe(true);
    expect(needsCityFirst({ ...base, text: "tem Ray-Ban?" })).toBe(true);
    expect(needsCityFirst({ ...base, text: "tem o Ray-Ban Justin?" })).toBe(false);
    expect(needsCityFirst({ ...base, text: "tem RB4165?" })).toBe(false);
    expect(needsCityFirst({ ...base, text: "qual o horário de vocês?" })).toBe(false);
    expect(needsCityFirst({ ...base, knownCity: "Goiânia", text: "armação barata" })).toBe(false);
    expect(needsCityFirst({ ...base, photo: true, text: "tem esse?" })).toBe(false);
    expect(asksSpecificModel("armação até 250 reais")).toBe(false);
    expect(isProductBrowseRequest("quero óculos de sol")).toBe(true);
  });

  it("a ferramenta recusa vitrine sem cidade, mas não modelo específico", () => {
    const unknown = { knownCity: "", fixedProduct: false };
    expect(isGatedStockCall({ tipo: "grau", sortBy: "price_asc" }, unknown)).toBe(true);
    expect(isGatedStockCall({ termoBusca: "Ray-Ban", tipoBusca: "marca_ampla" }, unknown)).toBe(true);
    expect(isGatedStockCall({ termoBusca: "Ray-Ban Justin", tipoBusca: "modelo_especifico" }, unknown)).toBe(false);
    expect(isGatedStockCall({ termoBusca: "Ray-Ban", tipoBusca: "marca_ampla" }, { knownCity: "Goiânia", fixedProduct: false })).toBe(false);
    expect(isGatedStockCall({ termoBusca: "Prada", _photo: true }, unknown)).toBe(false);
  });

  it("pergunta de cidade varia e só pede orçamento quando o pedido foi genérico", () => {
    const asks = [0, 1, 2].map((variant) => cityQuestion({ askBudget: true, variant }));
    expect(new Set(asks).size).toBe(3);
    for (const text of asks) expect(asksCustomerCity(text)).toBe(true);
    expect(cityQuestion({ askBudget: false })).not.toMatch(/R\$|valor/);
  });
});

describe("filtro de preço e ordenação da vitrine", () => {
  const model = (nome: string, preco: string | null): ShowcaseModel => ({ nomeComercial: nome, referencia: null, categoriaModelo: "Armação", precoVenda: preco, totalDisponivelRede: 1, codigos: [nome] });
  const models = [model("A", "R$ 690,00"), model("B", "R$ 239,00"), model("C", null), model("D", "R$ 189,00"), model("E", "R$ 1.070,00")];

  it("teto + mais baratas primeiro", () => {
    expect(applyPriceFilter(models, { maxPrice: 250, sortBy: "price_asc" }).map((item) => item.nomeComercial)).toEqual(["D", "B"]);
  });
  it("só ordenação mantém todos, sem preço no fim", () => {
    expect(applyPriceFilter(models, { sortBy: "price_asc" }).map((item) => item.nomeComercial)).toEqual(["D", "B", "A", "E", "C"]);
    expect(applyPriceFilter(models, { sortBy: "price_desc" }).map((item) => item.nomeComercial)).toEqual(["E", "A", "B", "D", "C"]);
  });
  it("vitrine de orçamento sem marca: no máximo 2 por marca e sem cabeçalho pronto", () => {
    const radda = [1, 2, 3, 4].map((index) => model(`Radda ${index}`, "R$ 120,00"));
    const varied = diverseByBrand([...radda, model("Nairoby 1", "R$ 120,00"), model("Vogue 1", "R$ 189,00")], 2);
    expect(varied.map((item) => item.nomeComercial)).toEqual(["Radda 1", "Radda 2", "Nairoby 1", "Vogue 1"]);
    expect(formatShowcase(varied, { header: false })).toMatch(/^1\. 👓 \*Radda 1\*/);
    expect(formatShowcase(varied)).toMatch(/^Temos vários modelos/);
  });
  it("faixa com piso", () => {
    expect(applyPriceFilter(models, { minPrice: 500 }).map((item) => item.nomeComercial)).toEqual(["A", "E"]);
  });
  it("orçamento esquecido pela IA é preenchido com o que o cliente disse", () => {
    expect(withBudgetArgs({ termoBusca: "" }, { budget: { maxPrice: 250 }, cheap: true, category: "ARMACAO" })).toEqual({ termoBusca: "", maxPrice: 250, sortBy: "price_asc", tipo: "grau" });
    expect(withBudgetArgs({ maxPrice: 300 }, { budget: { maxPrice: 250 }, cheap: false, category: "" })).toEqual({ maxPrice: 300 });
  });
  it("tool aceita tipo, faixa e ordenação sem termo obrigatório", () => {
    const props = STOCK_TOOL.function.parameters.properties as Record<string, unknown>;
    for (const key of ["tipo", "minPrice", "maxPrice", "sortBy"]) expect(props).toHaveProperty(key);
    expect(STOCK_TOOL.function.parameters.required).toEqual([]);
  });
});

describe("público adulto por padrão", () => {
  it.each([
    ["ARM SP KIDS REF LW1839 46", "SP KIDS", true],
    ["ARM ATITUDE INFANTIL AT3000", "ATITUDE", true],
    ["ARM RAY BAN JUNIOR RJ9052", "RAY BAN", true],
    ["ARM TECNOL TEEN TN1", "TECNOL", true],
    ["ARM VOGUE REF VO5300 51", "VOGUE", false],
    ["ARM SKINNY REF SK10", "SKINNY", false],
  ])("%s → infantil %s", (description, brand, expected) => {
    expect(isKidsProduct({ description, brand })).toBe(expected);
  });

  it("só libera linha infantil quando o cliente fala de criança ou idade juvenil", () => {
    for (const text of ["é pro meu filho", "armação infantil", "minha neta de 8 anos", "pra uma criança", "tem kids?", "ele tem 12 anos", "minha filha adolescente"]) expect(mentionsKids(text)).toBe(true);
    for (const text of ["armação de grau barata", "até 250 reais", "tenho 35 anos", "quero pra mim", "armação pro meu marido"]) expect(mentionsKids(text)).toBe(false);
    expect(conversationWantsKids(["oi", "é pro meu filho de 10 anos", "Goiânia"])).toBe(true);
  });
});

describe("fechamento ativo com chamada para ação", () => {
  const vitrine = "Separei estas em Goiânia:\n1. 👓 *Vogue (Ref. VO5300)* — R$ 189,00\n2. 👓 *Atitude (Ref. AT1001)* — R$ 239,00";

  it("troca o \"Se quiser, posso te ajudar...\" por pergunta direta de avanço", () => {
    const reply = `${vitrine}\n---SPLIT---\nA Vogue é leve e a Atitude é resistente. Se quiser, posso te ajudar a pensar nas lentes junto com a armação.`;
    const fixed = activeClosing(reply, { city: "Goiânia", variant: 0 });
    expect(fixed).not.toMatch(/se quiser/i);
    expect(fixed).toContain("A Vogue é leve e a Atitude é resistente. Qual desses estilos combinou mais com você? Se já tiver a receita, pode me mandar foto aqui que eu calculo as lentes junto!");
    expect(fixed.split("---SPLIT---")[0].trim()).toBe(vitrine);
  });

  it("CTA cita a cidade; sem pergunta no fim, acrescenta; com pergunta ativa, mantém", () => {
    expect(activeCta({ city: "Goiânia", variant: 1 })).toBe("Quer que eu verifique em qual loja de Goiânia fica mais fácil pra você provar?");
    expect(activeClosing(`${vitrine}\n---SPLIT---\nFico à disposição!`, { city: "Goiânia", variant: 1 })).toMatch(/---SPLIT---\nQuer que eu verifique em qual loja de Goiânia fica mais fácil pra você provar\?$/);
    expect(activeClosing(vitrine, { variant: 0 })).toMatch(/R\$ 239,00\n---SPLIT---\nQual desses estilos combinou mais com você\?/);
    const active = `${vitrine}\n---SPLIT---\nQual delas combina mais com você?`;
    expect(activeClosing(active, { variant: 0 })).toBe(active);
  });

  it("regras do prompt proíbem fechamento passivo e trazem os CTAs", () => {
    for (const piece of ["FECHAMENTO ATIVO", "PROIBIDO fechar de forma passiva", "\"Se quiser, posso te ajudar...\"", "Qual desses estilos combinou mais com você?", "PÚBLICO ADULTO POR PADRÃO"]) expect(SALES_CONSULTANT_RULES).toContain(piece);
    expect(FORMAT_RULES).not.toMatch(/\(ex\.:[^)]*Se quiser, me diga/);
  });
});

describe("redação de vendedora, sem respostas enlatadas", () => {
  it("abertura da IA + vitrine exata; sem abertura usável, só a vitrine", () => {
    const vitrine = "Temos vários modelos disponíveis em estoque! Confira alguns deles:\n\n1. 👓 *Vogue (Ref. VO5300)* — R$ 189,00";
    expect(mergeProactiveReply("Perdão pela confusão! Olha as certas:", vitrine)).toBe(`Perdão pela confusão! Olha as certas:\n${vitrine}`);
    expect(mergeProactiveReply(`Olha só:\n${vitrine}\n---SPLIT---\nQual te agradou?`, vitrine)).toBe(`Olha só:\n${vitrine}\n---SPLIT---\nQual te agradou?`);
    expect(mergeProactiveReply("", vitrine)).toBe(vitrine);
    expect(mergeProactiveReply("Temos a Vogue por R$ 99,00!", vitrine)).toBe(vitrine);
  });
  it("regras proíbem clichês de robô e pedem argumento de venda e espelhamento", () => {
    for (const piece of ["Como posso ajudá-lo hoje?", "Aguarde um instante enquanto verifico", "ESPELHE O ESTILO", "ARGUMENTE COMO VENDEDORA", "no máximo 1 ou 2 perguntas", "REGRA DE OURO GEOGRÁFICA"]) expect(SALES_CONSULTANT_RULES).toContain(piece);
  });
  it("abertura da ficha varia entre respostas", () => {
    expect(new Set([0, 1, 2].map((variant) => cardOpening("Me mostra o Aviator", variant))).size).toBe(3);
    expect(new Set([0, 1, 2].map((variant) => cardOpening("Tem o Justin?", variant))).size).toBe(3);
  });
});
