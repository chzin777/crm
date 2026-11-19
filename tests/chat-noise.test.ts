import { describe, expect, it } from "vitest";
import { classifyNoise, isLaughOnly, isRandomLink } from "@/lib/chat/noise";

const text = (value: string) => classifyNoise({ type: "text", text: value, hasMedia: false });

describe("triagem de ruído", () => {
  it("ignora figurinha sem legenda, pontuação, emoji e risada", () => {
    expect(classifyNoise({ type: "sticker", text: "", hasMedia: true })).toBe("sticker");
    expect(text(".")).toBe("pontuacao");
    expect(text("..")).toBe("pontuacao");
    expect(text("?")).toBe("pontuacao");
    expect(text("  ")).toBe("pontuacao");
    expect(text("😂😂")).toBe("pontuacao");
    expect(text("kkkkk")).toBe("risada");
    expect(text("hahaha rsrs")).toBe("risada");
  });

  it("não ignora mensagens com conteúdo", () => {
    expect(text("oi")).toBeNull();
    expect(text("Quero aproveitar!")).toBeNull();
    expect(text("kkkk tem de sol?")).toBeNull();
    expect(isLaughOnly("kkk quanto custa?")).toBe(false);
    expect(classifyNoise({ type: "image", text: "", hasMedia: true })).toBeNull();
    expect(classifyNoise({ type: "audio", text: "", hasMedia: true })).toBeNull();
  });

  it("link aleatório sem pedido é ruído; link com dúvida comercial segue", () => {
    expect(text("https://www.youtube.com/watch?v=abc")).toBe("link");
    expect(text("olha isso https://vm.tiktok.com/xyz")).toBe("link");
    expect(isRandomLink("tem esse modelo? https://instagram.com/p/abc")).toBe(false);
    expect(isRandomLink("quero um igual a esse www.loja.com/oculos")).toBe(false);
  });
});

import { isGenericInterest, needsQualificationFirst } from "@/lib/ai/sales-consultant";

describe("qualificação pós-campanha", () => {
  it("resposta genérica à campanha exige qualificação antes de produtos", () => {
    for (const value of ["Quero aproveitar!", "Tenho interesse", "Oi", "Boa tarde, quero saber mais"]) expect(isGenericInterest(value)).toBe(true);
    expect(needsQualificationFirst({ category: "", brand: "", texts: ["Quero aproveitar!"], photo: false, selectedProduct: false, queued: false })).toBe(true);
  });

  it("pedido com tipo, marca ou foto segue para o catálogo", () => {
    expect(isGenericInterest("quero óculos de sol")).toBe(false);
    expect(isGenericInterest("tem Ray-Ban?")).toBe(false);
    expect(needsQualificationFirst({ category: "SOLAR", brand: "", texts: ["Quero aproveitar!"], photo: false, selectedProduct: false, queued: false })).toBe(false);
    expect(needsQualificationFirst({ category: "", brand: "", texts: ["Oi"], photo: true, selectedProduct: false, queued: false })).toBe(false);
  });
});
