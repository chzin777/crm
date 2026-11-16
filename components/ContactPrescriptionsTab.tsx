"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, BadgeCheck, Bot, ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";
import { doctorLine, isPrescriptionExpired, type PrescriptionItem, type PrescriptionTextField } from "@/lib/prescriptions";

const BUTTON = "inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const NEUTRAL = `${BUTTON} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5`;
const PRIMARY = `${BUTTON} bg-[#C4D600] text-[#051647] hover:opacity-90`;
const INPUT = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const EYE_COLUMNS: { key: "Esferico" | "Cilindrico" | "Eixo" | "Adicao" | "Dnp"; label: string }[] = [
  { key: "Esferico", label: "Esférico" },
  { key: "Cilindrico", label: "Cilíndrico" },
  { key: "Eixo", label: "Eixo" },
  { key: "Adicao", label: "Adição" },
  { key: "Dnp", label: "DNP" },
];
const LENS_TYPES = ["", "Visão simples", "Multifocal", "Bifocal", "Ocupacional"];

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);
const dateTime = (value: string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

type FormState = Record<PrescriptionTextField, string> & { dataReceita: string };
const EMPTY_FORM: FormState = {
  odEsferico: "", odCilindrico: "", odEixo: "", odAdicao: "", odDnp: "",
  oeEsferico: "", oeCilindrico: "", oeEixo: "", oeAdicao: "", oeDnp: "",
  dpTotal: "", tipoLenteSugerido: "", observacoes: "", medicoNome: "", medicoCrm: "", dataReceita: "",
};

function toForm(item: PrescriptionItem): FormState {
  const form = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
    if (key === "dataReceita") form.dataReceita = day(item.dataReceita) ?? "";
    else form[key] = item[key] ?? "";
  }
  return form;
}

/** Tabela óptica OD x OE. */
function EyeTable({ item }: { item: PrescriptionItem }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th className="py-1.5 pr-2 font-semibold">Olho</th>
            {EYE_COLUMNS.map((column) => <th key={column.key} className="px-2 py-1.5 font-semibold">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {(["od", "oe"] as const).map((eye) => (
            <tr key={eye} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1.5 pr-2 font-bold text-[#051647] dark:text-[#C4D600]">{eye.toUpperCase()}</td>
              {EYE_COLUMNS.map((column) => {
                const value = item[`${eye}${column.key}` as PrescriptionTextField];
                return <td key={column.key} className="px-2 py-1.5 font-mono text-slate-900 dark:text-white">{value ?? <span className="text-slate-300 dark:text-slate-600">—</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrescriptionCard({ item, highlight, busy, canWrite, onConfirm, onEdit, onDelete }: { item: PrescriptionItem; highlight: boolean; busy: boolean; canWrite: boolean; onConfirm: () => void; onEdit: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const expired = isPrescriptionExpired(item.dataReceita);
  const doctor = doctorLine(item);
  return (
    <article className={`space-y-3 rounded-xl border p-3 ${highlight ? "border-[#C4D600] bg-[#C4D600]/5 dark:border-[#C4D600]/60" : "border-slate-200 dark:border-slate-800"}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {highlight ? "Receita mais recente" : "Receita"} · {day(item.dataReceita) ?? `lançada em ${dateTime(item.createdAt)}`}
          </p>
          <p className="truncate text-xs text-slate-600 dark:text-slate-300" title={doctor}>{doctor || "Médico não informado"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {expired && <span className="inline-flex items-center gap-1 rounded-full bg-[#F7915E]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c25a26] dark:text-[#F7915E]"><AlertTriangle className="h-3 w-3" />Mais de 1 ano</span>}
          {item.conferidoPorHumano ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#C4D600]/25 px-2 py-0.5 text-[10px] font-semibold text-[#051647] dark:text-[#C4D600]"><BadgeCheck className="h-3 w-3" />Conferido ✓</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#002187]/10 px-2 py-0.5 text-[10px] font-semibold text-[#002187] dark:bg-white/10 dark:text-slate-200"><Bot className="h-3 w-3" />{item.origem === "ia_extracao" ? "Extraído pela IA (Conferir)" : "A conferir"}</span>
          )}
        </div>
      </header>

      <EyeTable item={item} />

      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        {item.dpTotal && <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">DP total</dt><dd className="font-mono text-slate-900 dark:text-white">{item.dpTotal}</dd></div>}
        {item.tipoLenteSugerido && <div><dt className="text-[10px] text-slate-500 dark:text-slate-400">Lente sugerida</dt><dd className="text-slate-900 dark:text-white">{item.tipoLenteSugerido}</dd></div>}
        {item.observacoes && <div className="sm:col-span-3"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Observações</dt><dd className="text-slate-900 dark:text-white">{item.observacoes}</dd></div>}
      </dl>

      <footer className="flex flex-wrap items-center gap-2">
        {item.attachmentUrl && (
          <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" className={NEUTRAL}><FileText className="h-3.5 w-3.5" />Ver arquivo original<ExternalLink className="h-3 w-3" /></a>
        )}
        {canWrite && !item.conferidoPorHumano && <button type="button" disabled={busy} onClick={onConfirm} className={PRIMARY}><BadgeCheck className="h-3.5 w-3.5" />Marcar como conferido</button>}
        {canWrite && <button type="button" disabled={busy} onClick={onEdit} className={NEUTRAL}><Pencil className="h-3.5 w-3.5" />Editar</button>}
        {canWrite && (confirmDelete ? (
          <span className="inline-flex items-center gap-1.5">
            <button type="button" disabled={busy} onClick={onDelete} className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`}>Confirmar exclusão</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className={NEUTRAL}>Cancelar</button>
          </span>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className={`${BUTTON} text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10`}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
        ))}
        <span className="ml-auto text-[10px] text-slate-400">{item.origem === "ia_extracao" ? "Lida pela IA do WhatsApp" : "Lançada manualmente"} em {dateTime(item.createdAt)}</span>
      </footer>
    </article>
  );
}

function PrescriptionForm({ initial, saving, onCancel, onSave }: { initial: FormState; saving: boolean; onCancel: () => void; onSave: (form: FormState) => void }) {
  const [form, setForm] = useState(initial);
  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // O modal fica num portal, mas o submit sobe pela árvore do React: não pode disparar o formulário do contato.
    event.stopPropagation();
    onSave(form);
  };
  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="py-1 pr-2">Olho</th>
                {EYE_COLUMNS.map((column) => <th key={column.key} className="px-1 py-1">{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {(["od", "oe"] as const).map((eye) => (
                <tr key={eye}>
                  <td className="py-1 pr-2 font-bold text-[#051647] dark:text-[#C4D600]">{eye.toUpperCase()}</td>
                  {EYE_COLUMNS.map((column) => {
                    const key = `${eye}${column.key}` as PrescriptionTextField;
                    return <td key={column.key} className="px-1 py-1"><input value={form[key]} onChange={(event) => set(key, event.target.value)} aria-label={`${eye.toUpperCase()} ${column.label}`} placeholder={column.key === "Eixo" ? "180°" : column.key === "Dnp" ? "31" : "-2,00"} className={`${INPUT} font-mono`} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Médico<input value={form.medicoNome} onChange={(event) => set("medicoNome", event.target.value)} placeholder="Dr. Nome Sobrenome" className={INPUT} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">CRM<input value={form.medicoCrm} onChange={(event) => set("medicoCrm", event.target.value)} placeholder="18636" className={INPUT} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Data da receita<input value={form.dataReceita} onChange={(event) => set("dataReceita", event.target.value)} placeholder="dd/mm/aaaa" inputMode="numeric" className={INPUT} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">DP total<input value={form.dpTotal} onChange={(event) => set("dpTotal", event.target.value)} placeholder="62" className={INPUT} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">Tipo de lente sugerido
            <select value={form.tipoLenteSugerido} onChange={(event) => set("tipoLenteSugerido", event.target.value)} className={`${INPUT} cursor-pointer`}>
              {LENS_TYPES.map((type) => <option key={type} value={type}>{type || "Não informado"}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">Observações<textarea value={form.observacoes} onChange={(event) => set("observacoes", event.target.value)} rows={2} placeholder="Antirreflexo, fotossensível, prismas..." className={`${INPUT} h-auto py-2`} /></label>
        </div>
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <button type="button" onClick={onCancel} className={NEUTRAL}>Cancelar</button>
        <button type="submit" disabled={saving} className={PRIMARY}>{saving ? "Salvando..." : "Salvar receita"}</button>
      </footer>
    </form>
  );
}

/**
 * Aba "Receituário" (chat e /contatos): receita mais recente em destaque, histórico, arquivo original,
 * conferência em 1 clique e lançamento/edição manual.
 */
export function ContactPrescriptionsTab({ contactId, canWrite = true, onCountChange }: { contactId: string; canWrite?: boolean; onCountChange?: (count: number) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<PrescriptionItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item: PrescriptionItem | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const base = `/api/contacts/${encodeURIComponent(contactId)}/prescriptions`;

  const update = useCallback((next: PrescriptionItem[]) => {
    setItems(next);
    onCountChange?.(next.length);
  }, [onCountChange]);

  useEffect(() => {
    let active = true;
    setFailed(false);
    fetch(base, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { prescriptions: PrescriptionItem[] };
        if (active) update(data.prescriptions);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [base, update]);

  const request = async (url: string, init: RequestInit) => {
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { prescription?: PrescriptionItem; error?: string } | null;
    if (!response?.ok) throw new Error(data?.error ?? "Não foi possível salvar a receita.");
    return data;
  };

  const confirm = async (item: PrescriptionItem) => {
    setBusyId(item.id);
    try {
      const data = await request(`${base}/${item.id}`, { method: "PATCH", body: JSON.stringify({ conferidoPorHumano: true }) });
      if (data?.prescription) update((items ?? []).map((current) => (current.id === item.id ? data.prescription! : current)));
      toast.success("Receita conferida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível conferir a receita.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: PrescriptionItem) => {
    setBusyId(item.id);
    try {
      await request(`${base}/${item.id}`, { method: "DELETE" });
      update((items ?? []).filter((current) => current.id !== item.id));
      toast.success("Receita excluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a receita.");
    } finally {
      setBusyId(null);
    }
  };

  const save = async (form: FormState) => {
    if (!editing) return;
    setSaving(true);
    try {
      const target = editing.item;
      const data = await request(target ? `${base}/${target.id}` : base, { method: target ? "PATCH" : "POST", body: JSON.stringify(target ? { ...form, conferidoPorHumano: true } : form) });
      const saved = data?.prescription;
      if (saved) {
        const rest = (items ?? []).filter((current) => current.id !== saved.id);
        const next = [saved, ...rest].sort((a, b) => (new Date(b.dataReceita ?? b.createdAt).getTime() - new Date(a.dataReceita ?? a.createdAt).getTime()));
        update(next);
      }
      toast.success(target ? "Receita atualizada." : "Receita cadastrada.");
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a receita.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">Receitas lidas pela IA no WhatsApp ou lançadas pela equipe.</p>
        {canWrite && <button type="button" onClick={() => setEditing({ item: null })} className={PRIMARY}><Plus className="h-3.5 w-3.5" />Nova receita</button>}
      </div>

      {failed ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Não foi possível carregar o receituário.</p>
      ) : !items ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Nenhuma receita registrada. Quando o cliente enviar a foto ou o PDF da receita, a IA preenche aqui.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.id}>
              {index === 1 && <h3 className="mb-2 mt-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Histórico</h3>}
              <PrescriptionCard item={item} highlight={index === 0} busy={busyId === item.id} canWrite={canWrite} onConfirm={() => void confirm(item)} onEdit={() => setEditing({ item })} onDelete={() => void remove(item)} />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EntityDialog titleId="prescription-form-title" title={editing.item ? "Editar receita" : "Nova receita"} description="Graus por olho, médico e data da receita" size="lg" onClose={() => setEditing(null)}>
          <PrescriptionForm initial={editing.item ? toForm(editing.item) : EMPTY_FORM} saving={saving} onCancel={() => setEditing(null)} onSave={(form) => void save(form)} />
        </EntityDialog>
      )}
    </div>
  );
}
