"use client";
import { useCallback, useEffect, useState } from "react";
import { Lock, MessageSquareText, Pencil, Plus, Search, Trash2, Users, Zap } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormSelect } from "@/components/FormSelect";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { QuickReplyDialog } from "@/components/chat/QuickReplyDialog";
import { matchesQuickReply, type QuickReply } from "@/lib/chat/quick-replies";

const ALL = "Todas as categorias";
const NONE = "Sem categoria";
const SCOPES = ["Todas", "Da equipe", "Minhas"] as const;

/** Gestão de respostas rápidas: busca, filtro por categoria e visibilidade, criar, editar e excluir. */
export function QuickRepliesPanel({ queues }: { queues?: { id: string; name: string }[] }) {
  const toast = useToast();
  const [items, setItems] = useState<QuickReply[] | null>(null);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("Todas");
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);
  const [deleting, setDeleting] = useState<QuickReply | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/chat/quick-replies", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setFailed(true);
      return;
    }
    const result = (await response.json()) as { data: QuickReply[]; canManageTeam?: boolean };
    setItems(result.data);
    setCanManageTeam(!!result.canManageTeam);
    setFailed(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const remove = async () => {
    if (!deleting) return;
    const response = await fetch(`/api/chat/quick-replies?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { error?: string } | null;
    if (!response?.ok) {
      toast.error("Não foi possível excluir", result?.error);
      return;
    }
    toast.success("Resposta rápida excluída", deleting.title);
    setDeleting(null);
    await load();
  };

  const categories = [ALL, ...[...new Set((items ?? []).map((item) => item.category || NONE))].sort((a, b) => a.localeCompare(b, "pt-BR"))];
  const visible = (items ?? []).filter((item) =>
    matchesQuickReply(item, search)
    && (category === ALL || (item.category || NONE) === category)
    && (scope === "Todas" || (scope === "Da equipe" ? item.isGlobal : !item.isGlobal)));
  const canEdit = (item: QuickReply) => (item.isGlobal ? canManageTeam : item.mine);
  const queueName = (id: string | null) => (id ? queues?.find((queue) => queue.id === id)?.name ?? "Fila específica" : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-56 flex-1 space-y-1.5">
          <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Buscar</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Atalho, título ou texto" aria-label="Buscar respostas rápidas" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" />
          </span>
        </label>
        <div className="w-56"><FormSelect label="Categoria" value={category} options={categories} onChange={setCategory} /></div>
        <div role="radiogroup" aria-label="Visibilidade" className="inline-flex h-10 items-center rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {SCOPES.map((item) => (
            <button key={item} type="button" role="radio" aria-checked={scope === item} onClick={() => setScope(item)} className={`h-8 cursor-pointer rounded-md px-2.5 text-xs font-semibold transition ${scope === item ? "bg-white text-[#051647] shadow-sm dark:bg-[#051647] dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>{item}</button>
          ))}
        </div>
        <button type="button" onClick={() => setEditing("new")} className="ml-auto inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
          <Plus className="h-4 w-4" /> Nova resposta rápida
        </button>
      </div>

      {failed && <p role="alert" className="text-sm text-[#9a3d12] dark:text-[#F7915E]">Não foi possível carregar as respostas rápidas.</p>}
      {!items && !failed && <LoadingSpinner label="Carregando respostas..." className="w-full justify-center py-10" />}
      {items && visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
          <MessageSquareText className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{items.length === 0 ? "Nenhuma resposta rápida cadastrada" : "Nenhuma resposta encontrada"}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{items.length === 0 ? "Crie textos padrão e use na conversa digitando / e o atalho." : "Mude a busca ou os filtros."}</p>
        </div>
      )}
      <div className="space-y-2">
        {visible.map((item) => (
          <div key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/80 dark:bg-[#07194f]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {item.shortcut && <span className="rounded-md bg-[#002187]/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#002187] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">/{item.shortcut}</span>}
                <p className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-xs text-slate-500 dark:text-slate-400">{item.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-white/10 dark:text-slate-300">{item.isGlobal ? <Users className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{item.isGlobal ? "Equipe" : "Só para mim"}</span>
                {item.category && <span className="rounded-full bg-[#C4D600]/20 px-2 py-0.5 text-[#051647] dark:text-[#C4D600]">{item.category}</span>}
                {queueName(item.queueId) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-white/10 dark:text-slate-300">{queueName(item.queueId)}</span>}
                {item.automatic && <span className="inline-flex items-center gap-1 rounded-full bg-[#F7915E]/15 px-2 py-0.5 text-[#9a3d12] dark:text-[#F7915E]"><Zap className="h-3 w-3" />Automática</span>}
              </div>
            </div>
            {canEdit(item) && (
              <div className="flex shrink-0 gap-1">
                <button type="button" title="Editar" aria-label={`Editar ${item.title}`} onClick={() => setEditing(item)} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                <button type="button" title="Excluir" aria-label={`Excluir ${item.title}`} onClick={() => setDeleting(item)} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800"><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <QuickReplyDialog
          initial={editing === "new" ? null : editing}
          canManageTeam={canManageTeam}
          queues={queues}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Excluir “${deleting.title}”?`}
          description={deleting.isGlobal ? "A resposta some para toda a equipe. Esta ação não pode ser desfeita." : "Esta ação não pode ser desfeita."}
          confirmLabel="Excluir resposta"
          variant="destructive"
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
