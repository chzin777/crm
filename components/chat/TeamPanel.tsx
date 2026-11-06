"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CircleDot, MessagesSquare, PauseCircle, Search, Users } from "lucide-react";
import { Switch } from "@/components/chat/MenuFormParts";
import { Metric, type QueueAgent, type QueueRecord } from "@/components/chat/QueueBoard";
import { initials } from "@/lib/chat/format";

type Filter = "all" | "online" | "paused" | "noAccess";

const SLIDER_MAX = 30;

const FILTERS: { id: Filter; label: string; test: (agent: QueueAgent) => boolean }[] = [
  { id: "all", label: "Todos", test: () => true },
  { id: "online", label: "Online", test: (agent) => agent.online },
  { id: "paused", label: "Pausados", test: (agent) => agent.paused },
  { id: "noAccess", label: "Sem acesso", test: (agent) => !agent.hasChatAccess },
];

function statusOf(agent: QueueAgent) {
  if (!agent.hasChatAccess) return { label: "Sem acesso", style: "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]" };
  if (agent.paused) return { label: "Pausado", style: "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]" };
  if (agent.online) return { label: "Online", style: "bg-[#25D366]/15 text-[#128C4A] dark:text-[#25D366]" };
  return { label: "Offline", style: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
}

function LimitSlider({ agent, onCommit }: { agent: QueueAgent; onCommit: (capacity: number) => void }) {
  const [value, setValue] = useState(agent.capacity);
  const latest = useRef(agent.capacity);

  useEffect(() => {
    setValue(agent.capacity);
    latest.current = agent.capacity;
  }, [agent.capacity]);

  const max = Math.max(SLIDER_MAX, agent.capacity);
  const percent = (value / max) * 100;
  const lockedAtLoad = agent.open > 0 && value === agent.open;

  const commit = () => {
    if (latest.current !== agent.capacity) onCommit(latest.current);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Limite simultâneo</span>
        <span className="text-sm font-bold text-[#002187] dark:text-[#C4D600]">{value === 0 ? "Fora do atendimento" : `${value} ${value === 1 ? "conversa" : "conversas"}`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        aria-label={`Limite de conversas de ${agent.name}`}
        aria-valuetext={`${value} conversas`}
        onChange={(event) => {
          // Abaixo do que a pessoa já tem aberto, o servidor recusaria: o controle para ali.
          const next = Math.max(Number(event.target.value), agent.open);
          latest.current = next;
          setValue(next);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        style={{ background: `linear-gradient(to right, var(--slider-fill) ${percent}%, var(--slider-rest) ${percent}%)` }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full [--slider-fill:#002187] [--slider-rest:#e2e8f0] dark:[--slider-fill:#C4D600] dark:[--slider-rest:#1e293b] [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#002187] dark:[&::-moz-range-thumb]:bg-[#C4D600] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#002187] [&::-webkit-slider-thumb]:shadow-md active:[&::-webkit-slider-thumb]:cursor-grabbing dark:[&::-webkit-slider-thumb]:bg-[#C4D600]"
      />
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
        <span>0</span>
        {lockedAtLoad && <span className="text-[#b4531f] dark:text-[#F7915E]">Não desce abaixo das {agent.open} abertas</span>}
        <span>{max}</span>
      </div>
    </div>
  );
}

function AgentCard({ agent, queues, act }: { agent: QueueAgent; queues: QueueRecord[]; act: Props["act"] }) {
  const status = statusOf(agent);
  const usage = agent.capacity > 0 ? Math.min(agent.open / agent.capacity, 1) : 0;
  const agentQueues = queues.filter((queue) => agent.queueIds.includes(queue.id));

  return (
    <article className={`flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition-opacity dark:border-slate-700/80 dark:bg-[#07194f] ${agent.paused ? "opacity-80" : ""}`}>
      <header className="flex items-center gap-3">
        <span className="relative shrink-0">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{initials(agent.name)}</span>
          <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#07194f] ${agent.online ? "bg-[#25D366]" : "bg-slate-300 dark:bg-slate-600"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{agent.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{agent.email}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.style}`}>{status.label}</span>
      </header>

      {!agent.hasChatAccess && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[#F7915E]/10 px-3 py-2 text-xs text-slate-700 dark:text-slate-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F7915E]" />O cargo desta pessoa não tem acesso ao Atendimento.
        </p>
      )}

      <LimitSlider agent={agent} onCommit={(capacity) => void act("/api/chat/team", "PATCH", { userId: agent.id, capacity }, "Limite salvo.")} />

      <div>
        <div className="mb-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Em atendimento agora</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{agent.open}{agent.capacity > 0 ? ` de ${agent.capacity}` : ""}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className={`h-full rounded-full transition-all ${usage >= 1 ? "bg-[#F7915E]" : "bg-[#25D366]"}`} style={{ width: `${usage * 100}%` }} />
        </div>
      </div>

      <div className="flex min-h-6 flex-wrap gap-1.5">
        {agentQueues.length === 0 ? (
          <span className="text-xs text-slate-400">Em nenhuma fila</span>
        ) : agentQueues.map((queue) => (
          <span key={queue.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <span className="h-2 w-2 rounded-full ring-1 ring-black/5 dark:ring-white/40" style={{ backgroundColor: queue.color }} />{queue.name}
          </span>
        ))}
      </div>

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{agent.paused ? "Pausado" : "Recebendo conversas"}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{agent.paused ? "Mantém as atuais, sem receber novas" : "Disponível para novas conversas"}</p>
        </div>
        <Switch checked={!agent.paused} onChange={(receiving) => void act("/api/chat/team", "PATCH", { userId: agent.id, paused: !receiving })} label={`${agent.name} recebendo conversas`} />
      </footer>
    </article>
  );
}

type Props = {
  agents: QueueAgent[];
  queues: QueueRecord[];
  act: (url: string, method: string, body?: unknown, success?: string) => Promise<boolean>;
};

export function TeamPanel({ agents, queues, act }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const test = FILTERS.find((item) => item.id === filter)!.test;
    return agents.filter((agent) => test(agent) && (!term || agent.name.toLowerCase().includes(term) || agent.email.toLowerCase().includes(term)));
  }, [agents, search, filter]);

  const active = agents.filter((agent) => !agent.paused);
  const open = agents.reduce((total, agent) => total + agent.open, 0);
  const activeOpen = active.reduce((total, agent) => total + agent.open, 0);
  const capacity = active.reduce((total, agent) => total + agent.capacity, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs xl:grid-cols-4 dark:border-slate-700/80 dark:bg-[#07194f]">
        <Metric icon={CircleDot} label="Online agora" value={`${agents.filter((agent) => agent.online).length}/${agents.length}`} />
        <Metric icon={MessagesSquare} label="Em andamento" value={String(open)} />
        <Metric icon={Users} label="Carga de quem recebe" value={`${activeOpen}/${capacity}`} alert={capacity > 0 && activeOpen >= capacity} />
        <Metric icon={PauseCircle} label="Pausados" value={String(agents.length - active.length)} alert={active.length < agents.length} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail..." aria-label="Buscar usuário" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#07194f] dark:text-white dark:focus:border-[#C4D600]" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar equipe">
          {FILTERS.map((item) => {
            const selected = filter === item.id;
            return (
              <button key={item.id} type="button" aria-pressed={selected} onClick={() => setFilter(item.id)} className={`h-8 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors ${selected ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}>
                {item.label} <span className="opacity-70">{agents.filter(item.test).length}</span>
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{visible.length} de {agents.length} {agents.length === 1 ? "pessoa" : "pessoas"}</span>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Ninguém encontrado com esse filtro.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((agent) => <AgentCard key={agent.id} agent={agent} queues={queues} act={act} />)}
        </div>
      )}
    </div>
  );
}
