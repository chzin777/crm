import { requireModule } from "@/lib/api-auth";
import { liveSnapshot, subscribeLive, type LiveEvent } from "@/lib/sales-live/live-db";

const HEARTBEAT_MS = 20_000;

/** Canal SSE das vendas ao vivo: retrato ao conectar e, a cada ciclo do poller, os pedidos novos ou alterados. */
export async function GET(request: Request) {
  const guard = await requireModule("vendas", "painel", "campanhas", "metricas");
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
      const send = (event: LiveEvent) => write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const unsubscribe = subscribeLive(send);
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
          // Conexão já encerrada.
        }
      });
      write("retry: 5000\n\n");
      void liveSnapshot().then(({ snapshot }) => {
        if (snapshot) send({ type: "snapshot", snapshot });
      });
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
