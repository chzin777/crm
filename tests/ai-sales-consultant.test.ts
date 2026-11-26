import { describe, expect, it } from "vitest";
import { asksCustomerCity, cityQuestion, extractBudget, isProductBrowseRequest, wantsCheap } from "@/lib/ai/catalog-context";
import { activeClosing, activeCta, asksGlassesType, asksSpecificModel, FRAME_PRICE_NOTE, isBroadStockCall, isGenericGlassesRequest, needsTypeFirst, oneQualifyingQuestion, priceTransparency, qualifyQuestion, SUN_PRICE_NOTE, budgetBlock, conversationBudget, conversationWantsKids, isGatedStockCall, mergeProactiveReply, needsCityFirst, withBudgetArgs } from "@/lib/ai/sales-consultant";
import { isKidsProduct, mentionsKids } from "@/lib/ai/catalog-search";

import { applyPriceFilter, diverseByBrand, formatShowcase, type ShowcaseModel } from "@/lib/ai/stock-showcase";
import { STOCK_TOOL } from "@/lib/ai/stock";
import { cardOpening } from "@/lib/ai/product-card";
import { SALES_CONSULTANT_RULES, FORMAT_RULES, loadPromptModule } from "./helpers/prompt-seed";


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

describe("óculos sem tipo: grau ou sol", () => {
  it("detecta pedido genérico de óculos", () => {
    for (const text of ["quero um óculos mais em conta", "tem óculos barato?", "procuro um oculos"]) expect(isGenericGlassesRequest(text)).toBe(true);
    for (const text of ["óculos de grau barato", "óculos de sol até 300", "quero uma armação", "óculos Ray-Ban", "óculos pra leitura", "tem algo barato?"]) expect(isGenericGlassesRequest(text)).toBe(false);
  });
  it("pergunta o tipo até o cliente dizer (categoria da sessão)", () => {
    const base = { brand: "", photo: false, selectedProduct: false, queued: false };
    expect(needsTypeFirst({ ...base, category: "", texts: ["quero um óculos mais em conta", "Goiânia"] })).toBe(true);
    expect(needsTypeFirst({ ...base, category: "ARMACAO", texts: ["quero um óculos mais em conta", "de grau"] })).toBe(false);
    expect(needsTypeFirst({ ...base, category: "", brand: "Ray-Ban", texts: ["óculos ray-ban"] })).toBe(false);
  });
  it("qualificação com 1 pergunta simples por vez: cidade → grau ou sol → valor", () => {
    const city = qualifyQuestion({ askCity: true, askType: true, askBudget: true, variant: 0 });
    expect(city).toBe("De qual cidade você fala, pra eu ver as lojas mais perto de você?");
    expect(asksGlassesType(city)).toBe(false);
    expect(city).not.toMatch(/valor|R\$|gastar|bairro/);
    expect(qualifyQuestion({ askCity: false, askType: true, askBudget: true, variant: 1 })).toBe("Seria óculos de grau ou de sol?");
    expect(qualifyQuestion({ askCity: false, askType: false, askBudget: true, variant: 0 })).toBe("Quanto você está pensando em gastar mais ou menos?");
    expect(oneQualifyingQuestion("Que presente bonito! De qual cidade (ou bairro) você fala? E tem uma faixa de valor em mente, tipo até uns R$ 200, R$ 300?", "city")).toBe("Que presente bonito! De qual cidade você fala?");
    expect(oneQualifyingQuestion("De qual cidade você fala, e é de grau ou de sol?", "city")).toBe("De qual cidade você fala?");
    expect(oneQualifyingQuestion("Perfeito! Você procura óculos de grau ou de sol? E quanto pensa em gastar?", "type")).toBe("Perfeito! Você procura óculos de grau ou de sol?");
    expect(isBroadStockCall({ sortBy: "price_asc" })).toBe(true);
    expect(isBroadStockCall({ termoBusca: "Ray-Ban Justin", tipoBusca: "modelo_especifico" })).toBe(false);
  });
});

describe("transparência comercial: armação x lentes", () => {
  const grau = "Separei estas:\n1. 👓 *Vogue (Ref. VO5300)* — R$ 189,00\n2. 👓 *Atitude (Ref. AT1001)* — R$ 239,00";
  const sol = "Olha essas:\n1. 🕶️ *Ray-Ban (Ref. RB2140)* — R$ 799,00\n2. 🕶️ *Oakley (Ref. OO9102)* — R$ 750,00";

  it("armação de grau: avisa que o valor é da armação e as lentes são orçadas à parte conforme a receita", () => {
    const reply = priceTransparency(`${grau}\n---SPLIT---\nQual combinou mais com você?`);
    expect(reply).toContain(`---SPLIT---\n${FRAME_PRICE_NOTE} Qual combinou mais com você?`);
    expect(priceTransparency(grau)).toBe(`${grau}\n---SPLIT---\n${FRAME_PRICE_NOTE}`);
    // A IA já explicou: nada duplicado.
    const explained = `${grau}\n---SPLIT---\nO valor é só da armação, as lentes são orçadas à parte pela receita. Qual te agradou?`;
    expect(priceTransparency(explained)).toBe(explained);
  });
  it("óculos de sol: valor da peça completa; ficha de armação de grau também ganha o aviso", () => {
    expect(priceTransparency(`${sol}\n---SPLIT---\nQual te agradou?`)).toContain(`${SUN_PRICE_NOTE} Qual te agradou?`);
    const card = "Temos sim! 😊\n\n🕶️ *Vogue | Ref. VO5300*\nⓂ️ *Modelo:* Armação de grau\n💵 *Valor:* R$ 189,00\n📦 *Estoque:* 1 unidade disponível na seguinte loja:\n📍 *Loja Setor Bueno* - Goiânia — 1 unidade";
    expect(priceTransparency(`${card}\n---SPLIT---\nGostaria de reservar?`)).toContain(`${FRAME_PRICE_NOTE} Gostaria de reservar?`);
    expect(priceTransparency("Boa tarde! Em que posso te ajudar?")).toBe("Boa tarde! Em que posso te ajudar?");
  });
  it("vitrine + aviso + CTA ativo no fim", () => {
    const final = activeClosing(priceTransparency(grau), { variant: 0 });
    expect(final).toBe(`${grau}\n---SPLIT---\n${FRAME_PRICE_NOTE} Qual desses estilos combinou mais com você? Se já tiver a receita, pode me mandar foto aqui que eu calculo as lentes junto!`);
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

  it("regras do prompt conduzem o próximo passo sem fechamento passivo nem frase pronta", () => {
    for (const piece of ["PRÓXIMO PASSO", "nunca fechamento passivo de telemarketing", "PÚBLICO ADULTO POR PADRÃO"]) expect(SALES_CONSULTANT_RULES).toContain(piece);
    expect(SALES_CONSULTANT_RULES).not.toMatch(/"[^"]{20,}"/);
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
    for (const piece of ["CONSULTORIA GENUÍNA", "comente brevemente, com suas palavras, por que aquelas peças combinam", "GEOGRAFIA", "lentes são orçadas conforme a receita"]) expect(SALES_CONSULTANT_RULES).toContain(piece);
    for (const piece of ["LEIA O FIO INTEIRO", "MENSAGENS VAGAS", "Sem bordões", "Como gente no WhatsApp", "ESCOPO E LIMITES"]) expect(loadPromptModule("core")).toContain(piece);
  });
  it("abertura da ficha varia entre respostas", () => {
    expect(new Set([0, 1, 2].map((variant) => cardOpening("Me mostra o Aviator", variant))).size).toBe(3);
    expect(new Set([0, 1, 2].map((variant) => cardOpening("Tem o Justin?", variant))).size).toBe(3);
  });
});
