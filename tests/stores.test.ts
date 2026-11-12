import { describe, expect, it } from "vitest";
import { compareStoreNames, storeDisplayName, storeErpCode } from "@/lib/stores";

describe("lojas", () => {
  it("mostra o nome cadastrado, sem o sequencial interno", () => {
    expect(storeDisplayName({ number: 6, name: "LJ 13 UNILENTES IND COM DE LENTES LTDA" })).toBe("LJ 13 UNILENTES IND COM DE LENTES LTDA");
    expect(storeDisplayName({ number: 6, name: "  " })).toBe("Loja 6");
  });

  it("lê o código ERP do nome, com ou sem zero à esquerda", () => {
    expect(storeErpCode("LJ 13 UNILENTES")).toBe("13");
    expect(storeErpCode("OPTICA BRASIL LTDA LJ 05 (BAIXADA)")).toBe("5");
    expect(storeErpCode("LJ 39-ZVC FLAMBOYANT")).toBe("39");
    expect(storeErpCode("ADM UNILENTES IND COM DE LENTES LTDA")).toBeNull();
  });

  it("ordena pelo número dentro do nome", () => {
    expect(["LJ 10 A", "LJ 2 B", "LJ 01 C"].sort(compareStoreNames)).toEqual(["LJ 01 C", "LJ 2 B", "LJ 10 A"]);
  });
});
