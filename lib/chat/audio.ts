import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** A Meta não aceita o webm do Chrome: converte para ogg/opus mono antes de enviar. */
export async function convertToOggOpus(input: Buffer) {
  const folder = await mkdtemp(join(tmpdir(), "chat-audio-"));
  const source = join(folder, "input");
  const target = join(folder, "output.ogg");
  try {
    await writeFile(source, input);
    // Sem make_zero o ogg começa com timestamp negativo, herdado do pre-skip do opus.
    await run("ffmpeg", ["-y", "-i", source, "-vn", "-map_metadata", "-1", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", "-avoid_negative_ts", "make_zero", "-f", "ogg", target], { timeout: 30_000 });
    return await readFile(target);
  } catch (error) {
    console.error("[chat] falha ao converter áudio:", error);
    throw new Error("Não foi possível converter o áudio para envio.");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
