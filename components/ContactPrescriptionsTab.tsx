"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, BadgeCheck, ChevronDown, Clock, FileText, Pencil, Plus, Trash2 } from "lucide-react";
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
      <table className="w-full min-w-[380px] table-fixed text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th className="w-12 py-1.5 pr-2 text-left font-semibold">Olho</th>
            {EYE_COLUMNS.map((column) => <th key={column.key} className="px-2 py-1.5 text-center font-semibold">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {(["od", "oe"] as const).map((eye) => (
            <tr key={eye} className="border-t border-slate-200/70 dark:border-slate-800">
              <td className="py-2 pr-2 text-left font-bold text-[#051647] dark:text-[#C4D600]">{eye.toUpperCase()}</td>
              {EYE_COLUMNS.map((column) => {
                const value = item[`${eye}${column.key}` as PrescriptionTextField];
                return <td key={column.key} className="px-2 py-2 text-center font-mono text-sm text-slate-900 dark:text-white">{value ?? <span className="text-slate-300 dark:text-slate-600">—</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ item }: { item: PrescriptionItem }) {
  return item.conferidoPorHumano ? (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><BadgeCheck className="h-3 w-3" />Conferido ✓</span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Clock className="h-3 w-3" />Aguardando conferência</span>
  );
}

const ACTION = "inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-white hover:text-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-[#C4D600]";

/** Receita em destaque: data/médico/status no topo, tabela OD x OE e barra de ações dentro do card. */
function PrescriptionCard({ item, busy, canWrite, onConfirm, onEdit, onDelete }: { item: PrescriptionItem; busy: boolean; canWrite: boolean; onConfirm: () => void; onEdit: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const expired = isPrescriptionExpired(item.dataReceita);
  const doctor = doctorLine(item);
  const extras = [item.dpTotal && `DP total ${item.dpTotal}`, item.tipoLenteSugerido && `Lente: ${item.tipoLenteSugerido}`].filter(Boolean).join(" · ");
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-white/[0.03]">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{day(item.dataReceita) ?? `Lançada em ${dateTime(item.createdAt)}`}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={doctor}>{doctor || "Médico não informado"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {expired && <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#F7915E]/15 px-2 py-0.5 text-[10px] font-bold text-[#c25a26] dark:text-[#F7915E]"><AlertTriangle className="h-3 w-3" />Mais de 1 ano</span>}
          <StatusBadge item={item} />
        </div>
      </header>

      <div className="space-y-2 px-4 py-3">
        <EyeTable item={item} />
        {(extras || item.observacoes) && (
          <p className="text-xs text-slate-600 dark:text-slate-300">{[extras, item.observacoes].filter(Boolean).join(" · ")}</p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-1 border-t border-slate-100 bg-slate-50 px-2 py-1.5 dark:border-slate-800 dark:bg-white/5">
        {item.attachmentUrl && <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" className={ACTION}><FileText className="h-3.5 w-3.5" />Ver anexo</a>}
        {canWrite && !item.conferidoPorHumano && <button type="button" disabled={busy} onClick={onConfirm} className={ACTION}><BadgeCheck className="h-3.5 w-3.5" />Conferir</button>}
        {canWrite && <button type="button" disabled={busy} onClick={onEdit} className={ACTION}><Pencil className="h-3.5 w-3.5" />Editar</button>}
        {canWrite && (confirmDelete ? (
          <span className="ml-auto inline-flex items-center gap-1">
            <button type="button" disabled={busy} onClick={onDelete} className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`}>Confirmar exclusão</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className={ACTION}>Cancelar</button>
          </span>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} aria-label="Excluir receita" title="Excluir receita" className={`${ACTION} ml-auto hover:text-red-600 dark:hover:text-red-300`}><Trash2 className="h-3.5 w-3.5" /></button>
        ))}
      </footer>
      <p className="px-4 pb-2 pt-1 text-[10px] text-slate-400 dark:text-slate-500">{item.origem === "ia_extracao" ? "Lida pela IA do WhatsApp" : "Lançada manualmente"} em {dateTime(item.createdAt)}</p>
    </article>
  );
}

/** Linha compacta do histórico: expande para o card completo. */
function HistoryRow({ item, open, onToggle, children }: { item: PrescriptionItem; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-800">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5">
        <span className="w-20 shrink-0 text-xs font-semibold text-slate-900 dark:text-white">{day(item.dataReceita) ?? dateTime(item.createdAt)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">{doctorLine(item) || "Médico não informado"}</span>
        <StatusBadge item={item} />
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-slate-100 p-2 dark:border-slate-800">{children}</div>}
    </li>
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
    <form onSubmit={submit} className="flex flex-col">
      <div className="space-y-4 pb-4">
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
      <footer className="sticky bottom-0 -mb-4 flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white py-3 dark:border-slate-800 dark:bg-[#07194f]">
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
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  // Sub-formulário de criação/edição ocupa a aba inteira; o único rodapé é Cancelar + Salvar receita.
  if (editing) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{editing.item ? "Editar receita" : "Nova receita"}</h3>
        <PrescriptionForm initial={editing.item ? toForm(editing.item) : EMPTY_FORM} saving={saving} onCancel={() => setEditing(null)} onSave={(form) => void save(form)} />
      </div>
    );
  }

  const [current, ...history] = items ?? [];
  const cardProps = (item: PrescriptionItem) => ({ item, busy: busyId === item.id, canWrite, onConfirm: () => void confirm(item), onEdit: () => setEditing({ item }), onDelete: () => void remove(item) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Receita atual</h3>
        {canWrite && <button type="button" onClick={() => setEditing({ item: null })} className={PRIMARY}><Plus className="h-3.5 w-3.5" />Nova receita</button>}
      </div>

      {failed ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Não foi possível carregar o receituário.</p>
      ) : !items ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
      ) : !current ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Nenhuma receita registrada. Quando o cliente enviar a foto ou o PDF da receita, a IA preenche aqui.</p>
      ) : (
        <>
          <PrescriptionCard {...cardProps(current)} />
          {history.length > 0 && (
            <section>
              <button type="button" onClick={() => setShowHistory((open) => !open)} aria-expanded={showHistory} className="flex w-full cursor-pointer items-center justify-between gap-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                Histórico ({history.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              </button>
              {showHistory && (
                <ul className="mt-2 space-y-1.5">
                  {history.map((item) => (
                    <HistoryRow key={item.id} item={item} open={expandedId === item.id} onToggle={() => setExpandedId((id) => (id === item.id ? null : item.id))}>
                      <PrescriptionCard {...cardProps(item)} />
                    </HistoryRow>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
