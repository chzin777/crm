import type { ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";

export type ManualChapter = { id: string; title: string; sections: { id: string; title: string }[] };

/**
 * Capítulo do guia: título editorial, sem card nem moldura. `tags` fica só para busca (não é exibido),
 * para manter a leitura limpa.
 */
export function Chapter({ number, id, title, description, tags, children }: { number: number; id: string; title: string; description: string; tags: string[]; children: ReactNode }) {
  return (
    <section id={id} data-tags={tags.join(" ")} className="manual-chapter scroll-mt-24 border-t border-slate-200 pt-12 first:border-t-0 first:pt-0 dark:border-slate-800">
      <header className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F7915E]">Capítulo {number}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#051647] sm:text-[28px] dark:text-white">{title}</h2>
        <p className="mt-2 text-base leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      </header>
      <div>{children}</div>
    </section>
  );
}

export function Sub({ id, number, title, children }: { id: string; number: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 space-y-4 pt-8 text-[15px] leading-7 text-slate-700 dark:text-slate-300">
      <h3 className="flex items-baseline gap-2.5 text-lg font-semibold text-[#051647] dark:text-white">
        <span className="text-sm font-medium tabular-nums text-slate-400 dark:text-slate-500">{number}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#051647]/20 text-xs font-semibold text-[#051647] dark:border-[#C4D600]/40 dark:text-[#C4D600]">{index + 1}</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C4D600]" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {head.map((cell) => <th key={cell} className="py-2.5 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{cell}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row, index) => (
            <tr key={index} className="align-top">
              {row.map((cell, cellIndex) => <td key={cellIndex} className={`py-3 pr-4 leading-6 ${cellIndex === 0 ? "font-medium text-[#051647] dark:text-white" : "text-slate-600 dark:text-slate-300"}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NOTE_STYLES = {
  info: { icon: Info, box: "border-[#002187]/40 bg-[#002187]/[0.04] dark:border-sky-400/40 dark:bg-white/[0.03]", iconColor: "text-[#002187] dark:text-sky-300" },
  tip: { icon: Lightbulb, box: "border-[#C4D600] bg-[#C4D600]/[0.08] dark:bg-[#C4D600]/[0.05]", iconColor: "text-[#6f7a00] dark:text-[#C4D600]" },
  warn: { icon: TriangleAlert, box: "border-[#F7915E] bg-[#F7915E]/[0.07]", iconColor: "text-[#c25a22] dark:text-[#F7915E]" },
};

/** Callout discreto: borda à esquerda e fundo leve. */
export function Note({ kind = "info", children }: { kind?: keyof typeof NOTE_STYLES; children: ReactNode }) {
  const style = NOTE_STYLES[kind];
  const Icon = style.icon;
  return (
    <div className={`flex gap-3 rounded-r-lg border-l-2 px-4 py-3 text-sm leading-6 ${style.box}`}>
      <Icon className={`mt-1 h-4 w-4 shrink-0 ${style.iconColor}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Simulação de conversa no WhatsApp, para mostrar o que o cliente recebe. */
export function WhatsApp({ lines }: { lines: { from: "cliente" | "empresa"; text: string }[] }) {
  return (
    <div className="max-w-md space-y-1.5 rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]">
      {lines.map((line, index) => (
        <div key={index} className={`flex ${line.from === "cliente" ? "justify-end" : "justify-start"}`}>
          <p className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-[13px] shadow-sm ${line.from === "cliente" ? "bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]" : "bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"}`}>{line.text}</p>
        </div>
      ))}
    </div>
  );
}

export function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {steps.map((step, index) => (
        <span key={step} className="flex items-center gap-2">
          <span className="font-medium text-[#051647] dark:text-white">{step}</span>
          {index < steps.length - 1 && <span className="text-slate-300 dark:text-slate-600">→</span>}
        </span>
      ))}
    </div>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-[#051647] dark:text-white">{children}</strong>;
