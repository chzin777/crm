import { describe, expect, it, vi } from "vitest";
import { buildSystemPrompt, customerMessages, interpretDecision, preAgentOutcome } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { sendBubbles } from "@/lib/ai/bubbles";
import { humanizeProductName, modelKey, NATURAL_RULES, parseErpName } from "@/lib/ai/product-names";
import { buildDetailsResult, cleanDetails, createProductDetailsService, DETAILS_RULES, DETAILS_TOOL, webSearchDetails, type DetailsCacheRow } from "@/lib/ai/product-details";
import { deliverLocation, findStores, googleMapsUrl, LOCATION_RULES, LOCATION_TOOL, locationPayload, locationText, storeLocation } from "@/lib/ai/store-location";
import { CLOSING_RULES, isCourtesyClosing, isFarewell, NO_REPLY_TOKEN, silentClosing } from "@/lib/ai/closing";
import type { StoreInfo } from "@/lib/ai/stock";

const prompt = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" });

describe("nomes do ERP humanizados e redação anti-robô", () => {
  it('"ARM MIUMIU REF 0MU 01XV 19P1O150" vira "Armação Miu Miu (ref. 0MU 01XV)"', () => {
    expect(humanizeProductName("ARM MIUMIU REF 0MU 01XV 19P1O150", "MIUMIU")).toBe("Armação Miu Miu (ref. 0MU 01XV)");
    expect(humanizeProductName("OCS RAY BAN REF-RB4165 JUSTIN 601/8G", "RAY BAN")).toBe("Óculos de sol Ray-Ban (ref. RB4165 Justin)");
    expect(humanizeProductName("OCS RAY BAN REF 0RB3025L L2823 58", "RAY BAN")).toBe("Óculos de sol Ray-Ban (ref. 0RB3025L)");
    expect(parseErpName("OCS RAY BAN REF 0RB3025L L2823 58")).toMatchObject({ cor: "L2823", tamanho: "58" });
  });

  it("cores diferentes do mesmo modelo têm a mesma chave (variações)", () => {
    expect(modelKey("ARM MIUMIU REF 0MU 01XV 19P1O150", "MIUMIU")).toBe(modelKey("ARM MIUMIU REF 0MU 01XV 1AB1O150", "MIUMIU"));
    expect(modelKey("ARM MIUMIU REF 0MU 01XV 19P1O150", "MIUMIU")).not.toBe(modelKey("ARM MIUMIU REF 0MU 02XV 19P1O150", "MIUMIU"));
  });

  it("prompt proíbe código bruto, frase repetida e oferecer o nome da loja já dito", () => {
    expect(prompt).toContain(NATURAL_RULES);
    expect(NATURAL_RULES).toContain("Nunca despeje o nome bruto do sistema");
    expect(NATURAL_RULES).toContain("NÃO ofereça \"te passar o nome da loja certinho\"");
    expect(NATURAL_RULES).toContain("enviar a localização no mapa, ver outras cores/variações");
  });
});

describe("buscarDetalhesProdutoWeb: ficha real + cores com saldo", () => {
  it("cache de 30 dias: segunda consulta não pesquisa na web", async () => {
    const rows = new Map<string, DetailsCacheRow>();
    const search = vi.fn(async () => "- **Material:** acetato ([selfridges.com](https://x.com))\n- **Formato:** oval");
    const service = createProductDetailsService({ cache: { get: async (key) => rows.get(key) ?? null, set: async (row) => { rows.set(row.key, { ...row, updatedAt: new Date() }); } }, search });
    const first = await service("MIU MIU|0MU 01XV", "prompt");
    const second = await service("MIU MIU|0MU 01XV", "prompt");
    expect(first).toMatchObject({ text: "- Material: acetato\n- Formato: oval", source: "web" });
    expect(second.source).toBe("cache");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("pesquisa pela Responses API com web_search; falha vira null sem lançar erro", async () => {
    const fetch = vi.fn(async (_url: string, init: { body: string }) => {
      expect(JSON.parse(init.body).tools).toEqual([{ type: "web_search" }]);
      return { ok: true, status: 200, json: async () => ({ output_text: "Armação oval em acetato.", usage: { input_tokens: 10, output_tokens: 5 } }) };
    });
    expect(await webSearchDetails("p", { apiKey: "k", model: "m", fetch })).toBe("Armação oval em acetato.");
    expect(await webSearchDetails("p", { apiKey: "k", model: "m", fetch: async () => { throw new Error("timeout"); } })).toBeNull();
    expect(cleanDetails("Não encontrei informações sobre esse modelo.")).toBeNull();
  });

  it('"quero saber mais detalhes": resultado traz características e cores com saldo, com orientação de resposta útil', () => {
    const result = buildDetailsResult({
      nomeProduto: "Armação Miu Miu (ref. 0MU 01XV)",
      referencia: "0MU 01XV",
      found: true,
      details: { text: "- Material: acetato\n- Formato: oval, aro fechado\n- Público: feminino", sheet: null, source: "web" },
      variations: [
        { nomeProduto: "Armação Miu Miu (ref. 0MU 01XV)", cor: "1AB1O1", totalDisponivel: 2, lojas: ["Loja Setor Bueno"] },
        { nomeProduto: "Armação Miu Miu (ref. 0MU 01XV)", cor: "19P1O1", totalDisponivel: 1, lojas: ["Loja Marista"] },
        { nomeProduto: "Armação Miu Miu (ref. 0MU 01XV)", cor: "VYJ1O1", totalDisponivel: 0, lojas: [] },
      ],
      stock: "ok",
    });
    expect(result.caracteristicas).toContain("acetato");
    expect(result.variacoesEmEstoque.map((item) => item.cor)).toEqual(["1AB1O1", "19P1O1"]);
    expect(result.orientacao).toContain("entregue a descricaoDetalhada");
    expect(result.orientacao).toContain("cores/variações com saldo");
    expect(DETAILS_TOOL.function.name).toBe("buscarDetalhesProdutoWeb");
    expect(prompt).toContain(DETAILS_RULES);
    expect(DETAILS_RULES).toContain("Proibido responder pedido de detalhes com frase vazia (\"Posso te ajudar com disponibilidade e lojas\")");
  });

  it("sem ficha na web: orienta a não inventar material nem funções", () => {
    const result = buildDetailsResult({ nomeProduto: "X", referencia: null, found: false, details: { text: null, sheet: null, source: "none" }, variations: [], stock: "sem_codigo" });
    expect(result.orientacao).toContain("nunca invente material ou funções");
  });
});

describe("enviarLocalizacaoLoja: pin nativo ou link do Google Maps", () => {
  const bueno: StoreInfo = { name: "LJ 17 OTICAS BRASIL", address: "AVENIDA T-8", addressNumber: "235", neighborhood: "SETOR BUENO", city: "GOIANIA", lat: -16.7037, lng: -49.2687 };
  const marista: StoreInfo = { name: "LJ 34 UNILENTES", address: "RUA 27", addressNumber: "2106", neighborhood: "SETOR MARISTA", city: "GOIANIA", lat: null, lng: null };

  it("loja com latitude/longitude: payload type \"location\" da Cloud API", async () => {
    const location = storeLocation("17", bueno);
    expect(location).toMatchObject({ nome: "Óticas Brasil - Loja Setor Bueno", endereco: "Av. T-8, 235", pinNativo: true, latitude: -16.7037, longitude: -49.2687 });
    expect(locationPayload("5562999999999", location)).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "5562999999999", type: "location",
      location: { latitude: -16.7037, longitude: -49.2687, name: "Óticas Brasil - Loja Setor Bueno", address: "Av. T-8, 235" },
    });
    const calls: string[] = [];
    expect(await deliverLocation(location, { sendPin: async () => { calls.push("location"); }, sendText: async (text) => { calls.push(text); } })).toBe("pin");
    expect(calls).toEqual(["location"]);
  });

  it("sem coordenadas: link direto do Google Maps com o endereço (nunca só texto seco)", async () => {
    const location = storeLocation("34", marista);
    expect(location.pinNativo).toBe(false);
    expect(location.mapsUrl).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Óticas Brasil RUA 27, 2106 - SETOR MARISTA - GOIANIA")}`);
    const sent: string[] = [];
    expect(await deliverLocation(location, { sendPin: async () => { sent.push("location"); }, sendText: async (text) => { sent.push(text); } })).toBe("link");
    expect(sent).toEqual([locationText(location)]);
    expect(sent[0]).toContain("https://www.google.com/maps/search/?api=1&query=");
  });

  it("pin recusado pela Meta: cai no link do Maps", async () => {
    const sent: string[] = [];
    await deliverLocation(storeLocation("17", bueno), { sendPin: async () => { throw new Error("Meta 400"); }, sendText: async (text) => { sent.push(text); } });
    expect(sent[0]).toContain("maps/search/?api=1&query=-16.7037%2C-49.2687");
    expect(googleMapsUrl(bueno)).toContain("query=-16.7037%2C-49.2687");
  });

  it("acha a loja pelo bairro citado; ferramenta e regra no prompt", () => {
    const stores = new Map<string, StoreInfo>([["17", bueno], ["34", marista]]);
    expect(findStores(stores, "Setor Bueno").map((item) => item.code)).toEqual(["17"]);
    expect(findStores(stores, "loja 34").map((item) => item.code)).toEqual(["34"]);
    expect(LOCATION_TOOL.function.name).toBe("enviarLocalizacaoLoja");
    expect(prompt).toContain(LOCATION_RULES);
  });
});

describe("encerramento silencioso", () => {
  const farewell = "Por nada! Qualquer coisa que precisar, é só chamar por aqui 😊";

  it("após a despedida da IA, \"valeu\"/\"obrigado\"/👍 → no_reply e 0 mensagens na Cloud API", async () => {
    for (const text of ["valeu", "obrigado!", "👍", "ok, até mais", "tá bom, obrigada"]) {
      const outcome = preAgentOutcome(DEFAULT_AI_SETTINGS, { pendingText: text, hasMedia: false, aiReplies: 3, lastAiText: farewell });
      expect(outcome).toMatchObject({ action: "no_reply", trigger: "closing", reply: "" });
      const meta = vi.fn(async () => ({ messages: [{ id: "wamid" }] }));
      const sent = await sendBubbles(customerMessages(outcome!, { handoffMessage: "Vou te passar para a equipe" }, {}), { sendFirst: meta, sendNext: meta });
      expect(sent).toBe(0);
      expect(meta).not.toHaveBeenCalled();
    }
  });

  it("primeiro agradecimento (IA ainda não se despediu) é respondido uma vez; pergunta nova nunca é silenciada", () => {
    expect(preAgentOutcome(DEFAULT_AI_SETTINGS, { pendingText: "ok, vc já me ajudou. Muito obrigado...", hasMedia: false, aiReplies: 3, lastAiText: "Te mandei a localização da Loja Setor Bueno aqui embaixo 👇" })).toBeNull();
    expect(preAgentOutcome(DEFAULT_AI_SETTINGS, { pendingText: "obrigado, e vocês abrem sábado?", hasMedia: false, aiReplies: 3, lastAiText: farewell })).toBeNull();
    expect(isCourtesyClosing("ok, vc já me ajudou. Muito obrigado...")).toBe(true);
    expect(isCourtesyClosing("quero ver outra cor")).toBe(false);
    expect(isFarewell("Quer que eu reserve? Até mais!")).toBe(true);
    expect(isFarewell("Por nada! Quer ver outra cor?")).toBe(false);
    expect(silentClosing({ pendingText: "valeu", lastAiText: "Qual loja fica melhor pra você?" })).toBe(false);
  });

  it("o modelo também pode pedir silêncio (action no_reply ou [NO_REPLY]); a regra está no prompt", () => {
    expect(interpretDecision({ action: "no_reply", reply: "" })).toMatchObject({ action: "no_reply", reply: "" });
    expect(interpretDecision({ action: "reply", reply: NO_REPLY_TOKEN })).toMatchObject({ action: "no_reply", reply: "" });
    expect(prompt).toContain(CLOSING_RULES);
    expect(CLOSING_RULES).toContain("responda UMA única vez, curto e caloroso, sem fazer nova pergunta");
    expect(prompt).toContain("\"action\": \"reply\" | \"handoff\" | \"resolved\" | \"no_reply\"");
  });
});
