import { requireChatActor } from "@/lib/chat/access";
import { onChatChange } from "@/lib/chat/events";

const HEARTBEAT_MS = 25_000;

/** Canal SSE: só avisa que houve mudança, sem dados, e o navegador consulta o pulse. */
export async function GET(request: Request) {
  const guard = await requireChatActor();
  if (guard.response) return guard.response;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = onChatChange(() => write("data: change\n\n"));
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // A conexão já foi encerrada.
        }
      });
      write(": connected\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
