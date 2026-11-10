"use client";

import { useState } from "react";
import { List } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import type { ChatInteractiveList } from "@/lib/chat/types";

/** Lista interativa da Meta como o cliente vê no WhatsApp: corpo, rodapé e o botão que abre as opções. */
export function InteractiveListBubble({ list, messageId }: { list: ChatInteractiveList; messageId: string }) {
  const [open, setOpen] = useState(false);
  const rowCount = list.sections.reduce((total, section) => total + section.rows.length, 0);

  return (
    <div className="min-w-[220px]">
      {list.header && <p className="mb-1 text-sm font-bold leading-snug">{list.header}</p>}
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{list.body}</p>
      {list.footer && <p className="mt-1 text-xs opacity-70">{list.footer}</p>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Ver as ${rowCount} opções que o cliente recebeu`}
        className="-mx-4 mt-2 flex w-[calc(100%+2rem)] cursor-pointer items-center justify-center gap-2 border-t border-current/20 px-4 pt-2 text-sm font-semibold transition-opacity hover:opacity-80"
      >
        <List className="h-4 w-4" />
        {list.button}
      </button>

      {open && (
        <EntityDialog
          titleId={`interactive-list-${messageId}`}
          title={list.button}
          description={`${rowCount} ${rowCount === 1 ? "opção enviada" : "opções enviadas"} ao cliente nesta lista`}
          size="sm"
          onClose={() => setOpen(false)}
        >
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {list.sections.map((section, sectionIndex) => (
              <section key={`${section.title ?? "secao"}-${sectionIndex}`}>
                {section.title && <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#002187] dark:text-[#C4D600]">{section.title}</h3>}
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                  {section.rows.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 dark:text-white">{row.title}</span>
                        {row.description && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{row.description}</span>}
                      </span>
                      <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
