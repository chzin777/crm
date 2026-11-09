"use client";
import { useState } from "react";
import { PreviewBubble, PreviewFrame, PreviewHint, PreviewListBubble, PreviewListSheet, PreviewNote } from "@/components/chat/ChatPreview";
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

/** Mostra o que o cliente veria, sem enviar nada pelo WhatsApp. */
export function MenuSimulator({ settings, queues, agents }: { settings: ChatMenuSettings; queues: { id: string; name: string }[]; agents: { id: string; name: string }[] }) {
  const [path, setPath] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>(() => start(settings));
  const [stopped, setStopped] = useState(false);
  const [sheet, setSheet] = useState<MenuListRow[] | null>(null);

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
  const usesList = lastList >= 0 && !stopped;

  const footer = stopped ? (
    <PreviewHint text="O menu parou. Agora é com a equipe." />
  ) : options.length === 0 ? (
    <PreviewHint text="Adicione opções para simular." />
  ) : usesList ? (
    <PreviewHint text={`Toque em “${MENU_LIST.button}” na mensagem para escolher.`} />
  ) : (
    <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
      {options.map((option, index) => (
        <button key={option.id} type="button" onClick={() => choose(option, String(index + 1))} className="max-w-full cursor-pointer truncate rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          {index + 1}. {option.label || "Sem rótulo"}
        </button>
      ))}
      {path.length > 0 && <button type="button" onClick={() => goBack("0")} className="cursor-pointer rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">0. Voltar</button>}
    </div>
  );

  return (
    <PreviewFrame
      onReset={reset}
      scrollKey={lines}
      footer={footer}
      overlay={sheet && <PreviewListSheet title={MENU_LIST.button} rows={sheet} onPick={pickRow} onClose={() => setSheet(null)} />}
    >
      {lines.map((line, index) =>
        line.from === "note" ? (
          <PreviewNote key={index} text={line.text} />
        ) : line.from === "list" ? (
          <PreviewListBubble key={index} header={MENU_LIST.header} body={line.body} footer={MENU_LIST.footer} button={MENU_LIST.button} active={index === lastList && !stopped} onOpen={() => setSheet(line.rows)} />
        ) : (
          <PreviewBubble key={index} from={line.from} text={line.text} />
        ),
      )}
    </PreviewFrame>
  );
}
