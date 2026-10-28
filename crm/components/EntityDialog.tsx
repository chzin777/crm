interface EntityDialogProps {
  titleId: string;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
  fixedHeight?: boolean;
}

export function EntityDialog({ titleId, title, description, onClose, children, size = "md", fixedHeight = false }: EntityDialogProps) {
  return (
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
        className={`flex w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#07194f] sm:p-6 ${fixedHeight ? "h-[min(40rem,92vh)]" : "max-h-[92vh]"} ${size === "lg" ? "max-w-3xl" : "max-w-xl"}`}
      >
        <header className="mb-5 flex shrink-0 items-start justify-between gap-4">
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
        </header>
        <div className={fixedHeight ? "relative min-h-0 flex-1" : "relative overflow-visible"}>{children}</div>
      </section>
    </div>
  );
}
