import { describe, expect, it } from "vitest";
import { isCustomerMessage, readContent, type MetaInboundMessage } from "@/lib/chat/inbound-content";

const message = (fields: MetaInboundMessage): MetaInboundMessage => ({ id: "wamid.1", from: "5562999887766", timestamp: "1762800000", ...fields });

describe("leitura do payload do webhook da Meta", () => {
  it("texto", () => {
    expect(readContent(message({ type: "text", text: { body: "Oi, quero um orçamento" } }))).toEqual({ text: "Oi, quero um orçamento", media: null });
  });

  it("áudio (ogg/opus de voz) vira mídia sem legenda", () => {
    const content = readContent(message({ type: "audio", audio: { id: "media-1", mime_type: "audio/ogg; codecs=opus" } }));
    expect(content.text).toBe("");
    expect(content.media).toEqual({ id: "media-1", mime_type: "audio/ogg; codecs=opus", kind: "audio" });
  });

  it("imagem com legenda", () => {
    const content = readContent(message({ type: "image", image: { id: "media-2", mime_type: "image/jpeg", caption: "minha receita" } }));
    expect(content.text).toBe("minha receita");
    expect(content.media?.kind).toBe("image");
  });

  it("vídeo e figurinha", () => {
    expect(readContent(message({ type: "video", video: { id: "media-3", mime_type: "video/mp4" } })).media?.kind).toBe("video");
    expect(readContent(message({ type: "sticker", sticker: { id: "media-4", mime_type: "image/webp" } })).media?.kind).toBe("sticker");
  });

  it("mídia sem id não gera download", () => {
    expect(readContent(message({ type: "image", image: { caption: "sem arquivo" } }))).toEqual({ text: "sem arquivo", media: null });
  });

  it("botão e lista interativa usam o título escolhido", () => {
    expect(readContent(message({ type: "button", button: { text: "Quero saber mais" } })).text).toBe("Quero saber mais");
    expect(readContent(message({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "opt-2", title: "Lentes de contato" } } })).text).toBe("Lentes de contato");
  });

  it("localização vira texto com link do mapa", () => {
    const content = readContent(message({ type: "location", location: { latitude: -16.68, longitude: -49.25, name: "Loja Centro" } }));
    expect(content.text).toContain("Loja Centro");
    expect(content.text).toContain("https://maps.google.com/?q=-16.68,-49.25");
  });

  it("tipo desconhecido é registrado sem quebrar", () => {
    expect(readContent(message({ type: "order" })).text).toBe("[Mensagem do tipo order]");
  });
});

describe("filtro de mensagens do cliente", () => {
  it("aceita o que o cliente envia", () => {
    for (const type of ["text", "image", "audio", "video", "document", "sticker", "interactive", "button", "unsupported"]) expect(isCustomerMessage(type)).toBe(true);
  });

  it("ignora avisos de protocolo da Meta", () => {
    for (const type of ["system", "reaction", "ephemeral", "request_welcome", undefined]) expect(isCustomerMessage(type)).toBe(false);
  });
});
