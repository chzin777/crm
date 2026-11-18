"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import { fieldKey, FIELD_TYPES, type ContactFieldDefinition, type FieldType } from "@/lib/contact-fields";

const INPUT = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
const TYPE_LABEL: Record<FieldType, string> = Object.fromEntries(FIELD_TYPES.map((item) => [item.value, item.label])) as Record<FieldType, string>;

/** Cria e exclui os campos personalizados do contato (usados na ficha, nas automações e pela IA). */
export function ContactFieldsManager({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [definitions, setDefinitions] = useState<ContactFieldDefinition[] | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<ContactFieldDefinition | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/contacts/fields", { cache: "no-store" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { definitions?: ContactFieldDefinition[] } | null;
    setDefinitions(body?.definitions ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/contacts/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, type, options: options.split(",").map((item) => item.trim()).filter(Boolean) }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível criar.");
      toast.success("Campo criado", label);
      setLabel("");
      setOptions("");
      setType("text");
      await load();
    } catch (error) {
      toast.error("Não foi possível criar o campo", error instanceof Error ? error.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    const response = await fetch(`/api/contacts/fields/${removing.id}`, { method: "DELETE" }).catch(() => null);
    if (response?.ok) toast.success("Campo excluído", removing.label);
    else toast.error("Não foi possível excluir o campo");
    setRemoving(null);
    await load();
  };

  return (
    <EntityDialog titleId="campos-personalizados" title="Campos personalizados" description="Dados extras do cliente (ex.: loja preferida, grau esférico, data da última consulta). Aparecem na ficha, no nó Atualizar campo do contato e podem ser preenchidos pela IA." onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-[1fr_140px]">
          <label className="block space-y-1">
            <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">Nome do campo</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Loja preferida" maxLength={80} className={INPUT} />
            {label.trim() && <span className="block text-[10px] text-slate-400">Chave nas automações e na IA: {fieldKey(label) || "—"}</span>}
          </label>
          <label className="block space-y-1">
            <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">Tipo</span>
            <select value={type} onChange={(event) => setType(event.target.value as FieldType)} className={`${INPUT} cursor-pointer`}>
              {FIELD_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {type === "select" && (
            <label className="block space-y-1 sm:col-span-2">
              <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">Opções (separadas por vírgula)</span>
              <input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Loja Centro, Loja Shopping, Loja Norte" className={INPUT} />
            </label>
          )}
          <div className="flex justify-end sm:col-span-2">
            <button type="button" onClick={() => void create()} disabled={!label.trim() || saving} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#002187] px-4 text-sm font-semibold text-white hover:bg-[#051647] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Criar campo</button>
          </div>
        </div>
        {definitions === null ? (
          <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando...</p>
        ) : definitions.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum campo criado ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {definitions.map((def) => (
              <li key={def.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#051647] dark:text-white">{def.label}</p>
                  <p className="break-words text-[11px] text-slate-500 dark:text-slate-400">{def.key} · {TYPE_LABEL[def.type]}{def.type === "select" ? ` · ${def.options.join(", ")}` : ""}</p>
                </div>
                <button type="button" onClick={() => setRemoving(def)} aria-label={`Excluir ${def.label}`} className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {removing && (
        <ConfirmDialog
          title="Excluir campo personalizado?"
          description={`O campo "${removing.label}" deixa de aparecer nas fichas e nas automações. Os valores já gravados ficam guardados.`}
          confirmLabel="Excluir"
          variant="destructive"
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
    </EntityDialog>
  );
}
