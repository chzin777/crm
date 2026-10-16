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
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, title: string, description?: string) => {
    const dark = document.documentElement.classList.contains("dark");
    setToasts((current) => [...current, { id: ++nextToastId, kind, title, description, dark }]);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (title, description) => push("success", title, description),
    error: (title, description) => push("error", title, description),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && createPortal(
        <div className="pointer-events-none fixed bottom-6 right-4 z-[999999999] flex w-[356px] max-w-[calc(100vw-32px)] flex-col items-end sm:right-8">
          {toasts.map((toast) => (
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
                duration={4000}
                closeButton
                onClose={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              />
            </div>
          ))}
        </div>,
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
