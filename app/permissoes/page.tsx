"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Plus, Save, Search, ShieldCheck, Users, X } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/components/ToastProvider";
import { MODULES, type ModuleKey } from "@/lib/permissions";

interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
}

type Draft = Record<string, Record<ModuleKey, boolean>>;

const toModuleMap = (permissions: Record<string, boolean>) =>
  Object.fromEntries(MODULES.map((module) => [module.key, permissions?.[module.key] === true])) as Record<ModuleKey, boolean>;

const groups = [...new Set(MODULES.map((module) => module.group))];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002187] focus-visible:ring-offset-2 dark:focus-visible:ring-[#C4D600] ${
        checked ? "bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function PermissoesPage() {
  const toast = useToast();
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("Todos");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/roles", { signal });
      const json = (await res.json().catch(() => ({}))) as { data?: RoleRecord[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Erro ao carregar cargos.");
      const list = json.data ?? [];
      if (signal?.aborted) return;
      setRoles(list);
      setDraft(Object.fromEntries(list.map((role) => [role.id, toModuleMap(role.permissions)])));
      if (!selectedRoleId && list.length > 0) {
        setSelectedRoleId(list[0].id);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Erro ao carregar cargos.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [selectedRoleId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
  const selectedDraft = selectedRoleId ? draft[selectedRoleId] : null;
  const originalPermissions = selectedRole ? toModuleMap(selectedRole.permissions) : null;

  const hasChanges = useMemo(() => {
    if (!selectedRoleId || !selectedDraft || !originalPermissions) return false;
    return MODULES.some((m) => selectedDraft[m.key] !== originalPermissions[m.key]);
  }, [selectedRoleId, selectedDraft, originalPermissions]);

  const toggle = (key: ModuleKey) => {
    if (!selectedRoleId) return;
    setDraft((current) => ({
      ...current,
      [selectedRoleId]: { ...current[selectedRoleId], [key]: !current[selectedRoleId]?.[key] },
    }));
  };

  const setAllForGroup = (group: string, value: boolean) => {
    if (!selectedRoleId) return;
    const keys = MODULES.filter((m) => m.group === group).map((m) => m.key);
    setDraft((current) => ({
      ...current,
      [selectedRoleId]: { ...current[selectedRoleId], ...Object.fromEntries(keys.map((k) => [k, value])) },
    }));
  };

  const discardChanges = () => {
    if (!selectedRole) return;
    setDraft((current) => ({ ...current, [selectedRole.id]: toModuleMap(selectedRole.permissions) }));
  };

  const save = async () => {
    if (!selectedRoleId || !selectedDraft) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedRoleId, permissions: selectedDraft }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Erro ao salvar permissões.");
      toast.success("Permissões salvas com sucesso.");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const createRole = async () => {
    if (!createName.trim()) {
      toast.error("Nome do cargo é obrigatório.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), description: createDescription.trim() || null }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: RoleRecord; error?: string };
      if (!res.ok) throw new Error(json.error || "Erro ao criar cargo.");
      toast.success(`Cargo "${json.data?.name}" criado com sucesso.`);
      setCreateName("");
      setCreateDescription("");
      setIsCreateOpen(false);
      await load();
      if (json.data?.id) {
        setSelectedRoleId(json.data.id);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado ao criar cargo.");
    } finally {
      setIsCreating(false);
    }
  };

  const filteredModules = MODULES.filter((m) => {
    const matchesSearch = m.label.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = filterGroup === "Todos" || m.group === filterGroup;
    return matchesSearch && matchesGroup;
  });

  const filteredGroups = filterGroup === "Todos" ? groups : groups.filter((g) => g === filterGroup);

  const activePermissionCount = (roleId: string) => {
    const d = draft[roleId];
    if (!d) return 0;
    return MODULES.filter((m) => d[m.key] === true).length;
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Permissões de Acesso</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Gerencie os módulos e níveis de acesso concedidos a cada cargo do sistema.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Linha de Controle: Busca + Botão Novo Cargo */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <label className="relative block w-full sm:w-72 md:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar cargo ou módulo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Buscar"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
          />
        </label>
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-[#C4D600]"
        >
          <option value="Todos">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="ml-auto inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#b3c400]"
        >
          <Plus className="h-4 w-4" /> Novo Cargo
        </button>
      </div>

      {/* Cards de Cargos (Estilo KPI) */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner label="Carregando cargos..." size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {roles.map((role) => {
            const isSelected = role.id === selectedRoleId;
            const permCount = activePermissionCount(role.id);
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRoleId(role.id)}
                className={`group relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all cursor-pointer hover:shadow-md ${
                  isSelected
                    ? "border-[#002187] bg-white shadow-md ring-1 ring-[#002187] dark:border-[#C4D600] dark:bg-[#07194f] dark:ring-[#C4D600]"
                    : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-700/80 dark:bg-[#07194f] dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`text-base font-bold ${isSelected ? "text-[#051647] dark:text-[#C4D600]" : "text-slate-900 dark:text-white"}`}>
                    {role.name}
                  </h3>
                  {role.isSystem && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Sistema
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{permCount} permissões ativas</span>
                </div>
                {role.description && (
                  <p className="line-clamp-2 text-[11px] text-slate-400">{role.description}</p>
                )}
              </button>
            );
          })}

          {/* Card "+ Adicionar Cargo" */}
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-4 text-slate-400 transition-all cursor-pointer hover:border-[#002187] hover:text-[#002187] dark:border-slate-700 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <Plus className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold">Adicionar Cargo</span>
          </button>
        </div>
      )}

      {/* Área de Permissões do Cargo Selecionado */}
      {!isLoading && selectedRole && selectedDraft ? (
        <div className="space-y-4">
          {/* Header da Seção de Permissões */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#051647] dark:text-[#C4D600]" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Permissões do Cargo: <span className="text-[#002187] dark:text-[#C4D600]">{selectedRole.name}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => MODULES.forEach((m) => { if (!selectedDraft[m.key]) toggle(m.key); })}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-[#002187] hover:bg-slate-100 dark:text-[#C4D600] dark:hover:bg-slate-800"
              >
                Marcar todas
              </button>
              <button
                type="button"
                onClick={() => MODULES.forEach((m) => { if (selectedDraft[m.key]) toggle(m.key); })}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Desmarcar todas
              </button>
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Lock className="h-3.5 w-3.5" />
            Administradores sempre têm acesso total. Usuários sem cargo não acessam telas.
          </p>

          {/* Grid de Módulos com Toggles */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {filteredGroups.map((group) => {
              const modulesInGroup = filteredModules.filter((m) => m.group === group);
              if (modulesInGroup.length === 0) return null;
              const allChecked = modulesInGroup.every((m) => selectedDraft[m.key] === true);
              const noneChecked = modulesInGroup.every((m) => selectedDraft[m.key] === false);

              return (
                <div
                  key={group}
                  className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-700/80 dark:bg-[#07194f]"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-[#051647] dark:text-[#C4D600]" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{group}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setAllForGroup(group, true)}
                        disabled={allChecked}
                        className="cursor-pointer rounded px-2 py-1 text-[10px] font-semibold text-[#002187] hover:bg-slate-100 disabled:opacity-40 dark:text-[#C4D600] dark:hover:bg-slate-800"
                      >
                        Marcar todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllForGroup(group, false)}
                        disabled={noneChecked}
                        className="cursor-pointer rounded px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {modulesInGroup.map((module) => {
                      const checked = selectedDraft[module.key] === true;
                      return (
                        <div
                          key={module.key}
                          className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 transition-colors dark:border-slate-800/50 dark:bg-white/[0.03]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{module.label}</p>
                            <p className="text-[10px] text-slate-400">Acesso à tela {module.href}</p>
                          </div>
                          <Toggle
                            checked={checked}
                            onChange={() => toggle(module.key)}
                            label={`${checked ? "Remover" : "Conceder"} acesso a ${module.label}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : !isLoading && roles.length > 0 && !selectedRole ? (
        <div className="flex h-40 items-center justify-center text-slate-400">
          <p className="text-sm">Selecione um cargo acima para gerenciar permissões.</p>
        </div>
      ) : null}

      {/* Barra Flutuante de Alterações Não Salvas */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-3 shadow-2xl dark:border-slate-700 dark:bg-[#07194f]">
          <div className="flex items-center gap-2">
            <div className="flex h-2 w-2 animate-pulse rounded-full bg-[#F7915E]" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Alterações não salvas</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discardChanges}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" /> Descartar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#051647] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#b3c400]"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      )}

      {/* Modal de Criar Novo Cargo */}
      {isCreateOpen && (
        <EntityDialog
          titleId="create-role-title"
          title="Novo Cargo"
          description="Crie um novo cargo para definir permissões de acesso."
          onClose={() => setIsCreateOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="role-name" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nome do cargo *
              </label>
              <input
                id="role-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Ex: Vendedor, Gerente de Loja"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="role-desc" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Descrição
              </label>
              <textarea
                id="role-desc"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Descrição opcional do cargo..."
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex h-10 cursor-pointer items-center rounded-lg px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={createRole}
                disabled={isCreating || !createName.trim()}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#002187] disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#b3c400]"
              >
                {isCreating ? "Criando..." : "Criar Cargo"}
              </button>
            </div>
          </div>
        </EntityDialog>
      )}
    </div>
  );
}