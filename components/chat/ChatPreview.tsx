"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { List, RotateCcw, X } from "lucide-react";

/** Peças do celular de simulação em /filas: o menu e o encerramento usam as mesmas. */

export type PreviewRow = { id: string; title: string; description?: string };

const bubble = "rounded-2xl rounded-bl-sm border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white";

export function PreviewNote({ text }: { text: string }) {
  return <p className="mx-auto w-fit max-w-[90%] rounded-lg bg-slate-200/70 px-2.5 py-1 text-center text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{text}</p>;
}

export function PreviewBubble({ from, text }: { from: "bot" | "customer"; text: string }) {
  return (
    <div className={`flex ${from === "customer" ? "justify-end" : "justify-start"}`}>
      <p className={`max-w-[85%] whitespace-pre-wrap break-words px-3 py-2 text-xs leading-relaxed ${from === "customer" ? "rounded-2xl rounded-br-sm bg-[#051647] text-white shadow-sm dark:bg-[#C4D600] dark:text-[#051647]" : bubble}`}>{text}</p>
    </div>
  );
}

/** Mensagem interativa de lista: texto e o botão que abre as opções. */
export function PreviewListBubble({ header, body, footer, button, active, onOpen }: { header?: string; body: string; footer?: string; button: string; active: boolean; onOpen: () => void }) {
  return (
    <div className="flex justify-start">
      <div className={`w-[85%] overflow-hidden ${bubble}`}>
        <div className="px-3 pb-2 pt-2.5">
          {header && <p className="mb-1 text-xs font-bold">{header}</p>}
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{body}</p>
          {footer && <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">{footer}</p>}
        </div>
        <button type="button" disabled={!active} onClick={onOpen} className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-slate-200 py-2 text-xs font-semibold text-[#002187] hover:bg-slate-50 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5">
          <List className="h-3.5 w-3.5" />{button}
        </button>
      </div>
    </div>
  );
}

/** Gaveta com as linhas da lista, como o WhatsApp abre no celular. */
export function PreviewListSheet({ title, rows, onPick, onClose }: { title: string; rows: PreviewRow[]; onPick: (row: PreviewRow) => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div role="dialog" aria-label={title} className="max-h-[75%] overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
          <button type="button" onClick={onClose} aria-label="Fechar lista" className="cursor-pointer rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
          <p className="flex-1 text-center text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
          <span className="w-6" />
        </div>
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => onPick(row)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900 dark:text-white">{row.title || "Sem rótulo"}</span>
                  {row.description && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{row.description}</span>}
                </span>
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Moldura: cabeçalho com recomeçar, conversa rolando até o fim e rodapé de ajuda. */
export function PreviewFrame({ onReset, footer, overlay, scrollKey, children }: { onReset: () => void; footer: ReactNode; overlay?: ReactNode; scrollKey: unknown; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [scrollKey]);

  return (
    <div className="relative flex h-[440px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Simulador</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Nada é enviado ao cliente</p>
        </div>
        <button type="button" onClick={onReset} title="Recomeçar" aria-label="Recomeçar simulação" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><RotateCcw className="h-4 w-4" /></button>
      </div>
      <div ref={box} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efe7dd]/30 p-3 dark:bg-[#0b1a3a]">{children}</div>
      <div className="shrink-0 border-t border-slate-100 p-2 dark:border-slate-800">{footer}</div>
      {overlay}
    </div>
  );
}

export function PreviewHint({ text }: { text: string }) {
  return <p className="px-2 py-1.5 text-center text-xs text-slate-500 dark:text-slate-400">{text}</p>;
}
