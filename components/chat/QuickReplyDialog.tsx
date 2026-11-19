"use client";

import { useRef, useState } from "react";
import { Lock, Users } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { FormSelect } from "@/components/FormSelect";
import { useToast } from "@/components/ToastProvider";
import { TEXT_VARIABLES } from "@/lib/chat/text";
import { normalizeShortcut, QUICK_REPLY_CATEGORIES, QUICK_REPLY_MAX, type QuickReply } from "@/lib/chat/quick-replies";

const NO_CATEGORY = "Sem categoria";
const ALL_QUEUES = "Todas as filas";
const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#002187] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const label = "mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300";
const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);

/**
 * Modal de criar/editar resposta rápida (usado no /chat, em /respostas-rapidas e em /filas).
 * Fila, resposta automática, gatilhos e variações aparecem só para respostas da equipe e para quem gerencia filas.
 */
export function QuickReplyDialog({
  initial,
  canManageTeam,
  queues,
  onSaved,
  onClose,
}: {
  initial?: QuickReply | null;
  canManageTeam: boolean;
  queues?: { id: string; name: string }[];
  onSaved: (item: QuickReply) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [shortcut, setShortcut] = useState(initial?.shortcut ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [isGlobal, setIsGlobal] = useState(initial ? initial.isGlobal : canManageTeam);
  const [queueId, setQueueId] = useState(initial?.queueId ?? "");
  const [automatic, setAutomatic] = useState(initial?.automatic ?? false);
  const [triggers, setTriggers] = useState((initial?.triggers ?? []).join("\n"));
  const [variations, setVariations] = useState((initial?.variations ?? []).join("\n"));
  const [saving, setSaving] = useState(false);

  const lockedTeam = !!initial?.isGlobal && !canManageTeam;
  const categories = [NO_CATEGORY, ...QUICK_REPLY_CATEGORIES, ...(category && !(QUICK_REPLY_CATEGORIES as readonly string[]).includes(category) ? [category] : [])];
  const valid = title.trim() && text.trim() && text.length <= QUICK_REPLY_MAX;

  const insertVariable = (mark: string) => {
    const box = textRef.current;
    const start = box?.selectionStart ?? text.length;
    const end = box?.selectionEnd ?? text.length;
    setText(`${text.slice(0, start)}${mark}${text.slice(end)}`);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + mark.length, start + mark.length);
    });
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const payload = {
      ...(initial ? { id: initial.id } : {}),
      title: title.trim(),
      text: text.trim(),
      shortcut: normalizeShortcut(shortcut),
      category: category || null,
      isGlobal,
      automatic: isGlobal && automatic,
      triggers: isGlobal && automatic ? lines(triggers) : [],
      variations: isGlobal && automatic ? lines(variations) : [],
      queueId: isGlobal ? queueId || null : null,
    };
    try {
      const response = await fetch("/api/chat/quick-replies", { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json().catch(() => ({}))) as { data?: QuickReply; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error || "Não foi possível salvar a resposta.");
      toast.success(initial ? "Resposta rápida atualizada" : "Resposta rápida criada", result.data.shortcut ? `Use /${result.data.shortcut} na conversa.` : undefined);
      onSaved(result.data);
    } catch (error) {
      toast.error("Não foi possível salvar", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityDialog titleId="quick-reply-dialog" title={initial ? "Editar resposta rápida" : "Nova resposta rápida"} description="Digite / seguido do atalho na conversa para usar." onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <label htmlFor="qr-shortcut" className={label}>Atalho</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">/</span>
              <input id="qr-shortcut" value={shortcut.replace(/^\/+/, "")} onChange={(event) => setShortcut(event.target.value)} onBlur={() => setShortcut(normalizeShortcut(shortcut))} placeholder="pix" disabled={lockedTeam} className={`${field} pl-6 font-mono`} />
            </div>
          </div>
          <div>
            <label htmlFor="qr-title" className={label}>Título *</label>
            <input id="qr-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Dados para pagamento via Pix" maxLength={120} disabled={lockedTeam} className={field} />
          </div>
        </div>

        <FormSelect label="Categoria" value={category || NO_CATEGORY} options={categories} onChange={(value) => setCategory(value === NO_CATEGORY ? "" : value)} />

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor="qr-text" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Mensagem *</label>
            <span className={`text-[11px] tabular-nums ${text.length > QUICK_REPLY_MAX ? "font-semibold text-red-600" : "text-slate-400"}`}>{text.length.toLocaleString("pt-BR")}/{QUICK_REPLY_MAX.toLocaleString("pt-BR")}</span>
          </div>
          <textarea id="qr-text" ref={textRef} rows={5} value={text} onChange={(event) => setText(event.target.value)} disabled={lockedTeam} placeholder="Olá {cliente}! Segue a chave Pix..." className={`${field} resize-y`} />
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Inserir variável">
            {TEXT_VARIABLES.map((variable) => (
              <button key={variable.mark} type="button" disabled={lockedTeam} onClick={() => insertVariable(variable.mark)} title={variable.description} className="cursor-pointer rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600 transition hover:border-[#002187] hover:text-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600]">
                {variable.mark}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className={label}>Visibilidade</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([[true, "Toda a equipe", "Todos os atendentes veem e usam", Users], [false, "Apenas para mim", "Só você vê esta resposta", Lock]] as const).map(([value, name, hint, Icon]) => {
              const disabled = value ? !canManageTeam : lockedTeam;
              const selected = isGlobal === value;
              return (
                <button key={name} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => setIsGlobal(value)} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-[#002187] bg-[#002187]/5 dark:border-[#C4D600] dark:bg-[#C4D600]/10" : "border-slate-200 hover:border-slate-300 dark:border-slate-700"}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                  <span><span className="block text-sm font-semibold text-slate-900 dark:text-white">{name}</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span></span>
                </button>
              );
            })}
          </div>
          {!canManageTeam && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{lockedTeam ? "Resposta da equipe: só quem gerencia filas pode alterá-la." : "Respostas da equipe são criadas por quem gerencia filas."}</p>}
        </fieldset>

        {isGlobal && canManageTeam && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            {queues && (
              <FormSelect label="Fila" value={queues.find((queue) => queue.id === queueId)?.name ?? ALL_QUEUES} options={[ALL_QUEUES, ...queues.map((queue) => queue.name)]} onChange={(name) => setQueueId(queues.find((queue) => queue.name === name)?.id ?? "")} />
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} className="cursor-pointer" />Responder automaticamente</label>
            {automatic && (
              <>
                <div><label htmlFor="qr-triggers" className={label}>Gatilhos, um por linha (vazio = saudação)</label><textarea id="qr-triggers" rows={3} value={triggers} onChange={(event) => setTriggers(event.target.value)} className={`${field} resize-none`} /></div>
                <div><label htmlFor="qr-variations" className={label}>Variações do texto, uma por linha</label><textarea id="qr-variations" rows={3} value={variations} onChange={(event) => setVariations(event.target.value)} className={`${field} resize-none`} /></div>
              </>
            )}
          </div>
        )}
      </div>
      <footer className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
        <button type="button" onClick={() => void save()} disabled={!valid || saving || lockedTeam} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#C4D600] dark:text-[#051647]">
          {saving ? "Salvando..." : "Salvar resposta"}
        </button>
      </footer>
    </EntityDialog>
  );
}
