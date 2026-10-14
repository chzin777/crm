"use client";

import { Sidebar } from "@/components/Sidebar";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { authClient } from "@/lib/auth-client";
import { Bell, Mail, Shield, User as UserIcon } from "lucide-react";
import { useCrmTheme } from "@/hooks/useCrmTheme";

export default function PerfilPage() {
  const { isDark, toggleTheme } = useCrmTheme();
  const { data: session, isPending } = authClient.useSession();

  const userName = session?.user?.name ?? "Usuário";
  const userEmail = session?.user?.email ?? "";
  const userRole = (session?.user as { role?: string })?.role ?? "Colaborador";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] text-slate-800 transition-colors dark:bg-[#030d29] dark:text-slate-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-4 mt-4 flex h-16 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm dark:border-slate-800 dark:bg-[#051647]">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span>{" "}
            <strong className="text-slate-900 dark:text-white">Meu Perfil</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button
              type="button"
              aria-label="Alertas"
              title="Alertas"
              className="topbar-icon-button bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl space-y-6 p-6 sm:p-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Meu Perfil</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Visualize suas informações de acesso e preferências pessoais.
            </p>
          </div>

          {isPending && <LoadingSpinner label="Carregando dados da sessão..." />}

          {!isPending && !session && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              Não foi possível carregar os dados da sessão. Faça login novamente.
            </p>
          )}

          {session && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#051647] text-2xl font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">{userName}</h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {userEmail}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      {userRole}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <UserIcon className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />
                    Dados pessoais
                  </div>
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">Nome completo</dt>
                      <dd className="font-medium text-slate-900 dark:text-white">{userName}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">E-mail</dt>
                      <dd className="font-medium text-slate-900 dark:text-white">{userEmail}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <Shield className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />
                    Acesso e permissões
                  </div>
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">Perfil</dt>
                      <dd className="font-medium text-slate-900 dark:text-white">{userRole}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-[#C4D600]/40 bg-[#C4D600]/10 p-3 text-[11px] text-slate-600 dark:text-slate-300">
                A edição de perfil não está disponível nesta tela. Administradores podem gerenciar os dados da equipe em Usuários.
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}