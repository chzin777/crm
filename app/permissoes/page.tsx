"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Lock, Save } from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useCrmTheme } from "@/hooks/useCrmTheme";
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

export default function PermissoesPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const toast = useToast();
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async (signal?: AbortSignal) => {
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
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Erro ao carregar cargos.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const changedRoles = useMemo(
    () => roles.filter((role) => MODULES.some((module) => (draft[role.id]?.[module.key] ?? false) !== (role.permissions?.[module.key] === true))),
    [roles, draft],
  );

  const toggle = (roleId: string, key: ModuleKey) =>
    setDraft((current) => ({ ...current, [roleId]: { ...current[roleId], [key]: !current[roleId]?.[key] } }));

  const setAll = (roleId: string, value: boolean) =>
    setDraft((current) => ({ ...current, [roleId]: Object.fromEntries(MODULES.map((module) => [module.key, value])) as Record<ModuleKey, boolean> }));

  const save = async () => {
    setIsSaving(true);
    try {
      for (const role of changedRoles) {
        const res = await fetch("/api/roles", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: role.id, permissions: draft[role.id] }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error || `Erro ao salvar o cargo ${role.name}.`);
      }
      toast.success("Permissões salvas.");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const groups = [...new Set(MODULES.map((module) => module.group))];

  return (
    <div>
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5 dark:border-slate-800 dark:bg-[#051647]">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Permissões</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Defina quais telas cada cargo pode acessar</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button
              type="button"
              disabled={isSaving || changedRoles.length === 0}
              onClick={save}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#051647] px-4 text-sm font-semibold text-white hover:cursor-pointer hover:bg-[#002187] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#C4D600] dark:text-[#051647]"
            >
              <Save className="h-4 w-4" /> {isSaving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden px-8 py-6">
          <p className="mb-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Lock className="h-3.5 w-3.5" /> Administradores do sistema sempre têm acesso a tudo. Usuários sem cargo não acessam nenhuma tela, exceto o próprio perfil.
          </p>
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#051647]">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center"><LoadingSpinner label="Carregando permissões..." /></div>
            ) : roles.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                <KeyRound className="mb-2 h-8 w-8" />
                <p className="text-sm">Nenhum cargo cadastrado. Crie um cargo em Cargos para definir permissões.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-[#07194f] dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3">Tela</th>
                    {roles.map((role) => (
                      <th key={role.id} className="px-4 py-3 text-center">
                        <div className="font-semibold">{role.name}</div>
                        <div className="mt-1 flex items-center justify-center gap-2 text-[10px] font-medium normal-case tracking-normal">
                          <button type="button" onClick={() => setAll(role.id, true)} className="cursor-pointer text-[#002187] hover:cursor-pointer hover:underline dark:text-[#C4D600]">Todas</button>
                          <span aria-hidden="true">·</span>
                          <button type="button" onClick={() => setAll(role.id, false)} className="cursor-pointer text-slate-500 hover:cursor-pointer hover:underline">Nenhuma</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {groups.map((group) => (
                    <Fragment key={group}>
                      <tr className="bg-slate-50/60 dark:bg-white/5">
                        <td colSpan={roles.length + 1} className="px-6 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group}</td>
                      </tr>
                      {MODULES.filter((module) => module.group === group).map((module) => (
                        <tr key={module.key} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{module.label}</td>
                          {roles.map((role) => {
                            const checked = draft[role.id]?.[module.key] === true;
                            return (
                              <td key={role.id} className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={checked}
                                  aria-label={`${module.label} para ${role.name}`}
                                  onClick={() => toggle(role.id, module.key)}
                                  className={`inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-colors hover:cursor-pointer ${checked ? "border-[#002187] bg-[#002187] dark:border-[#C4D600] dark:bg-[#C4D600]" : "border-slate-300 dark:border-slate-600"}`}
                                >
                                  {checked && <Check className="h-3.5 w-3.5 text-white dark:text-[#051647]" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
