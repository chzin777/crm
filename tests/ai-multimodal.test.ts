import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { AI_ATTACHMENT_MAX_BYTES, aiAttachmentKind, estimateTokens, transcriptionCostUsd, validateAiAttachment } from "@/lib/ai/attachments";
import { attachSummary, audioFileName, decodeTextFile, extractDocxText, mediaParts } from "@/lib/ai/multimodal";
import { usageCostUsd } from "@/lib/ai/settings";

const bytes = (text: string) => new TextEncoder().encode(text);

function docx(xml: string) {
  const zip = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(zip, "word/document.xml", bytes(xml));
  return new Uint8Array(XLSX.CFB.write(zip, { fileType: "zip", type: "array" }) as ArrayLike<number>);
}

describe("tipos de anexo aceitos pela IA", () => {
  it("reconhece imagem, áudio, PDF, texto e Word pelo MIME ou pela extensão", () => {
    expect(aiAttachmentKind("image/jpeg", "receita.jpg")).toBe("image");
    expect(aiAttachmentKind("audio/ogg; codecs=opus", "voz.ogg")).toBe("audio");
    expect(aiAttachmentKind("audio/webm;codecs=opus", "gravacao.webm")).toBe("audio");
    expect(aiAttachmentKind("application/pdf", "orcamento.pdf")).toBe("pdf");
    expect(aiAttachmentKind("application/vnd.ms-excel", "lista.csv")).toBe("text");
    expect(aiAttachmentKind("", "anotacao.txt")).toBe("text");
    expect(aiAttachmentKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "carta.docx")).toBe("docx");
    expect(aiAttachmentKind("video/mp4", "video.mov")).toBeNull();
  });

  it("barra formato desconhecido, arquivo vazio e acima de 10 MB", () => {
    expect(validateAiAttachment({ name: "a.exe", type: "application/x-msdownload", size: 10 })).toMatchObject({ ok: false });
    expect(validateAiAttachment({ name: "a.png", type: "image/png", size: 0 })).toMatchObject({ ok: false });
    const big = validateAiAttachment({ name: "a.png", type: "image/png", size: AI_ATTACHMENT_MAX_BYTES + 1 });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toContain("10 MB");
    expect(validateAiAttachment({ name: "a.png", type: "image/png", size: 500 })).toEqual({ ok: true, kind: "image" });
  });
});

describe("conteúdo enviado à IA", () => {
  it("imagem vai como image_url base64 com o MIME correto", () => {
    const media = mediaParts("image", { name: "receita.jpg", mime: "image/jpg", data: new Uint8Array([1, 2, 3]) });
    const image = media.parts.find((part) => part.type === "image_url");
    expect(image).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AQID", detail: "high" } });
    expect(media.summary).toContain("receita.jpg");
  });

  it("PDF vai como arquivo nativo", () => {
    const media = mediaParts("pdf", { name: "orcamento.pdf", mime: "application/pdf", data: bytes("%PDF-1.4") });
    const file = media.parts.find((part) => part.type === "file");
    expect(file).toEqual({ type: "file", file: { filename: "orcamento.pdf", file_data: `data:application/pdf;base64,${Buffer.from("%PDF-1.4").toString("base64")}` } });
  });

  it("áudio vira texto com a transcrição e entra no resumo do histórico", () => {
    const media = mediaParts("audio", { name: "voz.ogg", mime: "audio/ogg", data: new Uint8Array(10) }, "  Quero um óculos de grau\nmultifocal ");
    expect(media.transcript).toBe("Quero um óculos de grau\nmultifocal");
    expect(media.parts).toHaveLength(1);
    expect(media.parts[0]).toMatchObject({ type: "text" });
    expect(media.summary).toBe("[Áudio do cliente, transcrição: Quero um óculos de grau multifocal]");
    expect(mediaParts("audio", { name: "v.ogg", mime: "audio/ogg", data: new Uint8Array(1) }, "").summary).toContain("sem fala");
  });

  it("TXT/CSV em UTF-8 ou Latin-1 e DOCX viram texto no contexto", () => {
    expect(decodeTextFile(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("OD -2,00")]))).toBe("OD -2,00");
    expect(decodeTextFile(new Uint8Array([0x61, 0xe7, 0xe3, 0x6f]))).toBe("ação");
    const csv = mediaParts("text", { name: "grau.csv", mime: "text/csv", data: bytes("olho;esferico\nOD;-1,25") });
    expect(csv.parts[0]).toMatchObject({ type: "text" });
    expect((csv.parts[0] as { text: string }).text).toContain("OD;-1,25");

    const file = docx('<w:document><w:body><w:p><w:r><w:t>Receita &amp; laudo</w:t></w:r></w:p><w:p><w:r><w:t>OE +1,50</w:t></w:r></w:p></w:body></w:document>');
    expect(extractDocxText(file)).toBe("Receita & laudo\nOE +1,50");
    expect((mediaParts("docx", { name: "laudo.docx", mime: "", data: file }).parts[0] as { text: string }).text).toContain("OE +1,50");
  });

  it("documento longo é cortado com aviso", () => {
    const media = mediaParts("text", { name: "longo.txt", mime: "text/plain", data: bytes("a".repeat(40_000)) });
    expect((media.parts[0] as { text: string }).text).toContain("documento cortado");
  });

  it("nome do áudio ganha a extensão que a transcrição reconhece", () => {
    expect(audioFileName("audio/ogg; codecs=opus", "voz.opus")).toBe("voz.ogg");
    expect(audioFileName("audio/webm", "gravacao")).toBe("gravacao.webm");
    expect(audioFileName("audio/mpeg", "musica.mp3")).toBe("musica.mp3");
  });

  it("resumo do anexo é juntado à última mensagem do cliente", () => {
    const history = attachSummary([{ from: "customer", text: "oi" }, { from: "ai", text: "Olá!" }, { from: "customer", text: "" }], "[Cliente enviou uma imagem: r.jpg]");
    expect(history.at(-1)).toEqual({ from: "customer", text: "[Cliente enviou uma imagem: r.jpg]" });
    expect(history[0].text).toBe("oi");
    expect(attachSummary([{ from: "customer", text: "veja" }], "[PDF]")[0].text).toBe("veja\n[PDF]");
  });
});

describe("custo das chamadas com anexo", () => {
  it("transcrição cobra US$ 0,006 por minuto de áudio", () => {
    expect(transcriptionCostUsd(60)).toBeCloseTo(0.006, 10);
    expect(transcriptionCostUsd(30)).toBeCloseTo(0.003, 10);
    expect(transcriptionCostUsd(Number.NaN)).toBe(0);
    expect(transcriptionCostUsd(-5)).toBe(0);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("tokens de imagem e PDF entram no custo da resposta pelos preços do modelo", () => {
    // gpt-5.4-mini: US$ 0,25 entrada e US$ 2 saída por milhão; uma imagem de receita ≈ 1.500 tokens de entrada.
    const prices = { priceInputPerMillionUsd: 0.25, priceOutputPerMillionUsd: 2 };
    expect(usageCostUsd(prices, 2_500, 300)).toBeCloseTo((2_500 * 0.25 + 300 * 2) / 1_000_000, 12);
  });
});
