"use client";
import { useEffect, useState } from "react";
import { Plus, Search, Shield, Pencil, Trash2, ChevronUp, ChevronsUpDown, Lock, Check } from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { useToast } from "@/components/ToastProvider";

interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

const PERMISSIONS = [
  { key: "contacts_view", label: "Ver contatos" },
  { key: "contacts_edit", label: "Editar contatos" },
  { key: "pipeline_view", label: "Ver pipeline" },
  { key: "pipeline_edit", label: "Editar pipeline" },
  { key: "campaigns_view", label: "Ver campanhas" },
  { key: "campaigns_edit", label: "Editar campanhas" },
  { key: "users_manage", label: "Gerenciar usuários" },
  { key: "settings_manage", label: "Gerenciar configurações" },
];

const emptyForm = { name: "", description: "", permissions: {} as Record<string, boolean> };
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#051647] dark:text-white";
const labelClass = "text-xs font-semibold text-slate-600 dark:text-slate-300";

export default function CargosPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const toast = useToast();
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RoleRecord | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ field: string; order: "asc" | "desc" }>({ field: "name", order: "asc" });

  const handleSort = (field: string) => setSortConfig((p) => ({ field, order: p.field === field && p.order === "asc" ? "desc" : "asc" }));
  const SortIndicator = ({ field }: { field: string }) =>
    sortConfig.field === field
      ? <ChevronUp className={`h-3 w-3 transition-transform ${sortConfig.order === "desc" ? "rotate-180" : ""} text-[#002187] dark:text-[#C4D600]`} />
      : <ChevronsUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />;

  const refreshRoles = async (signal?: AbortSignal) => {
    setIsLoading(true); setError("");
    try {
      const res = await fetch("/api/roles", { signal });
      const json = await res.json().catch(() => ({})) as { data?: RoleRecord[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Erro ao carregar cargos.");
      const list = json.data ?? [];
      if (signal?.aborted) return;
      const sorted = [...list].sort((a, b) => {
        const av = (a[sortConfig.field as keyof RoleRecord] ?? "").toString().toLowerCase();
        const bv = (b[sortConfig.field as keyof RoleRecord] ?? "").toString().toLowerCase();
        return sortConfig.order === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      setRoles(sorted);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Erro ao carregar cargos.");
    } finally { if (!signal?.aborted) setIsLoading(false); }
  };

  useEffect(() => { const c = new AbortController(); void refreshRoles(c.signal); return () => c.abort(); }, [sortConfig]); // eslint-disable-line

  const openForm = (r: RoleRecord | "new") => {
    setEditing(r);
    setForm(r === "new" ? emptyForm : { name: r.name, description: r.description ?? "", permissions: { ...r.permissions } });
    setFormError("");
  };
  const closeForm = () => setEditing(null);
  const togglePerm = (k: string) => setForm((p) => ({ ...p, permissions: { ...p.permissions, [k]: !p.permissions[k] } }));

  const saveRole = async () => {
    if (!form.name.trim()) return setFormError("Informe o nome do cargo.");
    setIsSaving(true);
    try {
      const isNew = editing === "new";
      const res = await fetch("/api/roles", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? {} : { id: (editing as RoleRecord).id }),
          name: form.name.trim(),
          description: form.description.trim() || null,
          permissions: form.permissions,
        }),
      });
      const json = await res.json().catch(() => ({})) as { data?: RoleRecord; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Erro ao salvar.");
      toast.success(isNew ? "Cargo criado." : "Cargo atualizado.");
      closeForm(); void refreshRoles();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally { setIsSaving(false); }
  };

  const removeRole = async (r: RoleRecord) => {
    if (r.isSystem) return toast.error("Cargos de sistema não podem ser excluídos.");
    if (!confirm(`Excluir o cargo "${r.name}"?`)) return;
    try {
      const res = await fetch(`/api/roles?id=${r.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "Erro ao excluir.");
      toast.success("Cargo excluído."); void refreshRoles();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro inesperado."); }
  };

  const filtered = roles.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5 dark:border-slate-800 dark:bg-[#051647]">
          <div>
            <h1 className="text-2xl font-semibold text-[#051647] dark:text-white">Cargos</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gerencie os cargos e permissões do sistema</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" onClick={() => openForm("new")} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:cursor-pointer hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]">
              <Plus className="h-4 w-4" /> Novo Cargo
            </button>
          </div>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden px-8 py-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Buscar cargo..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#051647] dark:text-white" />
            </div>
          </div>
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#051647]">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center"><LoadingSpinner label="Carregando cargos..." /></div>
            ) : filtered.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                <Shield className="mb-2 h-8 w-8" /><p className="text-sm">Nenhum cargo encontrado.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-[#07194f] dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3 cursor-pointer hover:text-[#002187] dark:hover:text-[#C4D600]" onClick={() => handleSort("name")}><div className="flex items-center gap-1">Nome <SortIndicator field="name" /></div></th>
                    <th className="px-6 py-3 cursor-pointer hover:text-[#002187] dark:hover:text-[#C4D600]" onClick={() => handleSort("description")}><div className="flex items-center gap-1">Descrição <SortIndicator field="description" /></div></th>
                    <th className="px-6 py-3">Permissões</th>
                    <th className="px-6 py-3">Tipo</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((role) => {
                    const pc = Object.values(role.permissions).filter(Boolean).length;
                    return (
                      <tr key={role.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{role.name}</td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{role.description || "—"}</td>
                        <td className="px-6 py-4"><span className="inline-flex items-center rounded-full bg-[#051647]/10 px-2.5 py-0.5 text-xs font-medium text-[#051647] dark:bg-[#C4D600]/20 dark:text-[#C4D600]">{pc} de {PERMISSIONS.length}</span></td>
                        <td className="px-6 py-4">{role.isSystem
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"><Lock className="h-3 w-3" /> Sistema</span>
                          : <span className="inline-flex items-center rounded-full bg-[#C4D600]/10 px-2.5 py-0.5 text-xs font-medium text-[#051647] dark:bg-[#C4D600]/20 dark:text-[#C4D600]">Personalizado</span>}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => openForm(role)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/10 dark:hover:text-[#C4D600]" title="Editar"><Pencil className="h-4 w-4" /></button>
                            {!role.isSystem && <button type="button" onClick={() => removeRole(role)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400" title="Excluir"><Trash2 className="h-4 w-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
      {editing && (
        <EntityDialog titleId="cargo-dialog-title" title={editing === "new" ? "Novo Cargo" : `Editar: ${(editing as RoleRecord).name}`} description="Defina o nome e as permissões do cargo." onClose={closeForm}>
          <div className="space-y-4">
            <label className="block space-y-1.5"><span className={labelClass}>Nome *</span><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ex: Supervisor Regional" /></label>
            <label className="block space-y-1.5"><span className={labelClass}>Descrição</span><input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Descrição opcional" /></label>
            <div className="space-y-2">
              <span className={labelClass}>Permissões</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PERMISSIONS.map((p) => (
                  <button key={p.key} type="button" onClick={() => togglePerm(p.key)}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors hover:cursor-pointer ${form.permissions[p.key] ? "border-[#002187] bg-[#051647]/10 text-[#051647] dark:border-[#C4D600] dark:bg-[#C4D600]/20 dark:text-[#C4D600]" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"}`}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${form.permissions[p.key] ? "border-[#002187] bg-[#002187] dark:border-[#C4D600] dark:bg-[#C4D600]" : "border-slate-300 dark:border-slate-600"}`}>
                      {form.permissions[p.key] && <Check className="h-3 w-3 text-white dark:text-[#051647]" />}
                    </span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {formError && <p className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
          </div>
          <footer className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" onClick={closeForm} className="h-10 cursor-pointer rounded-lg border border-slate-200 px-4 text-sm font-semibold hover:cursor-pointer dark:border-slate-700">Cancelar</button>
            <button type="button" disabled={isSaving} onClick={saveRole} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:cursor-pointer hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647]">{isSaving ? "Salvando..." : "Salvar"}</button>
          </footer>
        </EntityDialog>
      )}
    </div>
  );
}