import { describe, expect, it } from "vitest";
import { searchStoreLinks, storeLinkSummary } from "@/components/StoreLinkSelect";

const stores = [
  { code: "4", name: "LJ 4 - SHOPPING FLAMBOYANT GOIÂNIA" },
  { code: "13", name: "LJ 13 - CENTRO ANÁPOLIS" },
  { code: "23", name: "LJ 23 - BURITI RIO VERDE" },
];

describe("Lojas vinculadas (ERP VMSet) no modal de usuário", () => {
  it("resumo do botão fechado: nenhuma, uma, várias e todas", () => {
    expect(storeLinkSummary(stores, [])).toBe("Nenhuma loja selecionada");
    expect(storeLinkSummary(stores, ["13"])).toBe("LJ 13 - CENTRO ANÁPOLIS");
    expect(storeLinkSummary(stores, ["4", "23"])).toBe("2 lojas selecionadas");
    expect(storeLinkSummary(stores, ["23", "4", "13"])).toBe("Todas as lojas (3)");
    // Loja vinculada que saiu do cadastro continua aparecendo pelo código.
    expect(storeLinkSummary(stores, ["99"])).toBe("Loja 99");
  });

  it("busca por número, nome ou cidade, sem acento e sem caixa", () => {
    expect(searchStoreLinks(stores, "13").map((store) => store.code)).toEqual(["13"]);
    expect(searchStoreLinks(stores, "loja 4").map((store) => store.code)).toEqual(["4"]);
    expect(searchStoreLinks(stores, "anapolis").map((store) => store.code)).toEqual(["13"]);
    expect(searchStoreLinks(stores, "goiania flamboyant").map((store) => store.code)).toEqual(["4"]);
    expect(searchStoreLinks(stores, "")).toHaveLength(3);
  });
});
