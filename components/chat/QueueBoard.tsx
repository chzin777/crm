"use client";
import { useState } from "react";
import { AlertTriangle, Archive, Clock, Inbox, Pause, Pencil, Play, Search, UserMinus, UserPlus, Users } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { AddMembersDialog } from "@/components/chat/AddMembersDialog";
import { QueueWaitingList } from "@/components/chat/QueueWaitingList";
import { initials, waitingLabel } from "@/lib/chat/format";

export type QueueMember = { userId: string; name: string; online: boolean; open: number; capacity: number; paused: boolean };
export type QueueRecord = { id: string; name: string; description: string; color: string; hours: string; firstResponseSlaMin: number; order: number; waiting: number; oldestWaiting: string | null; members: QueueMember[] };
export type QueueAgent = { id: string; name: string; email: string; hasChatAccess: boolean; capacity: number; paused: boolean; online: boolean; open: number; queueIds: string[] };

type Props = {
  queues: QueueRecord[];
  agents: QueueAgent[];
  canManage: boolean;
  onEdit: (queue: QueueRecord) => void;
  act: (url: string, method: string, body?: unknown, success?: string) => Promise<boolean>;
};

export function Metric({ icon: Icon, label, value, alert = false, healthy = false }: { icon: typeof Inbox; label: string; value: string; alert?: boolean; healthy?: boolean }) {
  const good = healthy && !alert;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-white/5">
      <Icon className={`shrink-0 ${alert ? "h-5 w-5 text-[#F7915E]" : good ? "h-7 w-7 rounded-lg bg-[#C4D600] p-1.5 text-[#051647]" : "h-5 w-5 text-slate-400"}`} />
      <div className="min-w-0">
        <p className={`text-lg font-bold leading-tight ${good ? "text-[#051647] dark:text-[#C4D600]" : "text-slate-900 dark:text-white"}`}>{value}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export function QueueBoard({ queues, agents, canManage, onEdit, act }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const queue = queues.find((item) => item.id === selectedId) ?? queues[0];
  if (!queue) return null;

  const term = filter.trim().toLowerCase();
  const listed = term ? queues.filter((item) => item.name.toLowerCase().includes(term)) : queues;
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const memberTerm = memberSearch.trim().toLowerCase();
  const members = memberTerm ? queue.members.filter((member) => member.name.toLowerCase().includes(memberTerm)) : queue.members;
  const candidates = agents.filter((agent) => !agent.queueIds.includes(queue.id));
  const online = queue.members.filter((member) => member.online).length;
  const open = queue.members.reduce((total, member) => total + member.open, 0);
  const capacity = queue.members.reduce((total, member) => total + (member.paused ? 0 : member.capacity), 0);
  const oldest = queue.oldestWaiting ? waitingLabel(queue.oldestWaiting) : null;

  const addMembers = async (userIds: string[]) => {
    const done = await act(`/api/chat/queues/${queue.id}/members`, "POST", { userIds }, userIds.length === 1 ? "Pessoa adicionada." : `${userIds.length} pessoas adicionadas.`);
    if (done) setAdding(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-slate-200/80 bg-white shadow-xs lg:self-start dark:border-slate-700/80 dark:bg-[#07194f]">
        <div className="relative border-b border-slate-100 p-3 dark:border-slate-800">
          <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar fila..." aria-label="Buscar fila" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
        </div>
        <ul className="p-2">
          {listed.map((item) => {
            const active = item.id === queue.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={active}
                  onClick={() => { setSelectedId(item.id); setMemberSearch(""); }}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-left transition-colors ${active ? "border-[#C4D600] bg-[#051647]/5 dark:bg-white/10" : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5"}`}
                >
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{item.name}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{item.members.length} {item.members.length === 1 ? "pessoa" : "pessoas"}</span>
                  </span>
                  {item.waiting > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#F7915E] px-1.5 text-xs font-bold text-[#051647]" title={`${item.waiting} esperando`}>{item.waiting}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-700/80 dark:bg-[#07194f]">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: queue.color }} />
              <span className="truncate">{queue.name}</span>
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{queue.description || "Sem descrição"}</p>
            <p className="mt-1 text-xs text-slate-400">{queue.hours || "Horário não definido"} · 1ª resposta em {queue.firstResponseSlaMin} min</p>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => onEdit(queue)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" />Editar</button>
              <button type="button" onClick={() => setArchiving(true)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Archive className="h-4 w-4" />Arquivar</button>
            </div>
          )}
        </header>

        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric icon={Inbox} label="Esperando agora" value={String(queue.waiting)} alert={queue.waiting > 0} healthy />
          <Metric icon={Clock} label="Maior espera" value={oldest ? oldest.text : "-"} alert={(oldest?.minutes ?? 0) >= 3} healthy={!!oldest} />
          <Metric icon={Users} label="Online" value={`${online}/${queue.members.length}`} healthy={online > 0} />
          <Metric icon={UserPlus} label="Carga da fila" value={`${open}/${capacity}`} alert={capacity > 0 && open >= capacity} healthy={capacity > 0} />
        </div>

        <QueueWaitingList queueId={queue.id} act={act} />

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pessoas na fila</h3>
          <div className="flex items-center gap-2">
            {queue.members.length > 5 && (
              <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar pessoa..." aria-label="Buscar pessoa na fila" className="h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
            )}
            {canManage && (
              <button type="button" onClick={() => setAdding(true)} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#C4D600] px-3 text-sm font-semibold text-[#051647] hover:bg-[#b3c400]"><UserPlus className="h-4 w-4" />Adicionar pessoas</button>
            )}
          </div>
        </div>

        {queue.members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
            <Users className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Ninguém nesta fila ainda</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sem membros, só quem vê todas as conversas enxerga o que chega aqui.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((member) => {
              const agent = agentById.get(member.userId);
              const ratio = member.capacity > 0 ? Math.min(member.open / member.capacity, 1) : 0;
              return (
                <li key={member.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="relative shrink-0">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{initials(member.name)}</span>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#07194f] ${member.online ? "bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`} title={member.online ? "Online" : "Offline"} />
                  </span>
                  <div className="min-w-44 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <span className="truncate">{member.name}</span>
                      {member.online && !member.paused && <span className="rounded bg-[#C4D600] px-1.5 py-0.5 text-[10px] font-semibold text-[#051647]">Online</span>}
                      {member.paused && <span className="rounded bg-[#F7915E]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#b4531f] dark:text-[#F7915E]">Pausada</span>}
                    </p>
                    {agent && !agent.hasChatAccess ? (
                      <p className="flex items-center gap-1 text-xs font-medium text-[#b4531f] dark:text-[#F7915E]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Sem acesso ao Atendimento no cargo</p>
                    ) : (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{agent?.email ?? ""}</p>
                    )}
                  </div>
                  <div className="w-32 shrink-0">
                    <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{member.open} de {member.capacity} conversas</p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${ratio >= 1 ? "bg-[#F7915E]" : "bg-[#C4D600]"}`} style={{ width: `${ratio * 100}%` }} />
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        Limite
                        <input
                          type="number"
                          min={0}
                          max={200}
                          key={`${member.userId}-${member.capacity}`}
                          defaultValue={member.capacity}
                          aria-label={`Limite de conversas de ${member.name}`}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            if (value !== member.capacity) void act("/api/chat/team", "PATCH", { userId: member.userId, capacity: value }, "Limite salvo.");
                          }}
                          className="h-9 w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                        />
                      </label>
                      <button type="button" title={member.paused ? "Retomar" : "Pausar"} aria-label={`${member.paused ? "Retomar" : "Pausar"} ${member.name}`} onClick={() => void act("/api/chat/team", "PATCH", { userId: member.userId, paused: !member.paused })} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                        {member.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </button>
                      <button type="button" title="Remover da fila" aria-label={`Remover ${member.name} da fila`} onClick={() => void act(`/api/chat/queues/${queue.id}/members?userId=${encodeURIComponent(member.userId)}`, "DELETE")} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10"><UserMinus className="h-4 w-4" /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {adding && <AddMembersDialog queueName={queue.name} candidates={candidates} onClose={() => setAdding(false)} onAdd={addMembers} />}

      {archiving && (
        <EntityDialog titleId="archive-queue-title" title={`Arquivar ${queue.name}?`} description="A fila deixa de receber conversas. Só é possível arquivar sem conversas abertas." onClose={() => setArchiving(false)}>
          <div className="mt-auto flex justify-end gap-2">
            <button type="button" onClick={() => setArchiving(false)} className="h-10 cursor-pointer rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button
              type="button"
              onClick={() => {
                setArchiving(false);
                setSelectedId(null);
                void act(`/api/chat/queues/${queue.id}`, "PATCH", { archived: true }, "Fila arquivada.");
              }}
              className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]"
            >
              Arquivar fila
            </button>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
