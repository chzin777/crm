import { describe, expect, it, vi } from "vitest";
import { createProductImageService, deliverImageOrText, imageQuery, imageSearchConfig, IMAGE_CACHE_TTL_MS, IMAGE_SEARCH_TIMEOUT_MS, isDirectImageUrl, pickImage, searchWebImage, splitCaption, type ImageCache, type ImageCacheRow } from "@/lib/ai/product-image";

const product = { codigo: "7891234", produto: "RAYBAN RB4165 JUSTIN 601/8G 54", marca: "RAYBAN" };

function memoryCache(rows: ImageCacheRow[] = []): ImageCache & { rows: Map<string, ImageCacheRow> } {
  const map = new Map(rows.map((row) => [row.sku, row]));
  return {
    rows: map,
    get: async (sku) => map.get(sku) ?? null,
    set: async (row) => { map.set(row.sku, { ...row, updatedAt: new Date() }); },
    invalidate: async (sku) => { const row = map.get(sku); if (row) map.set(sku, { ...row, imageUrl: null, source: "invalid" }); },
  };
}

describe("cache da foto por código do produto", () => {
  it("cache válido no banco devolve a URL sem chamar a busca externa", async () => {
    const cache = memoryCache([{ sku: "7891234", query: "Ray-Ban RB4165 Justin óculos", imageUrl: "https://loja.com/rb4165.jpg", source: "web", updatedAt: new Date() }]);
    const search = vi.fn(async () => "https://outra.com/x.jpg");
    const find = createProductImageService({ cache, search });
    await expect(find(product)).resolves.toMatchObject({ url: "https://loja.com/rb4165.jpg", source: "cache" });
    expect(search).not.toHaveBeenCalled();
  });

  it("sem cache (ou vencido) busca na web e grava; sem foto grava a falta por 1 dia", async () => {
    const old = new Date(Date.now() - IMAGE_CACHE_TTL_MS - 1000);
    const cache = memoryCache([{ sku: "7891234", query: "q", imageUrl: "https://velha.com/a.jpg", source: "web", updatedAt: old }]);
    const search = vi.fn(async () => "https://nova.com/rb4165.jpg");
    const find = createProductImageService({ cache, search });
    await expect(find(product)).resolves.toMatchObject({ url: "https://nova.com/rb4165.jpg", source: "web", query: "Ray-Ban RB4165 Justin óculos" });
    expect(cache.rows.get("7891234")?.imageUrl).toBe("https://nova.com/rb4165.jpg");

    const missSearch = vi.fn(async () => null);
    const missFind = createProductImageService({ cache: memoryCache(), search: missSearch });
    await expect(missFind({ ...product, codigo: "999" })).resolves.toBeNull();
  });

  it("busca limpa: marca + modelo, sem cor e tamanho", () => {
    expect(imageQuery(product)).toBe("Ray-Ban RB4165 Justin óculos");
  });
});

describe("busca externa", () => {
  it("aceita só URL direta de imagem (https, jpg/png/webp), sem página, base64, miniatura ou rede social", () => {
    expect(isDirectImageUrl("https://cdn.loja.com.br/produtos/rb4165-justin.jpg?v=2")).toBe(true);
    expect(isDirectImageUrl("http://loja.com/a.jpg")).toBe(false);
    expect(isDirectImageUrl("https://loja.com/produto/rb4165")).toBe(false);
    expect(isDirectImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isDirectImageUrl("https://encrypted-tbn0.gstatic.com/images?q=tbn:abc.jpg")).toBe(false);
    expect(isDirectImageUrl("https://loja.com/thumbs/rb4165.jpg")).toBe(false);
    expect(isDirectImageUrl("https://scontent.cdninstagram.com/foto.jpg")).toBe(false);
    expect(pickImage([{ url: "https://a.com/x.webp" }, { url: "https://a.com/pagina" }, { url: "https://b.com/foto.jpg", width: 800, height: 600 }, { url: "https://c.com/mini.jpg", width: 60, height: 60 }])).toBe("https://b.com/foto.jpg");
  });

  it("Serper: payload, filtro dos resultados e sem chave → null", async () => {
    const fetch = vi.fn(async (_url: string, _init: { body?: string; headers?: Record<string, string>; signal: AbortSignal }) => ({ ok: true, status: 200, json: async () => ({ images: [{ imageUrl: "https://x.com/page" }, { imageUrl: "https://loja.com/rb.png", imageWidth: 600, imageHeight: 400 }] }) }));
    const config = imageSearchConfig({ SERPER_API_KEY: "k" });
    await expect(searchWebImage("Ray-Ban RB4165 Justin óculos", config, { fetch })).resolves.toBe("https://loja.com/rb.png");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://google.serper.dev/images");
    expect(JSON.parse(init.body!)).toMatchObject({ q: "Ray-Ban RB4165 Justin óculos" });
    expect(init.headers!["X-API-KEY"]).toBe("k");
    await expect(searchWebImage("x", imageSearchConfig({}), { fetch })).resolves.toBeNull();
    expect(imageSearchConfig({ GOOGLE_CSE_API_KEY: "a", GOOGLE_CSE_CX: "b" })).toMatchObject({ provider: "google_cse" });
  });

  it("respeita o limite de 3 s: busca lenta vira null sem erro", async () => {
    expect(IMAGE_SEARCH_TIMEOUT_MS).toBe(3000);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hanging = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise<never>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("timeout")))));
    const started = Date.now();
    await expect(searchWebImage("q", { provider: "serper", key: "k" }, { fetch: hanging, timeoutMs: 30 })).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    warn.mockRestore();
  });
});

describe("envio no WhatsApp com volta para texto", () => {
  it("foto com legenda; se falhar, invalida o cache e envia a resposta em texto", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sendText = vi.fn(async () => undefined);
    const invalidate = vi.fn(async () => undefined);
    const failing = vi.fn(async () => { throw new Error("Meta: media download error"); });
    await expect(deliverImageOrText({ sendImage: failing, sendText, invalidate }, "Temos o RB4165 na Loja Centro.")).resolves.toBe("text");
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith("Temos o RB4165 na Loja Centro.");

    const sendImage = vi.fn(async () => undefined);
    const text2 = vi.fn(async () => undefined);
    await expect(deliverImageOrText({ sendImage, sendText: text2, invalidate: vi.fn() }, "Curta")).resolves.toBe("image");
    expect(sendImage).toHaveBeenCalledWith("Curta");
    expect(text2).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("legenda até 1024 caracteres; o restante vai em seguida como texto", async () => {
    const long = `${"Temos o modelo em várias lojas. ".repeat(40)}\n\nFinal da mensagem.`;
    const { caption, rest } = splitCaption(long);
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(`${caption} ${rest}`.replace(/\s+/g, " ")).toBe(long.replace(/\s+/g, " "));
    const sendImage = vi.fn(async () => undefined);
    const sendText = vi.fn(async () => undefined);
    await deliverImageOrText({ sendImage, sendText, invalidate: vi.fn() }, long);
    expect(sendImage.mock.calls[0][0].length).toBeLessThanOrEqual(1024);
    expect(sendText).toHaveBeenCalledWith(rest);
  });
});
