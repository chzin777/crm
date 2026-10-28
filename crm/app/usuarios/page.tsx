"use client";
import { useEffect, useState } from "react";
import { Bell, ChevronUp, ChevronsUpDown, Plus, RefreshCw, Search, UserCog, Trash2, Shield } from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { useToast } from "@/components/ToastProvider";

interface RoleOption {
  id: string;
  name: string;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  roleId: string | null;
  banned: boolean;
  createdAt: string;
  image: string | null;
}

const emptyForm = {
  name: "",
  email: "",
  roleId: "",
  banned: false,
};

const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#051647] dark:text-white";
const labelClass = "text-xs font-semibold text-slate-600 dark:text-slate-300";

export default function UsuariosPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const toast = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [editing, setEditing] = useState<UserRecord | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ field: string; order: "asc" | "desc" }>({ field: "name", order: "asc" });

  const handleSort = (field: string) => {
    setSortConfig((prev) => {
      const nextOrder = prev.field === field && prev.order === "asc" ? "desc" : "asc";
      return { field, order: nextOrder };
    });
  };

  const SortIndicator = ({ field }: { field: string }) => {
    const isActive = sortConfig.field === field;
    if (!isActive) return <ChevronsUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />;
    return <ChevronUp className={`h-3 w-3 transition-transform ${sortConfig.order === "desc" ? "rotate-180" : ""} text-[#002187] dark:text-[#C4D600]`} />;
  };

  const refreshUsers = async (signal?: AbortSignal, sort?: { field: string; order: "asc" | "desc" }) => {
    setIsLoading(true);
    setError("");
    try {
      const activeSort = sort ?? sortConfig;
      const params = new URLSearchParams();
      params.set("sortBy", activeSort.field);
      params.set("sortOrder", activeSort.order);
      const response = await fetch(`/api/users?${params.toString()}`, { signal });
      const result = await response.json().catch(() => ({})) as { data?: UserRecord[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os usuários.");
      const list = result.data ?? [];
      if (signal?.aborted) return;
      setUsers(list);
      setPage(1);
    } catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os usuários.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  const refreshRoles = async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/roles", { signal });
      const json = await res.json().catch(() => ({})) as { data?: RoleOption[]; error?: string };
      if (!res.ok) return;
      if (signal?.aborted) return;
      setRoles(json.data ?? []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const controller = new AbortController();
    void refreshUsers(controller.signal, sortConfig);
    void refreshRoles(controller.signal);
    return () => { controller.abort(); };
  }, [sortConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const openForm = (user: UserRecord | "new") => {
    setEditing(user);
    setForm(user === "new" ? emptyForm : {
      name: user.name,
      email: user.email,
      roleId: user.roleId ?? "",
      banned: user.banned,
    });
    setFormError("");
  };

  const closeForm = () => setEditing(null);

  const saveUser = async () => {
    if (!form.name.trim()) return setFormError("Informe o nome do usuário.");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setFormError("Informe um e-mail válido.");
    }
    setIsSaving(true);
    try {
      const isNew = editing === "new";
      const response = await fetch("/api/users", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? {} : { id: (editing as UserRecord).id }),
          name: form.name.trim(),
          email: form.email.trim(),
          roleId: form.roleId || null,
          banned: form.banned,
        }),
      });
      const result = await response.json().catch(() => ({})) as { data?: UserRecord; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error || "Não foi possível salvar o usuário.");
      toast.success(isNew ? "Usuário criado." : "Usuário atualizado.");
      closeForm();
      void refreshUsers();
    } catch (reason: unknown) {
      setFormError(reason instanceof Error ? reason.message : "Erro inesperado ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeUser = async (user: UserRecord) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${user.name}"?`)) return;
    try {
      const response = await fetch(`/api/users?id=${user.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Não foi possível excluir o usuário.");
      toast.success("Usuário excluído.");
      void refreshUsers();
    } catch (reason: unknown) {
      toast.error(reason instanceof Error ? reason.message : "Erro inesperado ao excluir.");
    }
  };

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "Sem cargo";
    return roles.find((r) => r.id === roleId)?.name ?? "Desconhecido";
  };

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    getRoleName(u.roleId).toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5 dark:border-slate-800 dark:bg-[#051647]">
          <div>
            <h1 className="text-2xl font-semibold text-[#051647] dark:text-white">Usuários</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gerencie os usuários e seus cargos</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button
              type="button"
              onClick={() => openForm("new")}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:cursor-pointer hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647]"
            >
              <Plus className="h-4 w-4" /> Novo Usuário
            </button>
          </div>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden px-8 py-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar usuário..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-[#051647] dark:text-white"
              />
            </div>
          </div>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#051647]">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <LoadingSpinner label="Carregando usuários..." />
              </div>
            ) : paged.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                <UserCog className="mb-2 h-8 w-8" />
                <p className="text-sm">Nenhum usuário encontrado.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-[#07194f] dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3 cursor-pointer hover:text-[#002187] dark:hover:text-[#C4D600]" onClick={() => handleSort("name")}>
                      <div className="flex items-center gap-1">Nome <SortIndicator field="name" /></div>
                    </th>
                    <th className="px-6 py-3 cursor-pointer hover:text-[#002187] dark:hover:text-[#C4D600]" onClick={() => handleSort("email")}>
                      <div className="flex items-center gap-1">E-mail <SortIndicator field="email" /></div>
                    </th>
                    <th className="px-6 py-3">Cargo</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paged.map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{user.name}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#051647]/10 px-2.5 py-0.5 text-xs font-medium text-[#051647] dark:bg-[#C4D600]/20 dark:text-[#C4D600]">
                          <Shield className="h-3 w-3" />
                          {getRoleName(user.roleId)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {user.banned ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">Bloqueado</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Ativo</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openForm(user)}
                          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-[#002187] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-[#C4D600]"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} de {filtered.length}</span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-white/10">Anterior</button>
                <span className="px-2 py-1">Página {page} de {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-white/10">Próxima</button>
              </div>
            </div>
          )}
        </div>
      </main>
      {editing && (
        <EntityDialog titleId="user-dialog-title" title={editing === "new" ? "Novo Usuário" : `Editar: ${(editing as UserRecord).name}`} description="Defina os dados e o cargo do usuário." onClose={closeForm}>
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className={labelClass}>Nome *</span>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Nome completo" />
            </label>
            <label className="block space-y-1.5">
              <span className={labelClass}>E-mail *</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="email@exemplo.com" />
            </label>
            <label className="block space-y-1.5">
              <span className={labelClass}>Cargo</span>
              <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className={inputClass}>
                <option value="">Selecione um cargo</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            {editing !== "new" && (
              <button
                type="button"
                role="switch"
                aria-checked={form.banned}
                onClick={() => setForm({ ...form, banned: !form.banned })}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:cursor-pointer dark:border-slate-700"
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">Bloquear acesso</span>
                  <span className="block text-xs text-slate-500">Usuários bloqueados não conseguem fazer login no sistema.</span>
                </span>
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.banned ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${form.banned ? "left-[22px]" : "left-0.5"}`} />
                </span>
              </button>
            )}
            {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
          </div>
          <footer className="mt-4 flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              {editing !== "new" && (
                <button type="button" onClick={() => removeUser(editing as UserRecord)} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600 hover:cursor-pointer hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /> Excluir</button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={closeForm} className="h-10 cursor-pointer rounded-lg border border-slate-200 px-4 text-sm font-semibold hover:cursor-pointer dark:border-slate-700">Cancelar</button>
              <button type="button" disabled={isSaving} onClick={saveUser} className="h-10 cursor-pointer rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:cursor-pointer hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647]">{isSaving ? "Salvando..." : "Salvar"}</button>
            </div>
          </footer>
        </EntityDialog>
      )}
    </div>
  );
}