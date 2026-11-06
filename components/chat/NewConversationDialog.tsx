"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { TemplatePicker, type TemplateChoice } from "@/components/chat/TemplatePicker";
import { formatPhone } from "@/lib/chat/phone";

type Contact = { id: string; nome: string; telefone: string };
type SearchResult = { term: string; contacts: Contact[]; failed: boolean };

const CONTACT_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

export function NewConversationDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const defaultContacts = useRef<Contact[] | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [needsTemplate, setNeedsTemplate] = useState(false);
  const [error, setError] = useState("");

  const term = search.trim();
  // O resultado guarda o termo que o originou: qualquer divergência com o input significa busca pendente.
  const isLoading = result?.term !== term;

  useEffect(() => {
    if (!term && defaultContacts.current) {
      setResult({ term, contacts: defaultContacts.current, failed: false });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: String(CONTACT_LIMIT), withPhone: "1" });
      if (term) params.set("q", term);
      fetch(`/api/contacts/search?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("search_failed");
          const { data } = (await response.json()) as { data: Contact[] };
          if (!term) defaultContacts.current = data;
          setResult({ term, contacts: data, failed: false });
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ term, contacts: [], failed: true });
        });
    }, term ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

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
    <EntityDialog titleId="new-conversation-title" title="Nova conversa" description="Selecione um contato ou busque pelo nome ou telefone." onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-1">
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
        {needsTemplate && selected ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{selected.nome} · {formatPhone(selected.telefone)}</p>
            <TemplatePicker onSend={(template) => start(selected, template)} />
          </div>
        ) : (
          <>
            <div className="relative shrink-0">
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato..." aria-label="Buscar contato" aria-busy={isLoading} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-10 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
              {isLoading ? (
                <LoaderCircle aria-hidden="true" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#002187] dark:text-[#C4D600]" />
              ) : (
                <Search aria-hidden="true" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {isLoading ? (
                <div className="flex flex-1 items-center justify-center"><LoadingSpinner label="Carregando contatos..." size={32} /></div>
              ) : result.failed ? (
                <p role="alert" className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Não foi possível carregar os contatos.</p>
              ) : result.contacts.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{term ? `Nenhum contato encontrado para '${term}'` : "Nenhum contato com telefone cadastrado."}</p>
              ) : (
                result.contacts.map((contact) => (
                  <button key={contact.id} type="button" onClick={() => void start(contact)} className="shrink-0 cursor-pointer rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{contact.nome}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{formatPhone(contact.telefone)}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </EntityDialog>
  );
}
