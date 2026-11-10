"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";

type Props = {
  conversation: { id: string; name: string };
  onClose: () => void;
  onDeleted: (id: string) => void;
};

type DeleteReason = "outro" | "nao_resposta_campanha";

const REASONS: { value: DeleteReason; label: string; hint: string }[] = [
  { value: "outro", label: "Outro motivo", hint: "Só apaga a conversa e o histórico." },
  {
    value: "nao_resposta_campanha",
    label: "Não é resposta da campanha",
    hint: "Ex.: robô ou resposta automática. Também tira a resposta das métricas da campanha e impede que novas mensagens desse contato sejam marcadas como resposta a ela.",
  },
];

export function DeleteConversationDialog({ conversation, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState<DeleteReason>("outro");

  const confirm = async () => {
    setDeleting(true);
    setError("");
    const query = reason === "nao_resposta_campanha" ? "?motivo=nao_resposta_campanha" : "";
    const response = await fetch(`/api/chat/conversations/${conversation.id}${query}`, { method: "DELETE" }).catch(() => null);
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
      <fieldset className="mt-4 space-y-2" disabled={deleting}>
        <legend className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Motivo da exclusão</legend>
        {REASONS.map((item) => (
          <label
            key={item.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${reason === item.value ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5"}`}
          >
            <input
              type="radio"
              name="delete-reason"
              value={item.value}
              checked={reason === item.value}
              onChange={() => setReason(item.value)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#002187] dark:accent-[#C4D600]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{item.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{item.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
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
