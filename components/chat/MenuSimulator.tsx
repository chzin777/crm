"use client";
import { useEffect, useRef, useState } from "react";
import { List, RotateCcw, X } from "lucide-react";
import { composeWithMenu, MENU_LIST, menuList, optionsAt, type ChatMenuSettings, type MenuListRow, type MenuOption } from "@/lib/chat/settings";
import { fillVariables } from "@/lib/chat/text";

type Line =
  | { from: "bot" | "customer" | "note"; text: string }
  | { from: "list"; body: string; rows: MenuListRow[] };

const fill = (text: string) => fillVariables(text, { customer: "Maria Silva", agent: "Ana", queue: "Atendimento" });

/** O mesmo formato do envio real: lista nativa quando cabe, texto numerado quando não. */
function menuLine(settings: ChatMenuSettings, path: string[], parts: string[]): Line {
  const list = menuList(settings, path, parts);
  if (!list) return { from: "bot", text: fill(composeWithMenu(settings, path, parts)) };
  return { from: "list", body: fill(list.body) || "Como podemos ajudar?", rows: list.rows };
}

function start(settings: ChatMenuSettings): Line[] {
  return [{ from: "customer", text: "Oi" }, menuLine(settings, [], [settings.greeting])];
}

const bubble = "rounded-2xl rounded-bl-sm border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white";

/** Mostra o que o cliente veria, sem enviar nada pelo WhatsApp. */
export function MenuSimulator({ settings, queues, agents }: { settings: ChatMenuSettings; queues: { id: string; name: string }[]; agents: { id: string; name: string }[] }) {
  const [path, setPath] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>(() => start(settings));
  const [stopped, setStopped] = useState(false);
  const [sheet, setSheet] = useState<MenuListRow[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const reset = () => {
    setPath([]);
    setStopped(false);
    setSheet(null);
    setLines(start(settings));
  };

  // Qualquer mudança no formulário recomeça a simulação já com o texto novo.
  const signature = JSON.stringify(settings);
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    reset();
  }

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines]);

  const choose = (option: MenuOption, answer: string) => {
    const next: Line[] = [{ from: "customer", text: answer }];
    if (option.action === "submenu") {
      const nextPath = [...path, option.id];
      setPath(nextPath);
      next.push(menuLine(settings, nextPath, [option.text]));
    } else if (option.action === "queue") {
      if (option.text.trim()) next.push({ from: "bot", text: fill(option.text) });
      const queue = queues.find((item) => item.id === option.queueId);
      next.push({ from: "note", text: `Conversa vai para a fila ${queue?.name ?? "padrão"}` });
      setStopped(true);
    } else if (option.action === "assign") {
      if (option.text.trim()) next.push({ from: "bot", text: fill(option.text) });
      next.push({ from: "note", text: `Conversa atribuída a ${agents.find((agent) => agent.id === option.assigneeId)?.name ?? "ninguém (vai para a fila)"}` });
      setStopped(true);
    } else if (option.action === "close") {
      if (option.text.trim()) next.push({ from: "bot", text: fill(option.text) });
      next.push({ from: "note", text: "Conversa encerrada" });
      setStopped(true);
    } else if (option.action === "none") {
      next.push({ from: "note", text: "Esta opção ainda não tem destino" });
      next.push(menuLine(settings, path, [settings.invalidOptionText]));
    } else {
      if (option.action === "tag") next.push({ from: "note", text: `${option.tagMode === "add" ? "Aplica" : "Remove"} ${option.tagTarget === "tag" ? "etiqueta" : "segmento"}: ${option.tagValue || "não definido"}` });
      if (option.action === "reply" || option.text.trim()) next.push({ from: "bot", text: fill(option.text) || "(sem texto)" });
      if (settings.closingText.trim()) next.push({ from: "note", text: `Em ${settings.closingDelaySeconds}s: “${settings.closingText}”` });
    }
    setLines((current) => [...current, ...next]);
  };

  const goBack = (answer: string) => {
    const nextPath = path.slice(0, -1);
    setPath(nextPath);
    setLines((current) => [...current, { from: "customer", text: answer }, menuLine(settings, nextPath, [])]);
  };

  const options = optionsAt(settings, path);

  const pickRow = (row: MenuListRow) => {
    setSheet(null);
    if (row.id === MENU_LIST.backId) return goBack(row.title);
    const option = options.find((item) => `menu_${item.id}` === row.id);
    if (option) choose(option, row.title);
  };

  // Só a lista mais recente responde: as antigas ficam como histórico.
  const lastList = lines.reduce((found, line, index) => (line.from === "list" ? index : found), -1);
  const usesList = lastList >= 0 && lines[lastList].from === "list" && !stopped;

  return (
    <div className="relative flex h-[440px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Simulador</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Nada é enviado ao cliente</p>
        </div>
        <button type="button" onClick={reset} title="Recomeçar" aria-label="Recomeçar simulação" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><RotateCcw className="h-4 w-4" /></button>
      </div>
      <div ref={box} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efe7dd]/30 p-3 dark:bg-[#0b1a3a]">
        {lines.map((line, index) => {
          if (line.from === "note") {
            return <p key={index} className="mx-auto w-fit max-w-[90%] rounded-lg bg-slate-200/70 px-2.5 py-1 text-center text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{line.text}</p>;
          }
          if (line.from === "list") {
            const active = index === lastList && !stopped;
            return (
              <div key={index} className="flex justify-start">
                <div className={`w-[85%] overflow-hidden ${bubble}`}>
                  <div className="px-3 pb-2 pt-2.5">
                    <p className="text-xs font-bold">{MENU_LIST.header}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">{line.body}</p>
                    <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">{MENU_LIST.footer}</p>
                  </div>
                  <button type="button" disabled={!active} onClick={() => setSheet(line.rows)} className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-slate-200 py-2 text-xs font-semibold text-[#002187] hover:bg-slate-50 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-slate-700 dark:text-[#C4D600] dark:hover:bg-white/5">
                    <List className="h-3.5 w-3.5" />{MENU_LIST.button}
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div key={index} className={`flex ${line.from === "customer" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[85%] whitespace-pre-wrap break-words px-3 py-2 text-xs leading-relaxed ${line.from === "customer" ? "rounded-2xl rounded-br-sm bg-[#051647] text-white shadow-sm dark:bg-[#C4D600] dark:text-[#051647]" : bubble}`}>{line.text}</p>
            </div>
          );
        })}
      </div>
      <div className="shrink-0 border-t border-slate-100 p-2 dark:border-slate-800">
        {stopped ? (
          <p className="px-2 py-1.5 text-center text-xs text-slate-500 dark:text-slate-400">O menu parou. Agora é com a equipe.</p>
        ) : options.length === 0 ? (
          <p className="px-2 py-1.5 text-center text-xs text-slate-500 dark:text-slate-400">Adicione opções para simular.</p>
        ) : usesList ? (
          <p className="px-2 py-1.5 text-center text-xs text-slate-500 dark:text-slate-400">Toque em “{MENU_LIST.button}” na mensagem para escolher.</p>
        ) : (
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {options.map((option, index) => (
              <button key={option.id} type="button" onClick={() => choose(option, String(index + 1))} className="max-w-full cursor-pointer truncate rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {index + 1}. {option.label || "Sem rótulo"}
              </button>
            ))}
            {path.length > 0 && <button type="button" onClick={() => goBack("0")} className="cursor-pointer rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">0. Voltar</button>}
          </div>
        )}
      </div>

      {sheet && (
        <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black/40" onClick={() => setSheet(null)}>
          <div role="dialog" aria-label={MENU_LIST.button} className="max-h-[75%] overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
              <button type="button" onClick={() => setSheet(null)} aria-label="Fechar lista" className="cursor-pointer rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
              <p className="flex-1 text-center text-sm font-semibold text-slate-900 dark:text-white">{MENU_LIST.button}</p>
              <span className="w-6" />
            </div>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {sheet.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => pickRow(row)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5">
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
      )}
    </div>
  );
}
