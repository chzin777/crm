import type { ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";

export type ManualChapter = { id: string; title: string; sections: { id: string; title: string }[] };

export function Chapter({ number, id, title, description, tags, children }: { number: number; id: string; title: string; description: string; tags: string[]; children: ReactNode }) {
  return (
    <section id={id} className="manual-chapter scroll-mt-24 rounded-2xl border border-[#e2e6ee] bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-[#07194f]/60">
      <header className="border-b border-[#e2e6ee] pb-5 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#002187] dark:text-[#C4D600]">Capítulo {number}</p>
        <h2 className="mt-1 text-2xl font-semibold text-[#051647] sm:text-3xl dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#051647]/5 px-2.5 py-0.5 text-[11px] font-medium text-[#002187] dark:bg-white/10 dark:text-[#C4D600]">#{tag}</span>
          ))}
        </div>
      </header>
      <div className="divide-y divide-[#e2e6ee] dark:divide-slate-800">{children}</div>
    </section>
  );
}

export function Sub({ id, number, title, children }: { id: string; number: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 space-y-3 py-6 text-[15px] leading-relaxed text-slate-700 last:pb-0 dark:text-slate-300">
      <h3 className="text-lg font-semibold text-[#051647] dark:text-white">
        <span className="mr-2 text-[#F7915E]">{number}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#051647] text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{index + 1}</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C4D600]" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e2e6ee] dark:border-slate-800">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-[#051647] text-white">
          <tr>{head.map((cell) => <th key={cell} className="px-3 py-2 font-semibold">{cell}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#e2e6ee] dark:divide-slate-800">
          {rows.map((row, index) => (
            <tr key={index} className="align-top odd:bg-[#f8f9fc] dark:odd:bg-white/5">
              {row.map((cell, cellIndex) => <td key={cellIndex} className={`px-3 py-2 ${cellIndex === 0 ? "font-medium text-[#051647] dark:text-white" : ""}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NOTE_STYLES = {
  info: { icon: Info, box: "border-[#002187]/30 bg-[#002187]/5 dark:bg-[#002187]/20", iconColor: "text-[#002187] dark:text-sky-300" },
  tip: { icon: Lightbulb, box: "border-[#C4D600]/60 bg-[#C4D600]/10", iconColor: "text-[#6f7a00] dark:text-[#C4D600]" },
  warn: { icon: TriangleAlert, box: "border-[#F7915E]/60 bg-[#F7915E]/10", iconColor: "text-[#c25a22] dark:text-[#F7915E]" },
};

export function Note({ kind = "info", children }: { kind?: keyof typeof NOTE_STYLES; children: ReactNode }) {
  const style = NOTE_STYLES[kind];
  const Icon = style.icon;
  return (
    <div className={`flex gap-3 rounded-xl border p-3.5 text-sm ${style.box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Simulação de conversa no WhatsApp, para mostrar o que o cliente recebe. */
export function WhatsApp({ lines }: { lines: { from: "cliente" | "empresa"; text: string }[] }) {
  return (
    <div className="space-y-1.5 rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]">
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
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((step, index) => (
        <span key={step} className="flex items-center gap-2">
          <span className="rounded-lg border border-[#e2e6ee] bg-[#f8f9fc] px-2.5 py-1 font-medium text-[#051647] dark:border-slate-700 dark:bg-white/5 dark:text-white">{step}</span>
          {index < steps.length - 1 && <span className="text-[#F7915E]">→</span>}
        </span>
      ))}
    </div>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-[#051647] dark:text-white">{children}</strong>;
