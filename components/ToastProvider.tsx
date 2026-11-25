"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import SwipeToast from "@/components/SwipeToast";

type ToastKind = "success" | "error";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  dark: boolean;
  action?: ToastAction;
  options?: ToastOptions;
}

/** Onde e por quanto tempo o aviso aparece (padrão: canto inferior direito, 4 s). */
export interface ToastOptions {
  position?: "top" | "bottom";
  duration?: number;
}

/** Botão no aviso (ex.: Desfazer). `onExpire` roda quando o aviso some sem o clique no botão. */
export interface ToastAction {
  label: string;
  onAction: () => void;
  onExpire?: () => void;
  duration?: number;
}

interface ToastApi {
  success: (title: string, description?: string, options?: ToastOptions) => void;
  error: (title: string, description?: string, options?: ToastOptions) => void;
  withAction: (title: string, description: string | undefined, action: ToastAction) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextToastId = 0;

/** Pilha inferior direita (padrão) e pilha no topo, centralizada (ex.: nova venda em /vendas/ao-vivo). */
const STACKS = {
  bottom: "pointer-events-none fixed bottom-6 right-4 z-[999999999] flex w-[356px] max-w-[calc(100vw-32px)] flex-col items-end sm:right-8",
  top: "pointer-events-none fixed inset-x-0 top-3 z-[999999999] mx-auto flex w-[380px] max-w-[calc(100vw-24px)] flex-col items-center gap-2 pt-[env(safe-area-inset-top)]",
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, title: string, description?: string, action?: ToastAction, options?: ToastOptions) => {
    const dark = document.documentElement.classList.contains("dark");
    setToasts((current) => [...current, { id: ++nextToastId, kind, title, description, dark, action, options }]);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (title, description, options) => push("success", title, description, undefined, options),
    error: (title, description, options) => push("error", title, description, undefined, options),
    withAction: (title, description, action) => push("success", title, description, action),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && createPortal(
        <>
        {(["bottom", "top"] as const).map((position) => {
          const stack = toasts.filter((toast) => (toast.options?.position ?? "bottom") === position);
          return stack.length === 0 ? null : (
        <div key={position} className={STACKS[position]}>
          {stack.map((toast) => (
            <div key={toast.id} className="pointer-events-auto w-full rounded-xl shadow-lg ring-1 ring-slate-200 dark:ring-white/10">
              <SwipeToast
                inline
                title={toast.title}
                description={toast.description}
                background={
                  toast.dark
                    ? toast.kind === "error" ? "#7f1d1d" : "#051647"
                    : toast.kind === "error" ? "#fef2f2" : "#ffffff"
                }
                color={toast.dark ? "#ffffff" : toast.kind === "error" ? "#7f1d1d" : "#051647"}
                fuseColor={toast.kind === "error" ? "#F7915E" : "#C4D600"}
                duration={toast.action?.duration ?? toast.options?.duration ?? 4000}
                closeButton
                actionLabel={toast.action?.label}
                onAction={toast.action?.onAction}
                onClose={(reason) => {
                  if (reason !== "action") toast.action?.onExpire?.();
                  setToasts((current) => current.filter((item) => item.id !== toast.id));
                }}
              />
            </div>
          ))}
        </div>
          );
        })}
        </>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast deve ser usado dentro de ToastProvider.");
  return context;
}
