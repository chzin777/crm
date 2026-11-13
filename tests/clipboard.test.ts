import { describe, expect, it } from "vitest";
import { extractClipboardImages, pastedImageName, type ClipboardItemLike } from "@/lib/clipboard";

const now = new Date("2026-11-13T13:05:00Z"); // 10:05 em Brasília
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" });
const fileItem = (file: File): ClipboardItemLike => ({ kind: "file", type: file.type, getAsFile: () => file });
const textItem = (type = "text/plain"): ClipboardItemLike => ({ kind: "string", type, getAsFile: () => null });

describe("colar imagem da área de transferência", () => {
  it("print PNG colado vira arquivo com nome amigável e o mesmo tipo", () => {
    const [file, ...rest] = extractClipboardImages({ items: [fileItem(png())], files: [] }, now);
    expect(rest).toHaveLength(0);
    expect(file.name).toBe("print-2026-11-13-1005.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(4);
  });

  it("só texto: nenhuma imagem (o colar normal segue)", () => {
    expect(extractClipboardImages({ items: [textItem(), textItem("text/html")], files: [] }, now)).toEqual([]);
    expect(extractClipboardImages(null)).toEqual([]);
  });

  it("imagem + texto (ex.: copiada do navegador): pega só a imagem", () => {
    const jpeg = new File([new Uint8Array([255, 216])], "image.jpeg", { type: "image/jpeg" });
    const files = extractClipboardImages({ items: [textItem("text/html"), fileItem(jpeg), textItem()], files: [jpeg] }, now);
    expect(files.map((file) => file.name)).toEqual(["print-2026-11-13-1005.jpg"]);
  });

  it("sem items, usa files; arquivo copiado do Explorer mantém o nome; não imagem é ignorado", () => {
    const named = new File([new Uint8Array([1])], "receita-joao.webp", { type: "image/webp" });
    const pdf = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    expect(extractClipboardImages({ items: null, files: [pdf, named] }, now).map((file) => file.name)).toEqual(["receita-joao.webp"]);
  });

  it("várias imagens ganham sufixo", () => {
    expect(extractClipboardImages({ items: [fileItem(png()), fileItem(png())] }, now).map((file) => file.name)).toEqual(["print-2026-11-13-1005.png", "print-2026-11-13-1005-2.png"]);
    expect(pastedImageName("image/x-icon", now)).toBe("print-2026-11-13-1005.xicon");
  });
});
