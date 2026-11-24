import { describe, expect, it, vi } from "vitest";
import { createProductImageService, imageSourceRank, isBlockedImageSource, isCleanImageResult, pickImages, searchWebImages, type ImageCacheRow } from "@/lib/ai/product-image";

const clean = "https://cdn.vnda.com.br/oculos-ray-ban-rb3548n.jpg";

describe("filtro de origem das fotos externas", () => {
  it("bloqueia marketplaces, agregadores, concorrentes e redes sociais (imagem ou página)", () => {
    for (const url of [
      "https://media.pelando.com.br/share/oculos-sol-ray-ban-hexagonal-rb3548nl-dourado-7a15.jpeg",
      "https://m.media-amazon.com/images/I/61abc.jpg",
      "https://www.amazon.com.br/dp/B0ABC/foto.jpg",
      "https://http2.mlstatic.com/D_NQ_NP_123.jpg",
      "https://produto.mercadolivre.com.br/MLB-123.jpg",
      "https://a-static.mlcdn.com.br/450x450/oculos.jpg",
      "https://down-br.img.susercontent.com/file/abc.jpg",
      "https://grandvision-media.imgix.net/foto.png",
    ]) expect(isBlockedImageSource(url), url).toBe(true);
    expect(isBlockedImageSource(clean)).toBe(false);
    expect(isCleanImageResult({ url: clean, pageUrl: "https://www.pelando.com.br/d/ray-ban-rb3548" })).toBe(false);
  });

  it("rejeita resultado com preço, desconto ou cara de anúncio no título/fonte", () => {
    expect(isCleanImageResult({ url: clean, title: "Óculos Ray-Ban Hexagonal RB3548NL por R$ 399" })).toBe(false);
    expect(isCleanImageResult({ url: clean, title: "Ray-Ban RB3548 30% OFF" })).toBe(false);
    expect(isCleanImageResult({ url: clean, title: "Promoção Ray-Ban com frete grátis" })).toBe(false);
    expect(isCleanImageResult({ url: clean, title: "Cupom Ray-Ban" })).toBe(false);
    expect(isCleanImageResult({ url: clean, source: "Amazon.com.br" })).toBe(false);
    expect(isCleanImageResult({ url: "https://loja.exemplo.com.br/oferta-ray-ban-rb3548.jpg" })).toBe(false);
    expect(isCleanImageResult({ url: clean, title: "Ray-Ban Hexagonal RB3548N Dourado" })).toBe(true);
  });

  it("site próprio e fabricante oficial vêm antes das demais lojas", () => {
    const urls = pickImages([
      { url: clean, title: "Ray-Ban RB3548" },
      { url: "https://assets.ray-ban.com/is/image/RayBan/8056597_000A.png", pageUrl: "https://www.ray-ban.com/brazil/oculos-de-sol/RB3548" },
      { url: "https://media.pelando.com.br/share/ray-ban-rb3548.jpeg", title: "Ray-Ban por R$ 399" },
      { url: "https://www.oticasbrasil.com.br/media/rb3548.jpg" },
    ]);
    expect(urls).toEqual(["https://www.oticasbrasil.com.br/media/rb3548.jpg", "https://assets.ray-ban.com/is/image/RayBan/8056597_000A.png", clean]);
    expect(imageSourceRank({ url: "https://assets.ray-ban.com/x.png" })).toBe(1);
  });

  it("a busca leva termos negativos e descarta o resultado do Pelando com R$ 399", async () => {
    const queries: string[] = [];
    const fetch = vi.fn(async (url: string) => {
      queries.push(decodeURIComponent(url));
      if (url.includes("i.js")) {
        return { ok: true, status: 200, text: async () => "", json: async () => ({ results: [
          { image: "https://media.pelando.com.br/share/oculos-sol-ray-ban-hexagonal-rb3548nl-dourado-7a15.jpeg", url: "https://www.pelando.com.br/d/abc", title: "Óculos Ray-Ban Hexagonal RB3548NL - R$ 399 na Amazon", width: 800, height: 800 },
          { image: "https://cdn.loja.com.br/ray-ban-rb3548.jpg", url: "https://loja.com.br/ray-ban-rb3548", title: "Ray-Ban RB3548 Hexagonal", width: 800, height: 800 },
        ] }) };
      }
      return { ok: true, status: 200, text: async () => "vqd=\"4-123\"", json: async () => ({}) };
    });
    const urls = await searchWebImages("Ray-Ban RB3548NL óculos de sol", { provider: "free" }, { fetch });
    expect(urls).toEqual(["https://cdn.loja.com.br/ray-ban-rb3548.jpg"]);
    expect(queries[0]).toMatch(/-amazon -pelando -mercadolivre -shopee .*-promocao -oferta -desconto -cupom/);
  });

  it("foto do Pelando já salva no cache é descartada e buscada de novo", async () => {
    const row: ImageCacheRow = { sku: "146184", query: "Ray-Ban Hexagonal RB3548NL óculos de sol", imageUrl: "https://media.pelando.com.br/share/oculos-sol-ray-ban-hexagonal-rb3548nl-dourado-7a15.jpeg", source: "web", updatedAt: new Date() };
    const set = vi.fn(async () => undefined);
    const search = vi.fn(async () => ["https://m.media-amazon.com/images/I/rb.jpg", clean]);
    const service = createProductImageService({ cache: { get: async () => row, set, invalidate: async () => undefined }, search });
    const image = await service({ codigo: "146184", produto: "Ray-Ban Hexagonal RB3548NL", categoria: "OCULOS SOLAR" });
    expect(search).toHaveBeenCalledOnce();
    expect(image?.url).toBe(clean);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: clean }));
  });
});
