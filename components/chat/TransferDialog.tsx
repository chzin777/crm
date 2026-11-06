"use client";
import { useEffect, useState } from "react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type Member = { userId: string; name: string; online: boolean; open: number; capacity: number; paused: boolean };
type Queue = { id: string; name: string; members: Member[] };

export function TransferDialog({ conversationId, currentQueueId, onClose, onDone }: { conversationId: string; currentQueueId: string | null; onClose: () => void; onDone: () => void }) {
  const [queues, setQueues] = useState<Queue[] | null>(null);
  const [queueId, setQueueId] = useState(currentQueueId ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/chat/queues")
      .then(async (response) => {
        const data = (await response.json()) as { data?: Queue[]; error?: string };
        if (!active) return;
        if (!response.ok) setError(data.error ?? "Não foi possível carregar as filas.");
        setQueues(data.data ?? []);
      })
      .catch(() => {
        if (active) {
          setError("Não foi possível carregar as filas.");
          setQueues([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/chat/conversations/${conversationId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId, assigneeId: assigneeId || undefined, reason }),
    }).catch(() => null);
    if (response?.ok) return onDone();
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? "Não foi possível transferir.");
    setSaving(false);
  };

  const members = queues?.find((queue) => queue.id === queueId)?.members ?? [];
  const field = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
  const label = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";

  return (
    <EntityDialog titleId="transfer-title" title="Transferir conversa" description="O histórico vai junto com a conversa." onClose={onClose}>
      {!queues ? (
        <div className="flex flex-1 items-center justify-center"><LoadingSpinner label="Carregando filas..." size={32} /></div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
          <div>
            <label htmlFor="transfer-queue" className={label}>Fila</label>
            <select id="transfer-queue" value={queueId} onChange={(event) => { setQueueId(event.target.value); setAssigneeId(""); }} className={`${field} h-10 cursor-pointer`}>
              <option value="">Selecione</option>
              {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="transfer-person" className={label}>Pessoa (opcional)</label>
            <select id="transfer-person" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className={`${field} h-10 cursor-pointer`}>
              <option value="">Deixar na fila</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId} disabled={member.paused}>
                  {member.name} · {member.open}/{member.capacity}{member.online ? " · online" : ""}{member.paused ? " · pausada" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="transfer-reason" className={label}>Motivo</label>
            <textarea id="transfer-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className={`${field} resize-none py-2`} />
          </div>
          <div className="mt-auto flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button type="button" onClick={() => void submit()} disabled={!queueId || saving} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">
              {saving ? "Transferindo..." : "Transferir"}
            </button>
          </div>
        </div>
      )}
    </EntityDialog>
  );
}
