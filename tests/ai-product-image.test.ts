import { describe, expect, it, vi } from "vitest";
import { createProductImageService, deliverImageOrText, imageQuery, imageSearchConfig, IMAGE_CACHE_TTL_MS, IMAGE_MAX_BYTES, IMAGE_SEARCH_TIMEOUT_MS, isDirectImageUrl, isUsableImage, pickImage, searchFreeImages, searchWebImages, splitCaption, type ImageCache, type ImageCacheRow } from "@/lib/ai/product-image";

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

type Init = { method?: string; headers?: Record<string, string>; body?: string; signal: AbortSignal };
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

/** DuckDuckGo e Bing simulados (sem rede). */
function freeWeb(options: { ddg?: "ok" | "down"; bing?: string[] } = {}) {
  return vi.fn(async (url: string, _init: Init) => {
    if (url.startsWith("https://duckduckgo.com/?")) return options.ddg === "down" ? reply("erro", 503) : reply('<script>vqd="4-12345"</script>');
    if (url.startsWith("https://duckduckgo.com/i.js")) {
      expect(url).toContain("vqd=4-12345");
      return reply({ results: [{ image: "https://loja.com/rb4165.webp", width: 800, height: 600 }, { image: "https://loja.com/rb4165.jpg", width: 800, height: 600 }, { image: "https://loja.com/rb4165.svg" }] });
    }
    if (url.startsWith("https://www.bing.com/images/async")) return reply((options.bing ?? []).map((link) => `<a m="{&quot;murl&quot;:&quot;${link}&quot;}">`).join(""));
    return reply("?", 404);
  });
}

describe("cache da foto por código do produto (30 dias)", () => {
  it("cache válido no banco devolve a URL sem chamar a busca externa", async () => {
    const cache = memoryCache([{ sku: "7891234", query: "Ray-Ban RB4165 Justin óculos", imageUrl: "https://loja.com/rb4165.jpg", source: "web", updatedAt: new Date() }]);
    const search = vi.fn(async () => ["https://outra.com/x.jpg"]);
    const find = createProductImageService({ cache, search });
    await expect(find(product)).resolves.toMatchObject({ url: "https://loja.com/rb4165.jpg", source: "cache" });
    expect(search).not.toHaveBeenCalled();
  });

  it("grava no cache só a foto que passou na conferência (JPG/PNG até 5 MB); cache vencido busca de novo", async () => {
    const old = new Date(Date.now() - IMAGE_CACHE_TTL_MS - 1000);
    const cache = memoryCache([{ sku: "7891234", query: "q", imageUrl: "https://velha.com/a.jpg", source: "web", updatedAt: old }]);
    const search = vi.fn(async () => ["https://bloqueada.com/a.jpg", "https://nova.com/rb4165.jpg"]);
    const validate = vi.fn(async (url: string) => !url.includes("bloqueada"));
    const find = createProductImageService({ cache, search, validate });
    await expect(find(product)).resolves.toMatchObject({ url: "https://nova.com/rb4165.jpg", source: "web", query: "Ray-Ban RB4165 Justin óculos" });
    expect(cache.rows.get("7891234")).toMatchObject({ imageUrl: "https://nova.com/rb4165.jpg", source: "web" });

    const none = createProductImageService({ cache: memoryCache(), search: async () => [], validate });
    await expect(none({ ...product, codigo: "999" })).resolves.toBeNull();
  });

  it("busca limpa: marca + modelo, sem cor e tamanho", () => {
    expect(imageQuery(product)).toBe("Ray-Ban RB4165 Justin óculos");
  });
});

describe("busca gratuita sem chave (DuckDuckGo → Bing)", () => {
  it("sem SERPER_API_KEY no ambiente a busca funciona pelo provedor gratuito", async () => {
    expect(imageSearchConfig({})).toEqual({ provider: "free" });
    const fetch = freeWeb();
    await expect(searchWebImages("Ray-Ban RB4165 Justin óculos", imageSearchConfig({}), { fetch })).resolves.toEqual(["https://loja.com/rb4165.jpg"]);
    const init = fetch.mock.calls[0][1];
    expect(init.headers?.["User-Agent"]).toMatch(/Mozilla/);
    expect(init.headers?.["Accept-Language"]).toMatch(/pt-BR/);
  });

  it("DuckDuckGo fora do ar → Bing Imagens", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetch = freeWeb({ ddg: "down", bing: ["https://cdn.otica.com/rb4165-justin.png", "https://cdn.otica.com/a.webp"] });
    await expect(searchFreeImages("q", { fetch })).resolves.toEqual(["https://cdn.otica.com/rb4165-justin.png"]);
    warn.mockRestore();
  });

  it("chave dedicada (opcional) tem prioridade; se falhar, cai na busca gratuita", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const free = freeWeb();
    const fetch = vi.fn(async (url: string, init: Init) => (url.includes("serper") ? reply({ error: "quota" }, 429) : free(url, init)));
    expect(imageSearchConfig({ SERPER_API_KEY: "k" })).toMatchObject({ provider: "serper" });
    await expect(searchWebImages("q", imageSearchConfig({ SERPER_API_KEY: "k" }), { fetch })).resolves.toEqual(["https://loja.com/rb4165.jpg"]);
    expect(fetch.mock.calls[0][0]).toBe("https://google.serper.dev/images");
    warn.mockRestore();
  });

  it("só JPG/JPEG/PNG diretos: sem WebP, SVG, página, base64, miniatura ou rede social", () => {
    expect(isDirectImageUrl("https://cdn.loja.com.br/produtos/rb4165-justin.jpg?v=2")).toBe(true);
    expect(isDirectImageUrl("https://images2.ray-ban.com/x/0RB4165__601_8G__STD__shad__qt.png?impolicy=RB")).toBe(true);
    expect(isDirectImageUrl("https://loja.com/rb4165.webp")).toBe(false);
    expect(isDirectImageUrl("https://loja.com/rb4165.svg")).toBe(false);
    expect(isDirectImageUrl("http://loja.com/a.jpg")).toBe(false);
    expect(isDirectImageUrl("https://loja.com/produto/rb4165")).toBe(false);
    expect(isDirectImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isDirectImageUrl("https://encrypted-tbn0.gstatic.com/images?q=tbn:abc.jpg")).toBe(false);
    expect(isDirectImageUrl("https://scontent.cdninstagram.com/foto.jpg")).toBe(false);
    expect(pickImage([{ url: "https://c.com/mini.jpg", width: 60, height: 60 }, { url: "https://b.com/foto.jpg", width: 800, height: 600 }])).toBe("https://b.com/foto.jpg");
  });

  it("conferência do arquivo: JPG/PNG até 5 MB passa; WebP disfarçado ou grande demais não", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const file = (mime: string, size: number) => async () => new Response(new Uint8Array(size), { headers: { "content-type": mime } });
    await expect(isUsableImage("https://a.com/x.jpg", { fetch: file("image/jpeg", 50_000) })).resolves.toBe(true);
    await expect(isUsableImage("https://a.com/x.png", { fetch: file("image/png", 50_000) })).resolves.toBe(true);
    await expect(isUsableImage("https://a.com/x.jpg", { fetch: file("image/webp", 50_000) })).resolves.toBe(false);
    await expect(isUsableImage("https://a.com/x.jpg", { fetch: file("image/jpeg", IMAGE_MAX_BYTES + 1) })).resolves.toBe(false);
    warn.mockRestore();
  });

  it("busca gratuita lenta respeita o limite (3 s) e volta vazia, sem erro → a resposta segue só em texto", async () => {
    expect(IMAGE_SEARCH_TIMEOUT_MS).toBe(3000);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hanging = vi.fn((_url: string, init: Init) => new Promise<never>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("timeout")))));
    const started = Date.now();
    await expect(searchFreeImages("q", { fetch: hanging, timeoutMs: 30 })).resolves.toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
    // Sem foto, o serviço devolve null: a IA manda só o texto.
    const find = createProductImageService({ cache: memoryCache(), search: () => searchFreeImages("q", { fetch: hanging, timeoutMs: 30 }) });
    await expect(find(product)).resolves.toBeNull();
    warn.mockRestore();
  });
});

describe("envio no WhatsApp com volta para texto", () => {
  it("foto com legenda; se falhar, invalida o cache e envia a resposta em texto", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sendText = vi.fn(async (_text: string) => undefined);
    const invalidate = vi.fn(async () => undefined);
    const failing = vi.fn(async () => { throw new Error("Meta: media download error"); });
    await expect(deliverImageOrText({ sendImage: failing, sendText, invalidate }, "Temos o RB4165 na Loja Centro.")).resolves.toBe("text");
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith("Temos o RB4165 na Loja Centro.");

    const sendImage = vi.fn(async (_caption: string) => undefined);
    const text2 = vi.fn(async (_text: string) => undefined);
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
    const sendImage = vi.fn(async (_caption: string) => undefined);
    const sendText = vi.fn(async (_text: string) => undefined);
    await deliverImageOrText({ sendImage, sendText, invalidate: vi.fn() }, long);
    expect(sendImage.mock.calls[0][0].length).toBeLessThanOrEqual(1024);
    expect(sendText).toHaveBeenCalledWith(rest);
  });
});
