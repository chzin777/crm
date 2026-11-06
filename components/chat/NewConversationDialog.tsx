"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { TemplatePicker, type TemplateChoice } from "@/components/chat/TemplatePicker";
import { formatPhone } from "@/lib/chat/phone";

type Contact = { id: string; nome: string; telefone: string };

export function NewConversationDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [needsTemplate, setNeedsTemplate] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setContacts([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/contacts/search?q=${encodeURIComponent(term)}&limit=20`, { signal: controller.signal })
        .then(async (response) => {
          if (response.ok) setContacts(((await response.json()) as { data: Contact[] }).data.filter((contact) => contact.telefone));
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const start = async (contact: Contact, template?: TemplateChoice) => {
    setError("");
    const response = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: contact.id, template }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { id?: string; error?: string; code?: string } | null;
    if (response?.ok && data?.id) return onOpened(data.id);
    if (data?.code === "window_closed") {
      setSelected(contact);
      setNeedsTemplate(true);
      return;
    }
    setError(data?.error ?? "Não foi possível iniciar a conversa.");
  };

  return (
    <EntityDialog titleId="new-conversation-title" title="Nova conversa" description="Busque o contato pelo nome ou telefone." onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1">
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
        {needsTemplate && selected ? (
          <>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{selected.nome} · {formatPhone(selected.telefone)}</p>
            <TemplatePicker onSend={(template) => start(selected, template)} />
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato..." aria-label="Buscar contato" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
            </div>
            {contacts.map((contact) => (
              <button key={contact.id} type="button" onClick={() => void start(contact)} className="cursor-pointer rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5">
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{contact.nome}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{formatPhone(contact.telefone)}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </EntityDialog>
  );
}
