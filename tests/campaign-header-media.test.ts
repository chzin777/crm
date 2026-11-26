import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  open: null as { id: string } | null,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatConversation: {
      findUnique: vi.fn(async () => db.open),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "conv-disparo" })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    chatMessage: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.created.push(data); return { id: "m1" }; }) },
  },
}));
vi.mock("@/lib/minio", () => ({ ensureBucket: vi.fn(async () => {}), putFile: vi.fn(async () => {}) }));

import { templateSendComponents } from "@/lib/meta-whatsapp";
import { recordDispatchInChat, renderTemplateText } from "@/lib/chat/dispatch-history";
import { dispatchAttachmentFor, headerMediaKind, storeDispatchMedia } from "@/lib/chat/dispatch-media";
import { campaignHeaderSource } from "@/lib/chat/dispatch-media-backfill";
import { Attachment } from "@/components/chat/MessageList";
import type { ChatMessageItem } from "@/lib/chat/types";

describe("payload da Cloud API com imagem no cabeçalho", () => {
  it("inclui o header de imagem pelo id da mídia, corpo e botões", () => {
    const components = templateSendComponents({
      params: ["Maria", "20%"],
      header: { kind: "image", id: "media-123", fileName: "header" },
      quickReplyPayloads: [{ index: 0, payload: "Quero aproveitar" }],
    });
    expect(components).toEqual([
      { type: "header", parameters: [{ type: "image", image: { id: "media-123" } }] },
      { type: "body", parameters: [{ type: "text", text: "Maria" }, { type: "text", text: "20%" }] },
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "Quero aproveitar" }] },
    ]);
  });

  it("aceita link HTTPS público e documento com nome do arquivo", () => {
    expect(templateSendComponents({ header: { kind: "image", link: "https://cdn.exemplo.com/promo.jpg" } })[0])
      .toEqual({ type: "header", parameters: [{ type: "image", image: { link: "https://cdn.exemplo.com/promo.jpg" } }] });
    expect(templateSendComponents({ header: { kind: "document", id: "doc-1", fileName: "catalogo.pdf" } })[0])
      .toEqual({ type: "header", parameters: [{ type: "document", document: { id: "doc-1", filename: "catalogo.pdf" } }] });
  });

  it("recusa cabeçalho de mídia sem id nem link (a Meta rejeitaria o envio)", () => {
    expect(() => templateSendComponents({ header: { kind: "image" } })).toThrow(/sem id nem link/);
  });
});

describe("mídia do modelo gravada na mensagem do chat", () => {
  beforeEach(() => { db.created = []; db.open = null; });

  it("mesma imagem gera a mesma chave (um arquivo para o lote inteiro)", async () => {
    const bytes = Buffer.from("imagem-da-campanha");
    const first = dispatchAttachmentFor(bytes, "image/jpeg");
    expect(first).toMatchObject({ kind: "image", mime: "image/jpeg", size: bytes.length, name: "modelo.jpg" });
    expect(first.key).toMatch(/^chat\/disparo\/[0-9a-f]{32}\.jpg$/);
    expect(dispatchAttachmentFor(Buffer.from("imagem-da-campanha"), "image/jpeg; charset=binary").key).toBe(first.key);
    expect(headerMediaKind("video/mp4")).toBe("video");
    expect(headerMediaKind("application/pdf")).toBe("document");
    expect(await storeDispatchMedia(bytes, "image/png", "promo.png")).toMatchObject({ kind: "image", name: "promo.png", key: expect.stringMatching(/\.png$/) });
  });

  it("recordDispatchInChat salva anexo e dados do modelo junto do texto", async () => {
    const attachment = dispatchAttachmentFor(Buffer.from("x"), "image/jpeg");
    const text = renderTemplateText({ body: "Olá, {{1}}! Black Friday com {{2}} de desconto." }, "black_friday", ["Maria", "30%"]);
    const conversationId = await recordDispatchInChat({
      contactId: "c1", phone: "5562999990000", text, externalId: "wamid.1", authorName: "Campanha · Black Friday",
      campaignId: "camp1", campaignName: "Black Friday", attachment, template: { name: "black_friday", language: "pt_BR" },
    });
    expect(conversationId).toBe("conv-disparo");
    expect(db.created[0]).toMatchObject({
      text: "Olá, Maria! Black Friday com 30% de desconto.",
      externalId: "wamid.1",
      attachment,
      metaMedia: { template: { name: "black_friday", language: "pt_BR", headerKind: "image" } },
    });
  });

  it("sem mídia, a mensagem continua só com o texto", async () => {
    await recordDispatchInChat({ contactId: "c1", phone: "5562999990000", text: "Oi", externalId: null, authorName: "Campanha · X" });
    expect(db.created[0].attachment).toBeUndefined();
    expect(db.created[0].metaMedia).toBeUndefined();
  });

  it("backfill acha a imagem pelo anexo da campanha ou pelo modelo da Meta", () => {
    const templates = [{ name: "bf", language: "pt_BR", headerFormat: "IMAGE", headerImageUrl: "https://scontent.whatsapp.net/bf.jpg" }];
    expect(campaignHeaderSource({ modelo: { name: "bf", language: "pt_BR", hasImage: true }, anexos: [{ name: "promo.png", type: "image/png", url: "https://arquivos/promo.png" }] }, templates))
      .toEqual({ url: "https://arquivos/promo.png", name: "promo.png" });
    expect(campaignHeaderSource({ modelo: { name: "bf", language: "pt_BR", hasImage: true } }, templates)).toEqual({ url: "https://scontent.whatsapp.net/bf.jpg" });
    expect(campaignHeaderSource({ modelo: { name: "bf", language: "pt_BR", hasImage: false } }, templates)).toBeNull();
  });
});

describe("balão do /chat com imagem do modelo", () => {
  it("mostra a imagem clicável (amplia) servida pela rota de mídia do chat", () => {
    const message = {
      id: "msg-1", author: "agent", authorName: "Campanha · Black Friday", text: "Olá, Maria! Black Friday com 30% de desconto.",
      createdAt: new Date().toISOString(), delivery: "delivered",
      attachment: { kind: "image", name: "modelo.jpg", mime: "image/jpeg", size: 1000 },
    } as unknown as ChatMessageItem;
    const html = renderToStaticMarkup(createElement(Attachment, { message, onOpen: () => {} }));
    expect(html).toContain('src="/api/chat/media/msg-1"');
    expect(html).toContain('aria-label="Ampliar modelo.jpg"');
    expect(html).toContain("cursor-zoom-in");
  });
});
