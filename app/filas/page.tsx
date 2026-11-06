"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { BlockedPanel } from "@/components/chat/BlockedPanel";
import { MenuSettingsPanel } from "@/components/chat/MenuSettingsPanel";
import { QueueBoard, type QueueAgent, type QueueRecord } from "@/components/chat/QueueBoard";
import { QuickRepliesPanel } from "@/components/chat/QuickRepliesPanel";
import { TeamPanel } from "@/components/chat/TeamPanel";

type QueueForm = { name: string; description: string; color: string; hours: string; firstResponseSlaMin: number; order: number };

const emptyForm: QueueForm = { name: "", description: "", color: "#002187", hours: "", firstResponseSlaMin: 15, order: 0 };
const field = "h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
}

export default function FilasPage() {
  const toast = useToast();
  const [view, setView] = useState("queues");
  const [queues, setQueues] = useState<QueueRecord[] | null>(null);
  const [agents, setAgents] = useState<QueueAgent[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<QueueRecord | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    const [queueResponse, teamResponse] = await Promise.all([fetch("/api/chat/queues", { cache: "no-store" }), fetch("/api/chat/team", { cache: "no-store" })]);
    setQueues(queueResponse.ok ? ((await queueResponse.json()) as { data: QueueRecord[] }).data : []);
    setCanManage(teamResponse.ok);
    if (teamResponse.ok) setAgents(((await teamResponse.json()) as { data: QueueAgent[] }).data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (url: string, method: string, body?: unknown, success?: string) => {
    try {
      await send(url, method, body);
      if (success) toast.success(success);
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
      await load();
      return false;
    }
  };

  const openForm = (queue: QueueRecord | "new") => {
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
    ...(canManage ? [{ id: "team", label: "Equipe" }, { id: "replies", label: "Respostas prontas" }, { id: "menu", label: "Menu e avisos" }, { id: "blocked", label: "Bloqueados" }] : []),
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Filas de Atendimento</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Quem atende cada fila, carga da equipe e configuração do atendimento</p>
        </div>
        {canManage && view === "queues" && (
          <button type="button" onClick={() => openForm("new")} className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
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
      ) : view === "replies" ? (
        <QuickRepliesPanel queues={queues} />
      ) : view === "menu" ? (
        <MenuSettingsPanel queues={queues} agents={agents.filter((agent) => agent.hasChatAccess)} />
      ) : view === "blocked" ? (
        <BlockedPanel />
      ) : view === "queues" ? (
        queues.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma fila criada. Sem fila, as conversas ficam visíveis só para quem vê todas.</p>
        ) : (
          <QueueBoard queues={queues} agents={agents} canManage={canManage} onEdit={openForm} act={act} />
        )
      ) : (
        <TeamPanel agents={agents} queues={queues} act={act} />
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
