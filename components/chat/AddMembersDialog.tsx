"use client";
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { initials } from "@/lib/chat/format";
import type { QueueAgent } from "@/components/chat/QueueBoard";

type Props = {
  queueName: string;
  candidates: QueueAgent[];
  onClose: () => void;
  onAdd: (userIds: string[]) => Promise<void>;
};

export function AddMembersDialog({ queueName, candidates, onClose, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter((agent) => agent.name.toLowerCase().includes(term) || agent.email.toLowerCase().includes(term));
  }, [candidates, search]);

  const allVisibleSelected = visible.length > 0 && visible.every((agent) => selected.has(agent.id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleVisible = () =>
    setSelected((current) => {
      const next = new Set(current);
      visible.forEach((agent) => (allVisibleSelected ? next.delete(agent.id) : next.add(agent.id)));
      return next;
    });

  const submit = async () => {
    setSaving(true);
    await onAdd([...selected]);
    setSaving(false);
  };

  return (
    <EntityDialog titleId="add-members-title" title={`Adicionar pessoas a ${queueName}`} description="Selecione uma ou várias pessoas de uma vez." onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            aria-label="Buscar pessoa"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
          />
        </div>

        {visible.length > 0 && (
          <div className="flex shrink-0 items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{visible.length} {visible.length === 1 ? "pessoa disponível" : "pessoas disponíveis"}</span>
            <button type="button" onClick={toggleVisible} className="cursor-pointer font-semibold text-[#002187] hover:underline dark:text-[#C4D600]">
              {allVisibleSelected ? "Limpar seleção" : "Selecionar todas"}
            </button>
          </div>
        )}

        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {visible.length === 0 ? (
            <li className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {candidates.length === 0 ? "Todas as pessoas cadastradas já estão nesta fila." : "Ninguém encontrado com essa busca."}
            </li>
          ) : visible.map((agent) => {
            const checked = selected.has(agent.id);
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(agent.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${checked ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5"}`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${checked ? "border-[#002187] bg-[#002187] text-white dark:border-[#C4D600] dark:bg-[#C4D600] dark:text-[#051647]" : "border-slate-300 dark:border-slate-600"}`}>
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#051647] text-xs font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{initials(agent.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{agent.name}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{agent.email}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
                    {agent.hasChatAccess ? `${agent.open}/${agent.capacity} conversas` : <span className="font-medium text-[#b4531f] dark:text-[#F7915E]">Sem acesso ao Atendimento</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
          <button type="button" onClick={() => void submit()} disabled={selected.size === 0 || saving} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">
            {saving ? "Adicionando..." : selected.size > 0 ? `Adicionar ${selected.size}` : "Adicionar"}
          </button>
        </div>
      </div>
    </EntityDialog>
  );
}
