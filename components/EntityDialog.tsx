"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface EntityDialogProps {
  titleId: string;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "wizard" | "tabs" | "xl" | "2xl";
  fixedHeight?: boolean;
}

export function EntityDialog({ titleId, title, description, onClose, children, size = "md", fixedHeight = false }: EntityDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#051647]/55 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-[#07194f] 2xl:p-6 ${size === "sm" ? "max-w-md" : size === "wizard" ? "h-[560px] max-w-4xl" : size === "tabs" ? "h-[740px] max-w-2xl" : size === "xl" ? "h-[85vh] max-h-[85vh] w-[94vw] max-w-6xl" : size === "2xl" ? "h-[88vh] max-h-[88vh] w-[95vw] max-w-[1400px]" : `h-[min(640px,90vh)] ${size === "lg" ? "max-w-5xl" : "max-w-xl"}`}`}
      >
        <header className="mb-4 shrink-0 2xl:mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              title="Fechar"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="m18 6-12 12M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {children}
        </div>
      </section>
    </div>
  );

  if (!mounted) return null;
  return createPortal(dialog, document.body);
}
