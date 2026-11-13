import { brClock } from "@/lib/br-time";

/** Formato mínimo de DataTransfer (o do navegador, ou um objeto de teste). */
export type ClipboardItemLike = { kind: string; type: string; getAsFile(): File | null };
export type ClipboardLike = { items?: ArrayLike<ClipboardItemLike> | null; files?: ArrayLike<File> | null } | null | undefined;

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp", "image/avif": "avif" };

/** Nome amigável do print colado, no horário de Brasília: print-2026-11-13-1005.png (com -2, -3... se vierem várias). */
export function pastedImageName(type: string, now = new Date(), index = 0) {
  const clock = brClock(now);
  const stamp = `${clock.day}-${String(clock.hour).padStart(2, "0")}${String(clock.minute).padStart(2, "0")}`;
  const extension = EXTENSIONS[type.toLowerCase()] ?? (type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png");
  return `print-${stamp}${index ? `-${index + 1}` : ""}.${extension}`;
}

/** O navegador chama todo print de "image.png": esse nome vira o amigável; arquivo copiado do Explorer mantém o nome. */
const GENERIC_NAME = /^(image|imagem|blob|clipboard)(\.\w+)?$/i;

/**
 * Imagens da área de transferência (Ctrl+V / Cmd+V). Lê items (print, imagem copiada do navegador ou do
 * WhatsApp Web) e, se não houver, files. Só texto: devolve [] e o colar normal segue.
 */
export function extractClipboardImages(data: ClipboardLike, now = new Date()): File[] {
  if (!data) return [];
  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
  const found = fromItems.length ? fromItems : Array.from(data.files ?? []).filter((file) => file.type.toLowerCase().startsWith("image/"));
  return found.map((file, index) =>
    !file.name || GENERIC_NAME.test(file.name) ? new File([file], pastedImageName(file.type, now, index), { type: file.type, lastModified: now.getTime() }) : file,
  );
}
