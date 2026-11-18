"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** destructive: botão vermelho e ícone de alerta (excluir, restaurar, descartar). */
  variant?: "default" | "destructive";
  /** Ação confirmada; enquanto a promessa roda, o modal mostra o carregamento e não fecha. */
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

/** Confirmação padrão do CRM (no lugar de window.confirm), no mesmo modal das demais telas. */
export function ConfirmDialog({ title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar", variant = "default", onConfirm, onClose }: ConfirmDialogProps) {
  const [running, setRunning] = useState(false);
  const destructive = variant === "destructive";

  const confirm = async () => {
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      setRunning(false);
    }
  };

  return (
    <EntityDialog
      titleId="confirm-dialog"
      title={title}
      description={description}
      onClose={running ? () => undefined : onClose}
      size="sm"
      header={
        <div className="flex items-start gap-3">
          {destructive && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"><AlertTriangle className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900 dark:text-white">{title}</p>
            <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
      }
    >
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" disabled={running} onClick={onClose} className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
          {cancelLabel}
        </button>
        <button
          type="button"
          autoFocus
          disabled={running}
          onClick={() => void confirm()}
          className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${destructive ? "bg-red-600 hover:bg-red-700" : "bg-[#002187] hover:brightness-110"}`}
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{confirmLabel}
        </button>
      </div>
    </EntityDialog>
  );
}
