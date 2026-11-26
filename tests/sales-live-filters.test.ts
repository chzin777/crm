import { describe, expect, it } from "vitest";
import { filterStores, matchOrder, matchStore, ordersInStores, searchOrders, storeSelectionLabel, topStores, type StoreOption } from "@/lib/sales-live/filters";
import { storeFriendlyLabel, titlePlace } from "@/lib/stores";
import type { LiveOrder } from "@/lib/sales-live/feed";

const registry = [
  { number: 22, name: "LJ 34-ZVC MARISTA UNILENTES IND COM DE LENTES LTDA", neighborhoods: ["SETOR MARISTA"], city: "GOIANIA" },
  { number: 32, name: "LJ 18 UNILENTES IND COM DE LENTES LTDA", neighborhoods: ["SETOR BUENO"], city: "GOIANIA" },
  { number: 1, name: "LJ 29 THAIS MOTTA GOMES DE OLIVEIRA - EIRELI", neighborhoods: ["JARDIM TODOS OS SANTOS"], city: "SENADOR CANEDO" },
  { number: 4, name: "LJ 23 UNILENTES IND COM DE LENTES LTDA", neighborhoods: ["SETOR CENTRAL"], city: "APARECIDA DE GOIANIA" },
  { number: 5, name: "LJ 17 UNILENTES PROCESSO APOIO E INFORMACAO LTDA", neighborhoods: ["SETOR SERRA DOURADA"], city: "APARECIDA DE GOIANIA" },
  { number: 18, name: "LJ 38-ZVC GYN SHOPPING JOAO VICTOR SANTOS MOTTA LTDA", neighborhoods: ["SETOR BUENO"], city: "GOIANIA" },
];

describe("nome real das lojas", () => {
  it("monta o rótulo com bairro (Goiânia) ou cidade", () => {
    expect(storeFriendlyLabel(registry, "018")).toBe("Loja 18 · Setor Bueno");
    expect(storeFriendlyLabel(registry, "34")).toBe("Loja 34 · Setor Marista");
    expect(storeFriendlyLabel(registry, "29")).toBe("Loja 29 · Senador Canedo");
    expect(storeFriendlyLabel(registry, "23")).toBe("Loja 23 · Setor Central, Aparecida de Goiânia");
    expect(storeFriendlyLabel(registry, "303")).toBe("Loja 303");
    expect(titlePlace("JARDIM TODOS OS SANTOS")).toBe("Jardim Todos os Santos");
  });
});

const options: StoreOption[] = [
  { store: "18", storeLabel: "Loja 18 · Setor Bueno", search: "LJ 18 UNILENTES AVENIDA T 8", amount: 12000, orders: 9 },
  { store: "34", storeLabel: "Loja 34 · Setor Marista", search: "LJ 34-ZVC MARISTA UNILENTES RUA 27", amount: 8000, orders: 6 },
  { store: "38", storeLabel: "Loja 38 · Setor Bueno", search: "LJ 38-ZVC GYN SHOPPING", amount: 20000, orders: 12 },
  { store: "180", storeLabel: "Loja 180 · Garavelo", search: "", amount: 500, orders: 1 },
  { store: "29", storeLabel: "Loja 29 · Senador Canedo", search: "", amount: 0, orders: 0 },
];

describe("seletor de lojas", () => {
  it("busca pelo número da loja (código e começo) e pelo nome real", () => {
    expect(filterStores(options, "18", "number").map((item) => item.store)).toEqual(["18", "180"]);
    expect(filterStores(options, "loja 34").map((item) => item.store)).toEqual(["34"]);
    expect(filterStores(options, "Marista").map((item) => item.store)).toEqual(["34"]);
    expect(filterStores(options, "bueno").map((item) => item.store)).toEqual(["38", "18"]);
    expect(filterStores(options, "gyn shopping").map((item) => item.store)).toEqual(["38"]);
    expect(matchStore(options[4], "senador canedo")).toBe(true);
    expect(filterStores(options, "xyz")).toEqual([]);
  });

  it("ordena por faturamento ou número e acha o top 5 com vendas", () => {
    expect(filterStores(options, "").map((item) => item.store)).toEqual(["38", "18", "34", "180", "29"]);
    expect(filterStores(options, "", "number").map((item) => item.store)).toEqual(["18", "29", "34", "38", "180"]);
    expect(topStores(options, 5)).toEqual(["38", "18", "34", "180"]);
  });

  it("seleção múltipla filtra os pedidos e mostra o estado no botão", () => {
    const orders = [order({ key: "18-1", store: "18" }), order({ key: "34-2", store: "34" }), order({ key: "38-3", store: "38" })];
    expect(ordersInStores(orders, []).length).toBe(3);
    expect(ordersInStores(orders, ["18", "34"]).map((item) => item.key)).toEqual(["18-1", "34-2"]);
    expect(storeSelectionLabel(options, [])).toBe("Todas as lojas (5)");
    expect(storeSelectionLabel(options, ["34"])).toBe("Loja 34 · Setor Marista");
    expect(storeSelectionLabel(options, ["18", "34", "38"])).toBe("3 lojas selecionadas");
  });
});

function order(over: Partial<LiveOrder>): LiveOrder {
  return {
    key: "18-51547", store: "18", storeLabel: "Loja 18 · Setor Bueno", order: "51547", at: "2026-11-26T15:00:00Z", time: "12:00", amount: 1500, items: 2,
    summary: "Ray-Ban, Zeiss", seller: "Geraldina Lemes", payment: "Visa parcelado", fromCrm: false, version: "1", customer: "Maria Souza",
    lines: [{ label: "Ray-Ban", description: "ARM RAY-BAN REF RB4165", kind: "grau", quantity: 1, amount: 700 }, { label: "Stepper", description: "OCS STEPPER SI-1234", kind: "sol", quantity: 1, amount: 800 }],
    ...over,
  };
}

describe("busca global do feed", () => {
  const feed = [
    order({}),
    order({ key: "34-900", store: "34", order: "900", seller: "João Pedro", customer: "Ana Lima", summary: "Varilux", lines: [{ label: "Essilor", description: "VARILUX COMFORT", kind: "grau", quantity: 1, amount: 900 }] }),
  ];

  it("filtra por vendedor (sem acento e em qualquer ordem de palavras)", () => {
    expect(searchOrders(feed, "geraldina").map((item) => item.key)).toEqual(["18-51547"]);
    expect(searchOrders(feed, "joao").map((item) => item.key)).toEqual(["34-900"]);
    expect(searchOrders(feed, "pedro joão").map((item) => item.key)).toEqual(["34-900"]);
  });

  it("filtra por produto/marca, inclusive itens fora do resumo", () => {
    expect(searchOrders(feed, "ray-ban").map((item) => item.key)).toEqual(["18-51547"]);
    expect(searchOrders(feed, "stepper").map((item) => item.key)).toEqual(["18-51547"]);
    expect(searchOrders(feed, "varilux").map((item) => item.key)).toEqual(["34-900"]);
  });

  it("filtra por número do pedido e por cliente", () => {
    expect(searchOrders(feed, "5154").map((item) => item.key)).toEqual(["18-51547"]);
    expect(searchOrders(feed, "900").map((item) => item.key)).toEqual(["34-900"]);
    expect(matchOrder(feed[1], "ana lima")).toBe(true);
    expect(searchOrders(feed, "  ").length).toBe(2);
    expect(searchOrders(feed, "inexistente")).toEqual([]);
  });
});
