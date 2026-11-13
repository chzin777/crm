import { describe, expect, it } from "vitest";
import { matchesStorePlace, geocodeStoreAddress, isGenericCoordinate, isPreciseGoogle, isPreciseNominatim, normalizeBrAddress, parseMapsCoordinates, pinMapsUrl } from "@/lib/ai/store-geolocation";
import { googleMapsUrl, locationPayload, storeLocation } from "@/lib/ai/store-location";

const fetchReturning = (body: unknown) => async () => ({ ok: true, json: async () => body });

describe("pin exato da loja", () => {
  it("rejeita centro de cidade/bairro: não vira pin de loja em Aparecida de Goiânia", async () => {
    // Centroide que o Nominatim devolve para Goiânia (cai no Setor Bueno/Sul).
    expect(isGenericCoordinate({ lat: -16.6998893, lng: -49.2625052 })).toBe(true);
    expect(isGenericCoordinate({ lat: -16.69989, lng: -49.26251 })).toBe(true);
    // Mesmo ponto de outra loja com endereço diferente = genérico; mesma loja/endereço = ok.
    expect(isGenericCoordinate({ lat: -16.8, lng: -49.2 }, [{ coords: { lat: -16.8, lng: -49.2 }, addressKey: "RUA1" }], "RUA2")).toBe(true);
    expect(isGenericCoordinate({ lat: -16.8, lng: -49.2 }, [{ coords: { lat: -16.8, lng: -49.2 }, addressKey: "RUA1" }], "RUA1")).toBe(false);
    // Resultado de área administrativa / cidade / bairro é descartado.
    expect(isPreciseNominatim({ lat: "-16.82", lon: "-49.24", category: "boundary", type: "administrative", addresstype: "city", place_rank: 16 })).toBe(false);
    expect(isPreciseNominatim({ lat: "-16.82", lon: "-49.24", category: "place", type: "suburb", place_rank: 20 })).toBe(false);
    expect(isPreciseNominatim({ lat: "-16.82", lon: "-49.24", category: "highway", type: "primary", addresstype: "road", place_rank: 26 })).toBe(true);
    expect(isPreciseNominatim({ lat: "-16.82", lon: "-49.24", category: "building", type: "yes", addresstype: "building", place_rank: 30 })).toBe(true);
    const store = { address: "AV. INDEPENDENCIA QD. 12 LT. 5 LJ 08", addressNumber: "N° 100", neighborhood: "SETOR SERRA DOURADA", city: "APARECIDA DE GOIANIA", state: "GO" };
    expect(await geocodeStoreAddress(store, { fetch: fetchReturning([{ lat: "-16.6998893", lon: "-49.2625052", category: "boundary", type: "administrative", place_rank: 16 }]) })).toBeNull();
    // Endereço vai limpo e estruturado ao geocoder.
    let url = "";
    const found = await geocodeStoreAddress(store, { fetch: async (target) => { url = url || target; return { ok: true, json: async () => [{ lat: "-16.8234", lon: "-49.2456", category: "highway", type: "secondary", addresstype: "road", place_rank: 26, address: { city: "Aparecida de Goiânia", suburb: "Setor Serra Dourada" } }] }; } });
    expect(found).toEqual({ lat: -16.8234, lng: -49.2456, source: "nominatim" });
    const params = new URL(url).searchParams;
    expect(params.get("street")).toBe("100 Avenida INDEPENDENCIA Quadra 12 Lote 5");
    expect(params.get("city")).toBe("Aparecida de Goiânia");
    expect(params.get("state")).toBe("Goiás");
    expect(params.get("country")).toBe("Brazil");
    // Mesma rua em outra cidade/bairro não vale (Rua Iracema de outra cidade; Rua 95 de outro setor).
    expect(matchesStorePlace({ lat: "0", lon: "0", address: { city: "Goiânia", suburb: "Setor Oeste" } }, { city: "APARECIDA DE GOIANIA", neighborhood: "SETOR SERRA DOURADA" })).toBe(false);
    expect(matchesStorePlace({ lat: "0", lon: "0", address: { city: "Aparecida de Goiânia", suburb: "Setor Serra Dourada" } }, { city: "APARECIDA DE GOIANIA", neighborhood: "SETOR SERRA DOURADA" })).toBe(true);
    expect(matchesStorePlace({ lat: "0", lon: "0", address: { city: "Goiânia", suburb: "Setor Central" } }, { city: "GOIANIA", neighborhood: "SETOR SUL" })).toBe(false);
    expect(normalizeBrAddress("Av. T-63, Qd. 140 Lt. 2, Goiânia Shopping Lj 08")).toBe("Avenida T-63, Quadra 140 Lote 2");
    // Google (com chave): só endereço/estabelecimento, nunca APPROXIMATE.
    expect(isPreciseGoogle({ geometry: { location_type: "APPROXIMATE" }, types: ["locality"] })).toBe(false);
    expect(isPreciseGoogle({ geometry: { location_type: "ROOFTOP" } })).toBe(true);
    expect(await geocodeStoreAddress(store, { googleKey: "k", fetch: async (target) => ({ ok: true, json: async () => (target.includes("googleapis") ? { results: [{ geometry: { location: { lat: -16.82, lng: -49.24 }, location_type: "ROOFTOP" } }] } : []) }) })).toEqual({ lat: -16.82, lng: -49.24, source: "google" });
  });

  it("extrai latitude e longitude do link do Google Maps colado no cadastro", () => {
    expect(parseMapsCoordinates("https://www.google.com/maps/place/%C3%93ticas+Brasil/@-16.8234,-49.2456,17z/data=!3m1!4b1")).toEqual({ lat: -16.8234, lng: -49.2456 });
    // O ponto do lugar (!3d!4d) vale mais que o centro da tela (@).
    expect(parseMapsCoordinates("https://www.google.com/maps/place/Oticas/@-16.82,-49.24,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d-16.8239111!4d-49.2461222!16s")).toEqual({ lat: -16.8239111, lng: -49.2461222 });
    expect(parseMapsCoordinates("https://maps.google.com/?q=-16.8234,-49.2456")).toEqual({ lat: -16.8234, lng: -49.2456 });
    expect(parseMapsCoordinates("-16.8234, -49.2456")).toEqual({ lat: -16.8234, lng: -49.2456 });
    expect(parseMapsCoordinates("https://www.google.com/maps/search/Oticas+Brasil")).toBeNull();
    expect(parseMapsCoordinates("")).toBeNull();
  });

  it("link com pin exato (query=lat,lng) e payload type location da Meta", () => {
    expect(pinMapsUrl({ lat: -16.8234, lng: -49.2456 }, { address: "x" })).toBe("https://www.google.com/maps/search/?api=1&query=-16.8234,-49.2456");
    const noPin = { name: "LJ 50 X", address: "AV INDEPENDENCIA", addressNumber: "100", neighborhood: "SETOR SERRA DOURADA", city: "APARECIDA DE GOIANIA", state: "GO" };
    expect(decodeURIComponent(googleMapsUrl(noPin))).toBe("https://www.google.com/maps/search/?api=1&query=Óticas Brasil AV INDEPENDENCIA, 100 - SETOR SERRA DOURADA APARECIDA DE GOIANIA GO");
    const location = storeLocation("50", { ...noPin, lat: -16.8234, lng: -49.2456 });
    expect(location.pinNativo).toBe(true);
    expect(location.mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=-16.8234,-49.2456");
    expect(locationPayload("5562999999999", location)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5562999999999",
      type: "location",
      location: { latitude: -16.8234, longitude: -49.2456, name: "Óticas Brasil - Loja Setor Serra Dourada (Aparecida de Goiânia)", address: location.endereco },
    });
    expect(storeLocation("50", noPin).pinNativo).toBe(false);
  });
});
