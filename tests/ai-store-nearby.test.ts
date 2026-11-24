import { describe, expect, it } from "vitest";
import type { StoreInfo } from "@/lib/ai/stock";
import { asksNearestStore, findNearbyStores, haversineKm, nearbyStorePrompt, placeFromText } from "@/lib/ai/store-nearby";

const store = (name: string, address: string, number: string, neighborhood: string, city = "GOIANIA", pin?: [number, number]): StoreInfo =>
  ({ name, address, addressNumber: number, neighborhood, city, state: "GO", lat: pin?.[0] ?? null, lng: pin?.[1] ?? null });

/** Recorte do cadastro real (a maioria sem pin; LJ 17 e LJ 39 com pin). */
const directory = new Map<string, StoreInfo>([
  ["13", store("LJ 13 UNILENTES IND COM DE LENTES LTDA", "AVENIDA RIO VERDE", "S/N", "JARDIM NOVA ERA", "APARECIDA DE GOIANIA")],
  ["14", store("LJ 14 UNILENTES IND COM DE LENTES LTDA", "AVENIDA T 2", "374", "SETOR BUENO")],
  ["17", store("LJ 17 UNILENTES PROCESSO APOIO E INFORMACAO LTDA", "Rua IRACEMA", "S/N", "SETOR SERRA DOURADA", "APARECIDA DE GOIANIA", [-16.8234, -49.2618])],
  ["21", store("LJ 21 UNILENTES IND COM DE LENTES LTDA", "RUA 135", "208", "SETOR MARISTA")],
  ["23", store("LJ 23 UNILENTES IND COM DE LENTES LTDA", "RUA SAO BENTO", "16", "SETOR CENTRAL", "APARECIDA DE GOIANIA")],
  ["35", store("LJ 35 BETULIA MOTTA GOMES DE OLIVEIRA LTDA", "RUA 90", "118", "SETOR SUL")],
  ["36", store("LJ 36 THAIS MOTTA GOMES DE OLIVEIRA - EIRELI", "AVENIDA PADRE ORLANDO DE MORAIS", "2017", "PARQUE AMAZONIA")],
  ["37", store("LJ 37 UNILENTES PROCESSO APOIO E INFORMACAO LTDA", "RUA 95", "95", "SETOR SUL")],
  ["39", store("LJ 39-ZVC FLAMBOYANT SAULO DE TARSO FERREIRA MOTTA LTDA", "AVENIDA DEPUTADO JAMEL CECILIO", "3300", "JARDIM GOIAS", "GOIANIA", [-16.706, -49.2384])],
]);

describe("loja mais próxima", () => {
  it("Haversine: distância real em km", () => {
    expect(haversineKm({ lat: -16.6799, lng: -49.255 }, { lat: -16.6799, lng: -49.255 })).toBe(0);
    expect(haversineKm({ lat: -16.6869, lng: -49.2648 }, { lat: -16.8234, lng: -49.2618 })).toBeCloseTo(15.2, 0);
  });

  it("'loja perto de mim' sem localização: pede bairro ou localização e não cita loja", () => {
    expect(asksNearestStore("Preciso de uma loja perto de mim")).toBe(true);
    const prompt = nearbyStorePrompt({ customerText: "Preciso de uma loja perto de mim", earlierCustomerTexts: ["Oi, boa tarde"], directory });
    expect(prompt).toMatch(/NÃO afirme qual é a loja mais próxima/);
    expect(prompt).toMatch(/bairro\/setor .* localização pelo WhatsApp/);
    expect(prompt).not.toMatch(/Marista|Setor Sul|Loja \d+/i);
  });

  it("cadastro antigo: pode perguntar se ainda está na região, sem cravar loja", () => {
    const prompt = nearbyStorePrompt({ customerText: "qual a unidade mais próxima?", earlierCustomerTexts: [], knownPlace: "Goiânia", directory });
    expect(prompt).toMatch(/No cadastro consta Goiânia: você pode perguntar se ele ainda está por essa região/);
  });

  it("'região do Garavelo' (sem loja no bairro): loja da região do Garavelo/Aparecida, nunca Setor Sul", () => {
    expect(placeFromText("Quero na região do Garavelo")?.city).toBe("APARECIDA DE GOIANIA");
    const result = findNearbyStores({ texts: ["Quero na região do Garavelo"] }, directory);
    expect(result.kind).toBe("regiao");
    if (result.kind === "sem_local") throw new Error("esperava lojas");
    expect(result.stores[0].code).toBe("13");
    expect(result.stores.map((item) => item.code)).not.toContain("35");
    expect(result.stores.map((item) => item.code)).not.toContain("37");

    // Conversa em dois turnos: pediu loja perto, a IA perguntou, cliente responde a região.
    const prompt = nearbyStorePrompt({ customerText: "Quero na região do Garavelo", earlierCustomerTexts: ["Preciso de uma loja perto de mim"], directory });
    expect(prompt).toMatch(/Loja 13/);
    expect(prompt).not.toMatch(/SETOR SUL/);
  });

  it("bairro com loja: devolve a loja do próprio bairro", () => {
    const result = findNearbyStores({ texts: ["moro no Setor Bueno"] }, directory);
    expect(result).toMatchObject({ kind: "bairro", stores: [expect.objectContaining({ code: "14" })] });
  });

  it("pin do WhatsApp: loja com menor distância em km", () => {
    // Cliente no Jardim Goiás, perto do Flamboyant.
    const pin = "Minha localização\nhttps://maps.google.com/?q=-16.7085,-49.2370";
    const result = findNearbyStores({ texts: [pin] }, directory);
    expect(result.kind).toBe("pin");
    if (result.kind === "sem_local") throw new Error("esperava lojas");
    expect(result.stores[0].code).toBe("39");
    expect(result.stores[0].km).toBeLessThan(1);
    const prompt = nearbyStorePrompt({ customerText: pin, earlierCustomerTexts: [], directory });
    expect(prompt).toMatch(/pela localização enviada/);
    expect(prompt).toMatch(/cerca de 0,3 km/);

    // Cliente no centro de Aparecida: Aparecida, não Goiânia.
    const aparecida = findNearbyStores({ texts: ["https://maps.google.com/?q=-16.8225,-49.2450"] }, directory);
    if (aparecida.kind === "sem_local") throw new Error("esperava lojas");
    expect(aparecida.stores[0].code).toBe("23");
  });

  it("fora do assunto de loja não injeta nada", () => {
    expect(nearbyStorePrompt({ customerText: "quero ver óculos de sol Ray-Ban", earlierCustomerTexts: [], directory })).toBe("");
  });
});
