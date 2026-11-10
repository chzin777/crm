"use client";

import { useState } from "react";
import { EntityDialog } from "@/components/EntityDialog";

type Props = {
  conversation: { id: string; name: string };
  onClose: () => void;
  /** A exclusão de fato fica com quem chama: ela só vai ao servidor depois do prazo para desfazer. */
  onConfirm: (id: string, reason: DeleteReason) => void;
};

export type DeleteReason = "outro" | "nao_resposta_campanha";

/** Exclusão definitiva no servidor. `keepalive` deixa terminar mesmo se a aba for fechada. */
export async function deleteConversation(id: string, reason: DeleteReason) {
  const query = reason === "nao_resposta_campanha" ? "?motivo=nao_resposta_campanha" : "";
  const response = await fetch(`/api/chat/conversations/${id}${query}`, { method: "DELETE", keepalive: true }).catch(() => null);
  if (response?.ok) return null;
  const data = (await response?.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Não foi possível excluir a conversa.";
}

const REASONS: { value: DeleteReason; label: string; hint: string }[] = [
  { value: "outro", label: "Outro motivo", hint: "Só apaga a conversa e o histórico." },
  {
    value: "nao_resposta_campanha",
    label: "Não é resposta da campanha",
    hint: "Ex.: robô ou resposta automática. Também tira a resposta das métricas da campanha e impede que novas mensagens desse contato sejam marcadas como resposta a ela.",
  },
];

export function DeleteConversationDialog({ conversation, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<DeleteReason>("outro");

  return (
    <EntityDialog
      titleId="delete-conversation-title"
      title="Excluir conversa"
      description={`Conversa com ${conversation.name}`}
      size="sm"
      onClose={onClose}
    >
      <p className="text-sm text-slate-700 dark:text-slate-200">
        Tem certeza de que deseja excluir esta conversa e todo o histórico de mensagens? Você terá alguns segundos para desfazer no aviso que aparece embaixo.
      </p>
      <fieldset className="mt-4 space-y-2">
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
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10">
          Cancelar
        </button>
        <button type="button" onClick={() => onConfirm(conversation.id, reason)} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
          Sim, excluir conversa
        </button>
      </div>
    </EntityDialog>
  );
}
