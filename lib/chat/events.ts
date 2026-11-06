import "server-only";
import { EventEmitter } from "node:events";

// O app roda em um único processo; o globalThis mantém o mesmo emissor entre os bundles das rotas.
const store = globalThis as typeof globalThis & { chatEvents?: EventEmitter };
const emitter = store.chatEvents ?? new EventEmitter().setMaxListeners(0);
store.chatEvents = emitter;

/** Avisa quem está no /chat que algo mudou; o conteúdo sempre vem das rotas com escopo. */
export function notifyChatChange() {
  emitter.emit("change");
}

export function onChatChange(listener: () => void) {
  emitter.on("change", listener);
  return () => {
    emitter.off("change", listener);
  };
}
