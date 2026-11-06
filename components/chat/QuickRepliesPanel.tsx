"use client";
import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";
import { TEXT_VARIABLES } from "@/lib/chat/text";

type QuickReply = { id: string; title: string; text: string; shortcut: string; automatic: boolean; triggers: string[]; variations: string[]; queueId: string | null };
type Form = { id?: string; title: string; text: string; shortcut: string; automatic: boolean; triggers: string; variations: string; queueId: string };

const emptyForm: Form = { title: "", text: "", shortcut: "", automatic: false, triggers: "", variations: "", queueId: "" };
const field = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const label = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";
const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);

export function QuickRepliesPanel({ queues }: { queues: { id: string; name: string }[] }) {
  const toast = useToast();
  const [items, setItems] = useState<QuickReply[]>([]);
  const [form, setForm] = useState<Form | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/chat/quick-replies", { cache: "no-store" });
    if (response.ok) setItems(((await response.json()) as { data: QuickReply[] }).data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form) return;
    const response = await fetch("/api/chat/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, triggers: lines(form.triggers), variations: lines(form.variations), queueId: form.queueId || null }),
    });
    if (!response.ok) {
      toast.error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
      return;
    }
    setForm(null);
    await load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/chat/quick-replies?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <button type="button" onClick={() => setForm(emptyForm)} className="mb-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
        <Plus className="h-4 w-4" /> Nova resposta
      </button>
      <div className="space-y-2">
        {items.length === 0 && <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma resposta pronta.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/80 dark:bg-[#07194f]">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}{item.shortcut ? ` · /${item.shortcut}` : ""}{item.automatic ? " · automática" : ""}</p>
              <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{item.text}</p>
            </div>
            <button type="button" title="Editar" aria-label={`Editar ${item.title}`} onClick={() => setForm({ ...item, queueId: item.queueId ?? "", triggers: item.triggers.join("\n"), variations: item.variations.join("\n") })} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
            <button type="button" title="Excluir" aria-label={`Excluir ${item.title}`} onClick={() => void remove(item.id)} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {form && (
        <EntityDialog titleId="quick-reply-title" title={form.id ? "Editar resposta" : "Nova resposta"} description={`Variáveis: ${TEXT_VARIABLES.map((item) => item.mark).join(", ")}`} onClose={() => setForm(null)}>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1">
            <div><label htmlFor="qr-title" className={label}>Título</label><input id="qr-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={field} /></div>
            <div><label htmlFor="qr-text" className={label}>Texto</label><textarea id="qr-text" rows={4} value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} className={`${field} resize-none`} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="qr-shortcut" className={label}>Atalho</label><input id="qr-shortcut" value={form.shortcut} onChange={(event) => setForm({ ...form, shortcut: event.target.value })} className={field} /></div>
              <div>
                <label htmlFor="qr-queue" className={label}>Fila</label>
                <select id="qr-queue" value={form.queueId} onChange={(event) => setForm({ ...form, queueId: event.target.value })} className={`${field} cursor-pointer`}>
                  <option value="">Todas</option>
                  {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                </select>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={form.automatic} onChange={(event) => setForm({ ...form, automatic: event.target.checked })} className="cursor-pointer" />Responder automaticamente</label>
            {form.automatic && (
              <>
                <div><label htmlFor="qr-triggers" className={label}>Gatilhos, um por linha (vazio = saudação)</label><textarea id="qr-triggers" rows={3} value={form.triggers} onChange={(event) => setForm({ ...form, triggers: event.target.value })} className={`${field} resize-none`} /></div>
                <div><label htmlFor="qr-variations" className={label}>Variações do texto, uma por linha</label><textarea id="qr-variations" rows={3} value={form.variations} onChange={(event) => setForm({ ...form, variations: event.target.value })} className={`${field} resize-none`} /></div>
              </>
            )}
            <div className="mt-auto flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="h-10 cursor-pointer rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
              <button type="button" onClick={() => void save()} disabled={!form.title.trim() || !form.text.trim()} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">Salvar</button>
            </div>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
