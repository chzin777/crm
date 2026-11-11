import { describe, expect, it } from "vitest";
import { formatPhone, phoneVariants } from "@/lib/chat/phone";

describe("variantes de telefone", () => {
  it("número do WhatsApp com DDI 55 e nono dígito gera as formas do cadastro", () => {
    const variants = phoneVariants("5562999887766");
    expect(variants).toEqual(expect.arrayContaining(["5562999887766", "62999887766", "6299887766", "556299887766", "(62) 99988-7766", "(62) 9988-7766"]));
  });

  it("número sem DDI ganha a forma com 55", () => {
    expect(phoneVariants("62999887766")).toEqual(expect.arrayContaining(["5562999887766", "62999887766"]));
  });

  it("número antigo sem o nono dígito ganha a forma com 9", () => {
    expect(phoneVariants("556298887766")).toEqual(expect.arrayContaining(["62998887766", "5562998887766", "6298887766"]));
  });

  it("remove caracteres especiais antes de comparar", () => {
    expect(phoneVariants("+55 (62) 99988-7766")).toEqual(expect.arrayContaining(["5562999887766", "62999887766"]));
  });

  it("não repete variantes", () => {
    const variants = phoneVariants("5562999887766");
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe("formatação de telefone", () => {
  it("celular com e sem DDI", () => {
    expect(formatPhone("5562999887766")).toBe("(62) 99988-7766");
    expect(formatPhone("62999887766")).toBe("(62) 99988-7766");
  });

  it("fixo com 10 dígitos", () => {
    expect(formatPhone("6232101234")).toBe("(62) 3210-1234");
  });

  it("número fora do padrão volta como veio", () => {
    expect(formatPhone("12345")).toBe("12345");
  });
});
