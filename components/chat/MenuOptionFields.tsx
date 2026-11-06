"use client";
import { ChoiceCards, MessageField, fieldClass, labelClass } from "@/components/chat/MenuFormParts";
import type { MenuOption } from "@/lib/chat/settings";

export type MenuPeople = { id: string; name: string }[];

export const CUSTOMER_VARIABLES = [{ mark: "{cliente}", label: "Nome do cliente" }, { mark: "{nome}", label: "Primeiro nome" }, { mark: "{saudacao}", label: "Bom dia/tarde/noite" }];

export const MENU_ACTIONS: { id: MenuOption["action"]; label: string; hint: string }[] = [
  { id: "reply", label: "Responder", hint: "Envia um texto e continua no menu." },
  { id: "submenu", label: "Abrir submenu", hint: "Mostra outra lista de opções." },
  { id: "queue", label: "Enviar à fila", hint: "Encerra o menu e passa para a equipe." },
  { id: "assign", label: "Atribuir a alguém", hint: "Entrega a conversa a uma pessoa." },
  { id: "tag", label: "Etiqueta ou segmento", hint: "Aplica ou remove e continua no menu." },
  { id: "close", label: "Encerrar", hint: "Envia a mensagem final e fecha." },
];

const TEXT_LABEL: Record<MenuOption["action"], string> = {
  reply: "Resposta enviada ao cliente",
  submenu: "Frase antes da lista (opcional)",
  queue: "Mensagem ao encaminhar (opcional)",
  assign: "Mensagem ao atribuir (opcional)",
  tag: "Resposta enviada ao cliente (opcional)",
  close: "Mensagem final",
  none: "Mensagem",
};

export function menuActionSummary(option: MenuOption, queues: MenuPeople, agents: MenuPeople) {
  if (option.action === "submenu") return `Submenu · ${option.options.length} ${option.options.length === 1 ? "opção" : "opções"}`;
  if (option.action === "queue") return `Fila: ${queues.find((queue) => queue.id === option.queueId)?.name ?? "não escolhida"}`;
  if (option.action === "assign") return `Atribui a ${agents.find((agent) => agent.id === option.assigneeId)?.name ?? "alguém não escolhido"}`;
  if (option.action === "tag") return `${option.tagMode === "add" ? "Aplica" : "Remove"} ${option.tagTarget === "tag" ? "etiqueta" : "segmento"}: ${option.tagValue || "não definido"}`;
  if (option.action === "close") return "Encerra o atendimento";
  if (option.action === "none") return "Sem destino";
  return "Responde um texto";
}

type Props = {
  option: MenuOption;
  queues: MenuPeople;
  agents: MenuPeople;
  onPatch: (patch: Partial<MenuOption>) => void;
};

/** Mesmos campos na lista e no fluxograma: as duas telas editam a mesma opção. */
export function MenuOptionFields({ option, queues, agents, onPatch }: Props) {
  return (
    <>
      <div>
        <p className={labelClass}>O que acontece ao escolher</p>
        <div role="radiogroup" aria-label="Ação da opção" className="grid gap-2 sm:grid-cols-3">
          {MENU_ACTIONS.map((action) => {
            const selected = option.action === action.id;
            return (
              <button key={action.id} type="button" role="radio" aria-checked={selected} onClick={() => onPatch({ action: action.id })} className={`cursor-pointer rounded-lg border p-2.5 text-left transition-colors ${selected ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5"}`}>
                <span className="block text-xs font-semibold text-slate-900 dark:text-white">{action.label}</span>
                <span className="block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{action.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
      {option.action === "queue" && (
        <div>
          <label htmlFor={`queue-${option.id}`} className={labelClass}>Fila de destino</label>
          <select id={`queue-${option.id}`} value={option.queueId ?? ""} onChange={(event) => onPatch({ queueId: event.target.value || null })} className={`${fieldClass} cursor-pointer`}>
            <option value="">Selecione a fila</option>
            {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
          </select>
        </div>
      )}
      {option.action === "assign" && (
        <div>
          <label htmlFor={`assignee-${option.id}`} className={labelClass}>Pessoa responsável</label>
          <select id={`assignee-${option.id}`} value={option.assigneeId ?? ""} onChange={(event) => onPatch({ assigneeId: event.target.value || null })} className={`${fieldClass} cursor-pointer`}>
            <option value="">Selecione a pessoa</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </div>
      )}
      {option.action === "tag" && (
        <>
          <ChoiceCards
            label="Aplicar em"
            value={option.tagTarget}
            onChange={(value) => onPatch({ tagTarget: value })}
            options={[
              { id: "tag", title: "Etiqueta", description: "Fica na conversa." },
              { id: "segment", title: "Segmento", description: "Fica no contato." },
            ]}
          />
          <ChoiceCards
            label="Operação"
            value={option.tagMode}
            onChange={(value) => onPatch({ tagMode: value })}
            options={[
              { id: "add", title: "Aplicar", description: "Inclui o valor." },
              { id: "remove", title: "Remover", description: "Tira o valor." },
            ]}
          />
          <div>
            <label htmlFor={`tag-${option.id}`} className={labelClass}>{option.tagTarget === "tag" ? "Etiqueta" : "Segmento"}</label>
            <input id={`tag-${option.id}`} value={option.tagValue} maxLength={40} onChange={(event) => onPatch({ tagValue: event.target.value })} className={fieldClass} />
          </div>
        </>
      )}
      {option.action !== "none" && (
        <MessageField id={`text-${option.id}`} variables={CUSTOMER_VARIABLES} label={TEXT_LABEL[option.action]} value={option.text} onChange={(value) => onPatch({ text: value })} />
      )}
    </>
  );
}
