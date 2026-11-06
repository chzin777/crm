"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Pencil, Plus, UserMinus } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { waitingLabel } from "@/lib/chat/format";

type Member = { userId: string; name: string; online: boolean; open: number; capacity: number; paused: boolean };
type Queue = { id: string; name: string; description: string; color: string; hours: string; firstResponseSlaMin: number; order: number; waiting: number; oldestWaiting: string | null; members: Member[] };
type Agent = { id: string; name: string; email: string; capacity: number; paused: boolean; online: boolean; open: number; queueIds: string[] };
type QueueForm = { name: string; description: string; color: string; hours: string; firstResponseSlaMin: number; order: number };

const emptyForm: QueueForm = { name: "", description: "", color: "#002187", hours: "", firstResponseSlaMin: 15, order: 0 };
const field = "h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";
const card = "rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]";

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
}

export default function FilasPage() {
  const toast = useToast();
  const [view, setView] = useState("queues");
  const [queues, setQueues] = useState<Queue[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<Queue | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    const [queueResponse, teamResponse] = await Promise.all([fetch("/api/chat/queues", { cache: "no-store" }), fetch("/api/chat/team", { cache: "no-store" })]);
    setQueues(queueResponse.ok ? ((await queueResponse.json()) as { data: Queue[] }).data : []);
    setCanManage(teamResponse.ok);
    if (teamResponse.ok) setAgents(((await teamResponse.json()) as { data: Agent[] }).data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>, success?: string) => {
    try {
      await action();
      if (success) toast.success(success);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  const openForm = (queue: Queue | "new") => {
    setEditing(queue);
    setFormError("");
    setForm(queue === "new" ? emptyForm : { name: queue.name, description: queue.description, color: queue.color, hours: queue.hours, firstResponseSlaMin: queue.firstResponseSlaMin, order: queue.order });
  };

  const saveQueue = async () => {
    try {
      if (editing === "new") await send("/api/chat/queues", "POST", form);
      else if (editing) await send(`/api/chat/queues/${editing.id}`, "PATCH", form);
      setEditing(null);
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  const tabs = [
    { id: "queues", label: "Filas" },
    ...(canManage ? [{ id: "team", label: "Equipe" }] : []),
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Filas de Atendimento</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Quem atende cada fila, carga da equipe e configuração do atendimento</p>
        </div>
        {canManage && view === "queues" && (
          <button type="button" onClick={() => openForm("new")} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
            <Plus className="h-4 w-4" /> Nova fila
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setView(tab.id)} className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium ${view === tab.id ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {!queues ? (
        <div className="flex h-64 items-center justify-center"><LoadingSpinner label="Carregando filas..." /></div>
      ) : view === "queues" ? (
        queues.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma fila criada. Sem fila, as conversas ficam visíveis só para quem vê todas.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {queues.map((queue) => {
              const candidates = agents.filter((agent) => !agent.queueIds.includes(queue.id));
              return (
                <section key={queue.id} className={card}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: queue.color }} />
                        <span className="truncate">{queue.name}</span>
                      </h2>
                      {queue.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{queue.description}</p>}
                      <p className="mt-1 text-[10px] text-slate-400">{queue.hours || "Sem horário definido"} · 1ª resposta em {queue.firstResponseSlaMin} min</p>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" title="Editar fila" aria-label="Editar fila" onClick={() => openForm(queue)} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                        <button type="button" title="Arquivar fila" aria-label="Arquivar fila" onClick={() => void run(() => send(`/api/chat/queues/${queue.id}`, "PATCH", { archived: true }), "Fila arquivada.")} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><Archive className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                  <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Esperando", String(queue.waiting)],
                      ["Maior espera", queue.oldestWaiting ? waitingLabel(queue.oldestWaiting).text : "-"],
                      ["Online", `${queue.members.filter((member) => member.online).length}/${queue.members.length}`],
                    ].map(([name, value]) => (
                      <div key={name} className="rounded-lg bg-slate-50 p-2 dark:bg-white/5">
                        <dd className="text-base font-bold text-slate-900 dark:text-white">{value}</dd>
                        <dt className="text-[10px] text-slate-500 dark:text-slate-400">{name}</dt>
                      </div>
                    ))}
                  </dl>
                  <ul className="space-y-1.5">
                    {queue.members.map((member) => (
                      <li key={member.userId} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${member.online ? "bg-[#25D366]" : "bg-slate-300 dark:bg-slate-600"}`} title={member.online ? "Online" : "Offline"} />
                        <span className="min-w-0 flex-1 truncate">{member.name}{member.paused ? " (pausada)" : ""}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{member.open}/{member.capacity}</span>
                        {canManage && (
                          <button type="button" title="Remover da fila" aria-label={`Remover ${member.name} da fila`} onClick={() => void run(() => send(`/api/chat/queues/${queue.id}/members?userId=${encodeURIComponent(member.userId)}`, "DELETE"))} className="cursor-pointer rounded p-1 text-slate-400 hover:text-red-600"><UserMinus className="h-4 w-4" /></button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {canManage && candidates.length > 0 && (
                    <select
                      aria-label={`Adicionar pessoa à fila ${queue.name}`}
                      value=""
                      onChange={(event) => {
                        const userId = event.target.value;
                        if (userId) void run(() => send(`/api/chat/queues/${queue.id}/members`, "POST", { userId }));
                      }}
                      className={`${field} mt-3 h-9 cursor-pointer text-xs`}
                    >
                      <option value="">Adicionar pessoa...</option>
                      {candidates.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                    </select>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div key={agent.id} className={`${card} flex flex-wrap items-center gap-4 !p-4`}>
              <span className={`h-2.5 w-2.5 rounded-full ${agent.online ? "bg-[#25D366]" : "bg-slate-300 dark:bg-slate-600"}`} title={agent.online ? "Online" : "Offline"} />
              <div className="min-w-40 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{agent.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{agent.email}</p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">{agent.open} aberta(s)</span>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                Capacidade
                <input
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={agent.capacity}
                  key={`${agent.id}-${agent.capacity}`}
                  onBlur={(event) => {
                    const capacity = Number(event.target.value);
                    if (capacity !== agent.capacity) void run(() => send("/api/chat/team", "PATCH", { userId: agent.id, capacity }), "Capacidade salva.");
                  }}
                  className={`${field} h-9 w-20`}
                />
              </label>
              <button type="button" onClick={() => void run(() => send("/api/chat/team", "PATCH", { userId: agent.id, paused: !agent.paused }))} className={`h-9 cursor-pointer rounded-lg px-3 text-xs font-medium ${agent.paused ? "bg-[#F7915E]/20 text-[#b4531f] dark:text-[#F7915E]" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                {agent.paused ? "Pausada" : "Pausar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EntityDialog titleId="queue-dialog-title" title={editing === "new" ? "Nova fila" : `Editar: ${editing.name}`} description="Dados da fila de atendimento" onClose={() => setEditing(null)}>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1">
            {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{formError}</p>}
            <div><label htmlFor="queue-name" className={labelClass}>Nome</label><input id="queue-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={field} /></div>
            <div><label htmlFor="queue-description" className={labelClass}>Descrição</label><input id="queue-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={field} /></div>
            <div><label htmlFor="queue-hours" className={labelClass}>Horário</label><input id="queue-hours" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} placeholder="Seg a sex, 8h às 18h" className={field} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label htmlFor="queue-sla" className={labelClass}>1ª resposta (min)</label><input id="queue-sla" type="number" min={1} value={form.firstResponseSlaMin} onChange={(event) => setForm({ ...form, firstResponseSlaMin: Number(event.target.value) })} className={field} /></div>
              <div><label htmlFor="queue-order" className={labelClass}>Ordem</label><input id="queue-order" type="number" min={0} value={form.order} onChange={(event) => setForm({ ...form, order: Number(event.target.value) })} className={field} /></div>
              <div><label htmlFor="queue-color" className={labelClass}>Cor</label><input id="queue-color" type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className={`${field} cursor-pointer p-1`} /></div>
            </div>
            <div className="mt-auto flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="h-10 cursor-pointer rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
              <button type="button" onClick={() => void saveQueue()} disabled={!form.name.trim()} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">Salvar</button>
            </div>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
