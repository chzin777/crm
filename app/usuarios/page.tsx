"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Plus, ShieldCheck, Users } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { EntityDialog } from "@/components/EntityDialog";
import { FormSelect } from "@/components/FormSelect";
import Stepper, { Step } from "@/components/Stepper";

type UserRole = "Administrador" | "Supervisor" | "Operador";

interface TeamUser {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  nivel: UserRole;
}

const initialUsers: TeamUser[] = [
  { id: "usr-1", nome: "Ana Paula Silva", email: "ana.paula@oticasbrasil.com.br", cargo: "Coordenadora de Marketing", nivel: "Administrador" },
  { id: "usr-2", nome: "Camila Guimarães", email: "camila.g@oticasbrasil.com.br", cargo: "Atendimento & Balcão", nivel: "Operador" },
  { id: "usr-3", nome: "Marcos Vinícius", email: "marcos.v@oticasbrasil.com.br", cargo: "Atendimento & Balcão", nivel: "Operador" },
  { id: "usr-4", nome: "Felipe Nogueira", email: "felipe.n@oticasbrasil.com.br", cargo: "Gestor Comercial", nivel: "Supervisor" },
];

const roles: UserRole[] = ["Administrador", "Supervisor", "Operador"];
const toUserRole = (value: string): UserRole => roles.find((role) => role === value) ?? "Operador";
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function UsuariosPage() {
  const [isDark, setIsDark] = useState(false);
  const [usuarios, setUsuarios] = useState(initialUsers);
  const [selectedUser, setSelectedUser] = useState<TeamUser | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", cargo: "", nivel: "Operador" as UserRole });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const savedTheme = localStorage.getItem("otb-crm-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  useEffect(() => {
    if (!selectedUser && !isCreateOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedUser(null);
        setIsCreateOpen(false);
        setFormError("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedUser, isCreateOpen]);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("otb-crm-theme", next ? "dark" : "light");
      return next;
    });
  };

  const startEditingUser = (user: TeamUser) => {
    setSelectedUser(user);
    setForm({ nome: user.nome, email: user.email, cargo: user.cargo, nivel: user.nivel });
    setFormError("");
  };

  const validateStep = (step: number) => {
    if (step === 1 && (!form.nome.trim() || !isValidEmail(form.email.trim()))) {
      setFormError(form.nome.trim() ? "Informe um e-mail válido." : "Informe o nome e o e-mail do usuário.");
      return false;
    }
    if (step === 2 && !form.cargo.trim()) {
      setFormError("Informe o cargo do usuário.");
      return false;
    }
    setFormError("");
    return true;
  };

  const createUser = () => {
    if (!validateStep(1) || !validateStep(2)) return;
    const user: TeamUser = {
      id: `usr-${Date.now()}`,
      nome: form.nome.trim(),
      email: form.email.trim(),
      cargo: form.cargo.trim(),
      nivel: form.nivel,
    };
    setUsuarios((current) => [user, ...current]);
    setSelectedUser(null);
    setIsCreateOpen(false);
    setForm({ nome: "", email: "", cargo: "", nivel: "Operador" });
    setFormError("");
  };

  const saveUser = () => {
    if (!selectedUser || !form.nome.trim() || !isValidEmail(form.email.trim()) || !form.cargo.trim()) {
      setFormError("Preencha nome, e-mail e cargo para salvar.");
      return;
    }
    const updatedUser = {
      ...selectedUser,
      nome: form.nome.trim(),
      email: form.email.trim(),
      cargo: form.cargo.trim(),
      nivel: form.nivel,
    };
    setUsuarios((current) => current.map((user) => user.id === updatedUser.id ? updatedUser : user));
    setSelectedUser(updatedUser);
    setFormError("");
  };

  const openCreate = () => {
    setForm({ nome: "", email: "", cargo: "", nivel: "Operador" });
    setFormError("");
    setIsCreateOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] dark:bg-[#030d29] text-slate-800 dark:text-slate-100 transition-colors">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 mx-4 mt-4 bg-white dark:bg-[#051647] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm px-6 flex items-center justify-between gap-4">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Usuários da Equipe</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" aria-label="Alertas" title="Alertas" className="topbar-icon-button text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
            <button type="button" onClick={openCreate} className="topbar-action-button bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              <Plus className="w-4 h-4" /> Convidar Usuário
            </button>
          </div>
        </header>

        <main className="space-y-6 p-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Equipe e Permissões</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Usuários com acesso ao funil de relacionamento e disparos de marketing</p>
          </div>

          <section aria-label="Usuários da equipe" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Membros da equipe</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{usuarios.length} usuários com acesso</p></div>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]"><Users className="h-4 w-4" /></span>
            </header>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {usuarios.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => startEditingUser(user)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#C4D600]/20 text-xs font-bold text-[#051647] dark:text-[#C4D600]">{user.nome.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                      <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{user.nome}</span><span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{user.email} · {user.cargo}</span></span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><ShieldCheck className="h-3.5 w-3.5" />{user.nivel}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>

      {(selectedUser || isCreateOpen) && (
        <EntityDialog
          titleId="user-dialog-title"
          title={isCreateOpen ? "Convidar usuário" : selectedUser?.nome ?? "Usuário"}
          description={isCreateOpen ? "Configure o acesso para um novo membro da equipe." : "Edite as informações e permissões deste usuário."}
          onClose={() => { setSelectedUser(null); setIsCreateOpen(false); setFormError(""); }}
        >
          {isCreateOpen ? (
            <Stepper
              initialStep={1}
              onStepChange={() => setFormError("")}
              onFinalStepCompleted={createUser}
              validateStep={validateStep}
              backButtonText="Voltar"
              nextButtonText="Continuar"
              completeButtonText="Enviar convite"
              indicator="numbers"
              orientation="horizontal"
              transition="slide"
              linear
              showFooter
              theme={isDark ? "dark" : "light"}
              accentColor="#C4D600"
              frame={false}
              radius={16}
              width="100%"
              className="min-h-0 flex-1"
            >
              <Step title="Identificação" description="Nome e e-mail">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Dados do usuário</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Informe o nome e o endereço para envio do convite.</p></div>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome completo *</span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>E-mail *</span><input type="email" value={form.email} onChange={(event) => { setForm({ ...form, email: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
              <Step title="Acesso" description="Cargo e permissões">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Defina o acesso</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Escolha o cargo e nível de permissão na plataforma.</p></div>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Cargo *</span><input value={form.cargo} onChange={(event) => { setForm({ ...form, cargo: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  <FormSelect label="Nível de permissão" value={form.nivel} options={roles} onChange={(nivel) => setForm({ ...form, nivel: toUserRole(nivel) })} />
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
              <Step title="Revisão" description="Confira o convite">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Revise as informações</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Um convite será preparado com estas permissões.</p></div>
                  <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Nome</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{form.nome || "Não informado"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">E-mail</dt><dd className="mt-1 break-all text-xs text-slate-700 dark:text-slate-200">{form.email || "Não informado"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Cargo</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{form.cargo || "Não informado"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Permissão</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{form.nivel}</dd></div>
                  </dl>
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
            </Stepper>
          ) : selectedUser && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#C4D600]/20 text-xs font-bold text-[#051647] dark:text-[#C4D600]">{form.nome.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                  <span><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300"><ShieldCheck className="h-3 w-3" />{form.nivel}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{form.cargo}</span></span>
                </div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome completo</span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>E-mail</span><input type="email" value={form.email} onChange={(event) => { setForm({ ...form, email: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Cargo</span><input value={form.cargo} onChange={(event) => { setForm({ ...form, cargo: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <FormSelect label="Nível de permissão" value={form.nivel} options={roles} onChange={(nivel) => setForm({ ...form, nivel: toUserRole(nivel) })} />
                {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
              </div>
              <footer className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button type="button" onClick={() => { setForm({ nome: selectedUser.nome, email: selectedUser.email, cargo: selectedUser.cargo, nivel: selectedUser.nivel }); setFormError(""); }} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Descartar alterações</button>
                <button type="button" onClick={saveUser} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer"><Check className="h-3.5 w-3.5" />Salvar alterações</button>
              </footer>
            </div>
          )}
        </EntityDialog>
      )}
    </div>
  );
}
