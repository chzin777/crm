import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AudioPlayer } from "@/components/chat/AudioPlayer";
import { Attachment } from "@/components/chat/MessageList";
import type { ChatMessageItem } from "@/lib/chat/types";

const audio = (transcription: ChatMessageItem["transcription"]) => ({
  id: "a1", author: "customer", text: "", createdAt: new Date().toISOString(), delivery: null,
  attachment: { kind: "audio", name: "audio.ogg", mime: "audio/ogg", size: 2000 }, transcription,
}) as unknown as ChatMessageItem;

describe("transcrição de áudio no balão do player", () => {
  it("fica no mesmo balão do player, abaixo de uma divisória e com a largura do player", () => {
    const html = renderToStaticMarkup(createElement(Attachment, { message: audio({ status: "done", text: "Oi, queria saber do meu óculos." }), onOpen: () => {} }));
    expect(html).toContain("w-[min(420px,100%)]");
    expect(html).toContain("border-t");
    expect(html).toContain("Oi, queria saber do meu óculos.");
    // Um único balão: o texto está dentro do container do player.
    const card = html.indexOf("w-[min(420px,100%)]");
    expect(card).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Oi, queria")).toBeGreaterThan(card);
    expect(html).not.toContain("Ver mais");
  });

  it("áudio longo abre recolhido com Ver mais", () => {
    const html = renderToStaticMarkup(createElement(Attachment, { message: audio({ status: "done", text: "palavra ".repeat(60) }), onOpen: () => {} }));
    expect(html).toContain("line-clamp-4");
    expect(html).toContain("Ver mais");
  });

  it("sem transcrição continua a cápsula compacta; enviado pela equipe usa o balão azul-marinho", () => {
    const pill = renderToStaticMarkup(createElement(AudioPlayer, { src: "/x.ogg" }));
    expect(pill).toContain("rounded-full");
    expect(pill).not.toContain("border-t");
    const sent = renderToStaticMarkup(createElement(AudioPlayer, { src: "/x.ogg", tone: "dark", footer: "Texto" }));
    expect(sent).toContain("bg-[#07163B]");
    expect(sent).toContain("Texto");
  });
});
