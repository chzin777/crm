"use client";

import { useState } from "react";
import { Info, Loader2, Trash2 } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";
import { eligibleForEveryone, PROVIDER_SUPPORTS_REVOKE, REVOKE_UNSUPPORTED_MESSAGE } from "@/lib/chat/message-delete";
import type { ChatMessageItem } from "@/lib/chat/types";

/** Confirmação de "Apagar mensagem": para mim (só no CRM) ou para todos (no WhatsApp do cliente, quando o provedor permite). */
export function DeleteMessageDialog({ message, onDeleted, onClose }: { message: ChatMessageItem; onDeleted: (message: ChatMessageItem) => void; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"me" | "everyone" | null>(null);
  const eligible = eligibleForEveryone(message);
  const preview = message.text || (message.attachment ? `[${message.attachment.name}]` : "");

  const remove = async (scope: "me" | "everyone") => {
    setBusy(scope);
    const response = await fetch(`/api/chat/messages/${encodeURIComponent(message.id)}?scope=${scope}`, { method: "DELETE" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as (ChatMessageItem & { error?: string }) | null;
    setBusy(null);
    if (!response?.ok || !body) {
      toast.error("Não foi possível apagar a mensagem", body?.error ?? "Verifique a conexão e tente novamente.");
      return;
    }
    toast.success(scope === "everyone" ? "Mensagem apagada para todos" : "Mensagem apagada", scope === "everyone" ? "Ela também foi removida do WhatsApp do cliente." : "Removida do histórico do CRM. O cliente continua vendo no WhatsApp.");
    onDeleted(body);
  };

  return (
    <EntityDialog titleId="delete-message-title" title="Apagar mensagem?" description="Escolha como a mensagem será apagada." onClose={onClose} size="sm">
      <div className="space-y-4">
        {preview && <p className="line-clamp-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{preview}</p>}
        {eligible && (
          PROVIDER_SUPPORTS_REVOKE ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">“Apagar para todos” remove a mensagem também do WhatsApp do cliente.</p>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border border-[#F7915E]/40 bg-[#F7915E]/10 px-3 py-2 text-xs text-[#9a3d12] dark:text-[#F7915E]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{REVOKE_UNSUPPORTED_MESSAGE}
            </p>
          )
        )}
        <div className="flex flex-col gap-2">
          {eligible && (
            <button type="button" disabled={!PROVIDER_SUPPORTS_REVOKE || busy !== null} onClick={() => void remove("everyone")} className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">
              {busy === "everyone" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Apagar para todos
            </button>
          )}
          <button type="button" disabled={busy !== null} onClick={() => void remove("me")} className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30">
            {busy === "me" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Apagar para mim
          </button>
          <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">“Apagar para mim” remove do histórico do CRM para toda a equipe; o cliente continua vendo a mensagem no WhatsApp.</p>
      </div>
    </EntityDialog>
  );
}
