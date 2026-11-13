import { describe, expect, it } from "vitest";
import { buildShowcaseResult, fallbackReference, showcaseCandidates } from "@/lib/ai/stock-showcase";
import { ambiguousChoiceQuestion, choicePosition, choicePrice, extractListedProducts, parseShowcase, repeatsShowcase, resolveListedChoice } from "@/lib/ai/showcase-choice";
import type { StoreInfo } from "@/lib/ai/stock";

// Cadastro real da Radda: modelos com "REF-" e um sem "REF" (o "Radda" genérico que abria o loop).
const RADDA = [
  { code: "140701", description: "ARM RADDA    OPBR 455 C2", brand: "RADDA" },
  { code: "145145", description: "ARM RADDA       REF- JC60020 C6 53", brand: "RADDA" },
  { code: "145168", description: "ARM RADDA       REF- JC60020 C2 53", brand: "RADDA" },
  { code: "145154", description: "ARM RADDA       REF- JC2501 C6 53", brand: "RADDA" },
  { code: "145149", description: "ARM RADDA       REF- JC60016 C4 54", brand: "RADDA" },
];
const stores = new Map<string, StoreInfo>([["36", { name: "LJ 36", address: "RUA 9", addressNumber: "2106", neighborhood: "SETOR MARISTA", city: "GOIANIA" }]]);
const unit = (qty: number) => [{ unit: "36", name: "LJ 36 OTICAS", qty, price: 120 }];
const raddaShowcase = () => buildShowcaseResult({
  term: "Radda",
  groups: showcaseCandidates(RADDA),
  lookup: { stockStatus: "ok", fromCache: 0, requested: 5, byCode: { "140701": unit(2), "145145": unit(1), "145168": unit(1), "145154": unit(3), "145149": unit(1) } },
  stores,
  withPrices: true,
  brand: "RADDA",
});

describe("vitrine de marca numerada e identificável", () => {
  it("item sem REF ganha a referência do cadastro e vai para o fim; cores do mesmo modelo viram 1 item", () => {
    expect(fallbackReference("ARM RADDA    OPBR 455 C2", "RADDA")).toBe("OPBR 455");
    expect(fallbackReference("ARM RADDA", "RADDA")).toBeNull();
    const result = raddaShowcase();
    expect(result.vitrineFormatada?.split("\n").slice(2)).toEqual([
      "1. 👓 *Radda (Ref. JC60020)* — R$ 120,00",
      "2. 👓 *Radda (Ref. JC2501)* — R$ 120,00",
      "3. 👓 *Radda (Ref. JC60016)* — R$ 120,00",
      "4. 👓 *Radda (Ref. OPBR 455)* — R$ 120,00",
    ]);
    // Nenhum item indistinguível ("Radda" sem referência).
    expect(result.modelos.every((model) => model.referencia)).toBe(true);
  });

  it("listedProducts lidos da vitrine da sessão, na ordem exibida", () => {
    const listed = extractListedProducts(["Oi!", `${raddaShowcase().vitrineFormatada}`, "Gostaria de ver a foto, lojas disponíveis e mais detalhes de algum desses modelos?"]);
    expect(listed[0]).toEqual({ index: 1, sku: null, referencia: "JC60020", nomeComercial: "Radda", preco: 120 });
    expect(listed.map((item) => item.referencia)).toEqual(["JC60020", "JC2501", "JC60016", "OPBR 455"]);
    expect(parseShowcase("📦 *Estoque:* 2 unidades")).toEqual([]);
  });
});

describe("escolha na vitrine sem refazer a busca ampla", () => {
  const listed = extractListedProducts([raddaShowcase().vitrineFormatada!]);

  it("posição, número, último e referência", () => {
    expect(choicePosition("ata, deixa eu ver esse primeiro", 4)).toBe(1);
    expect(choicePosition("o segundo", 4)).toBe(2);
    expect(choicePosition("1", 4)).toBe(1);
    expect(choicePosition("quero o 3", 4)).toBe(3);
    expect(choicePosition("o último", 4)).toBe(4);
    expect(choicePosition("esse de 120 ai", 4)).toBeNull();
    expect(resolveListedChoice("ata, deixa eu ver esse primeiro", listed)).toMatchObject({ type: "item", item: { index: 1, referencia: "JC60020" } });
    expect(resolveListedChoice("me mostra o jc2501", listed)).toMatchObject({ type: "item", item: { index: 2 } });
  });

  it("preço repetido em vários itens é ambíguo: pergunta número ou referência, sem repetir a lista", () => {
    expect(choicePrice("deixa eu ver esse de 120 ai")).toBe(120);
    const choice = resolveListedChoice("deixa eu ver esse de 120 ai", listed);
    expect(choice).toMatchObject({ type: "ambiguous", price: 120 });
    const question = choice?.type === "ambiguous" ? ambiguousChoiceQuestion(choice.items, choice.price) : "";
    expect(question).toBe("Vários desses modelos Radda estão por R$ 120,00! Qual número ou referência você quer ver primeiro? (ex.: o 1 - Ref. JC60020, ou o 2 - Ref. JC2501)");
    expect(parseShowcase(question)).toEqual([]);
  });

  it("preço único abre o item direto", () => {
    const mixed = [...listed.slice(0, 2), { ...listed[2], preco: 830 }];
    expect(resolveListedChoice("o de 830", mixed)).toMatchObject({ type: "item", item: { index: 3 } });
  });

  it("detecta a mesma vitrine reenviada", () => {
    expect(repeatsShowcase(raddaShowcase().vitrineFormatada!, listed)).toBe(true);
    expect(repeatsShowcase("Vários desses modelos Radda estão por R$ 120,00!", listed)).toBe(false);
  });
});
