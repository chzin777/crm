"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { composeWithMenu, optionsAt, type ChatMenuSettings, type MenuOption } from "@/lib/chat/settings";
import { fillVariables } from "@/lib/chat/text";

type Line = { from: "bot" | "customer" | "note"; text: string };

const fill = (text: string) => fillVariables(text, { customer: "Maria Silva", agent: "Ana", queue: "Atendimento" });

function start(settings: ChatMenuSettings): Line[] {
  return [{ from: "customer", text: "Oi" }, { from: "bot", text: fill(composeWithMenu(settings, [], [settings.greeting])) }];
}

/** Mostra o que o cliente veria, sem enviar nada pelo WhatsApp. */
export function MenuSimulator({ settings, queues }: { settings: ChatMenuSettings; queues: { id: string; name: string }[] }) {
  const [path, setPath] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>(() => start(settings));
  const [stopped, setStopped] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const reset = () => {
    setPath([]);
    setStopped(false);
    setLines(start(settings));
  };

  const signature = JSON.stringify(settings);
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines]);

  const choose = (option: MenuOption, index: number) => {
    const next: Line[] = [{ from: "customer", text: String(index + 1) }];
    if (option.action === "submenu") {
      const nextPath = [...path, option.id];
      setPath(nextPath);
      next.push({ from: "bot", text: fill(composeWithMenu(settings, nextPath, [option.text])) });
    } else if (option.action === "queue") {
      if (option.text.trim()) next.push({ from: "bot", text: fill(option.text) });
      const queue = queues.find((item) => item.id === option.queueId);
      next.push({ from: "note", text: `Conversa vai para a fila ${queue?.name ?? "padrão"}` });
      setStopped(true);
    } else {
      next.push({ from: "bot", text: fill(option.text) || "(sem texto)" });
      if (settings.closingText.trim()) next.push({ from: "note", text: `Em ${settings.closingDelaySeconds}s: “${settings.closingText}”` });
    }
    setLines((current) => [...current, ...next]);
  };

  const goBack = () => {
    const nextPath = path.slice(0, -1);
    setPath(nextPath);
    setLines((current) => [...current, { from: "customer", text: "0" }, { from: "bot", text: fill(composeWithMenu(settings, nextPath, [])) }]);
  };

  const options = optionsAt(settings, path);

  return (
    <div className="flex h-[440px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Simulador</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Nada é enviado ao cliente</p>
        </div>
        <button type="button" onClick={reset} title="Recomeçar" aria-label="Recomeçar simulação" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><RotateCcw className="h-4 w-4" /></button>
      </div>
      <div ref={box} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efe7dd]/30 p-3 dark:bg-[#0b1a3a]">
        {lines.map((line, index) =>
          line.from === "note" ? (
            <p key={index} className="mx-auto w-fit max-w-[90%] rounded-lg bg-slate-200/70 px-2.5 py-1 text-center text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{line.text}</p>
          ) : (
            <div key={index} className={`flex ${line.from === "customer" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${line.from === "customer" ? "rounded-br-sm bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "rounded-bl-sm border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"}`}>{line.text}</p>
            </div>
          ),
        )}
      </div>
      <div className="shrink-0 border-t border-slate-100 p-2 dark:border-slate-800">
        {stopped ? (
          <p className="px-2 py-1.5 text-center text-xs text-slate-500 dark:text-slate-400">O menu parou. Agora é com a equipe.</p>
        ) : options.length === 0 ? (
          <p className="px-2 py-1.5 text-center text-xs text-slate-500 dark:text-slate-400">Adicione opções para simular.</p>
        ) : (
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {options.map((option, index) => (
              <button key={option.id} type="button" onClick={() => choose(option, index)} className="max-w-full cursor-pointer truncate rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {index + 1}. {option.label || "Sem rótulo"}
              </button>
            ))}
            {path.length > 0 && <button type="button" onClick={goBack} className="cursor-pointer rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">0. Voltar</button>}
          </div>
        )}
      </div>
    </div>
  );
}
