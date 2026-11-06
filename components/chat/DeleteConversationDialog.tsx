"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";

type Props = {
  conversation: { id: string; name: string };
  onClose: () => void;
  onDeleted: (id: string) => void;
};

export function DeleteConversationDialog({ conversation, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setDeleting(true);
    setError("");
    const response = await fetch(`/api/chat/conversations/${conversation.id}`, { method: "DELETE" }).catch(() => null);
    if (response?.ok) {
      onDeleted(conversation.id);
      return;
    }
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? "Não foi possível excluir a conversa.");
    setDeleting(false);
  };

  return (
    <EntityDialog
      titleId="delete-conversation-title"
      title="Excluir conversa"
      description={`Conversa com ${conversation.name}`}
      size="sm"
      onClose={() => {
        if (!deleting) onClose();
      }}
    >
      <p className="text-sm text-slate-700 dark:text-slate-200">
        Tem certeza de que deseja excluir esta conversa e todo o histórico de mensagens? Esta ação não pode ser desfeita.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} disabled={deleting} className="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10">
          Cancelar
        </button>
        <button type="button" onClick={() => void confirm()} disabled={deleting} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70">
          {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
          {deleting ? "Excluindo..." : "Sim, excluir conversa"}
        </button>
      </div>
    </EntityDialog>
  );
}
