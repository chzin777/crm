import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { type StoreInfo } from "@/lib/ai/stock";
import { addressKey, findStores, LOCATION_RULES, resolveStoreMatch, sameStorePlace } from "@/lib/ai/store-location";

// Cadastro real: duas lojas distintas no Setor Sul (Rua 95 e Rua 90) e outra fora.
const rua95: StoreInfo = { name: "LJ 37 UNILENTES PROCESSO", address: "RUA 95", addressNumber: "95", neighborhood: "SETOR SUL", city: "GOIANIA", lat: -16.697876, lng: -49.277922 };
const rua90: StoreInfo = { name: "LJ 35 BETULIA MOTTA", address: "RUA 90", addressNumber: "118", neighborhood: "SETOR SUL", city: "GOIANIA", lat: -16.6998893, lng: -49.2625052 };
const bueno: StoreInfo = { name: "LJ 12 BUENO", address: "AV T-8", addressNumber: "235", neighborhood: "SETOR BUENO", city: "GOIANIA" };

describe("resolução de lojas para localização", () => {
  it("duas filiais \"Setor Sul\" no mesmo endereço: viram 1 unidade e a localização sai direto", () => {
    const twin: StoreInfo = { ...rua95, name: "LJ 38 OUTRA FILIAL", address: "Rua 95", addressNumber: "nº 95", lat: null, lng: null };
    expect(addressKey(rua95)).toBe(addressKey(twin));
    expect(sameStorePlace(rua95, twin)).toBe(true);
    // Coordenadas a menos de 50 m também são a mesma unidade.
    expect(sameStorePlace(rua95, { ...rua95, address: "Avenida Outra", lat: -16.6979, lng: -49.27795 })).toBe(true);
    const stores = new Map([["37", rua95], ["38", twin], ["12", bueno]]);
    const resolved = resolveStoreMatch(findStores(stores, "setor sul"), { wanted: "setor sul" });
    expect(resolved).toMatchObject({ type: "found", match: { code: "37" } });
  });

  it("duas unidades reais no mesmo setor: desambiguação com o endereço distinto de cada uma", () => {
    const stores = new Map([["37", rua95], ["35", rua90], ["12", bueno]]);
    const resolved = resolveStoreMatch(findStores(stores, "loja do setor sul"), { wanted: "loja do setor sul" });
    expect(resolved.type).toBe("ambiguous");
    const options = resolved.type === "ambiguous" ? resolved.options : [];
    expect(options).toEqual(["Loja Setor Sul — Rua 95", "Loja Setor Sul — Rua 90, 118"]);
    expect(new Set(options).size).toBe(options.length);
    // Sem endereço no cadastro: nunca dois rótulos iguais.
    const bare = new Map([["37", { ...rua95, address: null, addressNumber: null, lat: null, lng: null }], ["35", { ...rua90, address: null, addressNumber: null, lat: null, lng: null, city: "GOIANIA" }]]);
    const noAddress = resolveStoreMatch(findStores(bare, "setor sul"), { wanted: "setor sul" });
    expect(noAddress.type === "ambiguous" && new Set(noAddress.options).size).toBe(2);
  });

  it("\"me manda a localização dessa loja do setor sul\" logo após a ficha citar a Rua 95: envia direto", () => {
    const stores = new Map([["37", rua95], ["35", rua90]]);
    const card = "Temos sim! 😊\n\n🕶️ *Ray-Ban Justin | Ref. RB4165L*\n📦 *Estoque:* 1 unidade disponível na seguinte loja:\n📍 *Loja Setor Sul* – Goiânia (Rua 95, 95)";
    const resolved = resolveStoreMatch(findStores(stores, "setor sul"), { wanted: "setor sul", recentAiTexts: ["setor sul", "Gostaria de reservar nessa loja?", card] });
    expect(resolved).toMatchObject({ type: "found", match: { code: "37" } });
    // A rua citada pela IA no próprio pedido da tool também resolve.
    expect(resolveStoreMatch(findStores(stores, "setor sul"), { wanted: "Setor Sul Rua 90", recentAiTexts: ["Setor Sul Rua 90"] })).toMatchObject({ type: "found", match: { code: "35" } });
    // "Rua 9" não confunde com "Rua 95".
    expect(resolveStoreMatch(findStores(stores, "setor sul"), { wanted: "setor sul", recentAiTexts: ["fica na Rua 9"] }).type).toBe("ambiguous");
  });

  it("prompt proíbe opções sem endereço e manda enviar direto em \"essa loja\"", () => {
    expect(buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS, info: "" })).toContain(LOCATION_RULES);
    expect(LOCATION_RULES).toContain("NUNCA pergunte \"Qual dessas unidades você quer?\" listando nomes iguais sem endereço");
    expect(LOCATION_RULES).toContain("envie direto, sem pedir confirmação");
    expect(LOCATION_RULES).toContain("com o endereço completo");
  });
});
