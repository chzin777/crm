"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { EntityDialog } from "@/components/EntityDialog";
import { FormSelect } from "@/components/FormSelect";
import { BirthdayDatePicker } from "@/components/BirthdayDatePicker";
import Stepper, { Step } from "@/components/Stepper";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { initialContacts, type Contact, type ContactCategory } from "@/lib/contacts";
import { initialSegmentNames } from "@/lib/segments";
import {
  ArrowUpRight,
  Bell,
  CircleDollarSign,
  Plus,
  Search,
  UserPlus,
  Users,
  Check,
} from "lucide-react";

type ContactFilter = "Todos" | "Clientes" | "Leads" | "NPS" | "Inativos";

const filters: ContactFilter[] = ["Todos", "Clientes", "Leads", "NPS", "Inativos"];
const contactCategoryOptions: ContactCategory[] = ["cliente", "lead", "nps", "inativo"];
const segmentOptions = Object.values(initialSegmentNames);
const contactCategoryNames: Record<ContactCategory, string> = {
  cliente: "Cliente",
  lead: "Lead",
  nps: "NPS",
  inativo: "Inativo",
};

const categoryStyles: Record<ContactCategory, string> = {
  cliente: "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]",
  lead: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
  nps: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  inativo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

const toDateInput = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

const fromDateInput = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};
const isValidEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function ContatosPage() {
  const [isDark, setIsDark] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<ContactFilter>("Todos");
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", dataNascimento: "", categoria: "lead" as ContactCategory, segmento: "" });

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("otb-crm-theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("otb-crm-theme", "light");
      }
      return next;
    });
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("otb-crm-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  useEffect(() => {
    if (!selectedContact && !isCreateOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedContact(null);
        setIsCreateOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedContact, isCreateOpen]);

  const filteredContacts = contacts.filter((contact) => {
    const query = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const matchesQuery = `${contact.nome} ${contact.telefone} ${contact.email} ${contact.segmento}`.toLocaleLowerCase("pt-BR").includes(query);
    const matchesFilter = activeFilter === "Todos"
      || (activeFilter === "Clientes" && contact.compras > 0)
      || (activeFilter === "Leads" && contact.categoria === "lead")
      || (activeFilter === "NPS" && contact.categoria === "nps")
      || (activeFilter === "Inativos" && contact.categoria === "inativo");
    return matchesQuery && matchesFilter;
  });

  const totalSpent = contacts.reduce((sum, contact) => sum + contact.totalGasto, 0);
  const clientsWithPurchases = contacts.filter((contact) => contact.compras > 0).length;
  const openLeads = contacts.filter((contact) => contact.categoria === "lead").length;
  const inactiveContacts = contacts.filter((contact) => contact.categoria === "inativo").length;

  const addContact = () => {
    const nome = form.nome.trim();
    const telefone = form.telefone.trim();
    if (!nome || !telefone) {
      setFormError("Informe o nome e o telefone do contato.");
      return;
    }
    if (!isValidEmail(form.email.trim())) {
      setFormError("Informe um e-mail válido.");
      return;
    }
    const initials = nome.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    setContacts((current) => [{
      id: `ct-${Date.now()}`,
      nome,
      telefone,
      email: form.email.trim(),
      dataNascimento: fromDateInput(form.dataNascimento),
      categoria: form.categoria,
      segmento: form.segmento,
      ultimoContato: "Agora",
      compras: 0,
      totalGasto: 0,
      iniciais: initials,
    }, ...current]);
    setActiveFilter("Todos");
    setSearchTerm("");
    setForm({ nome: "", telefone: "", email: "", dataNascimento: "", categoria: "lead", segmento: "" });
    setFormError("");
    setIsCreateOpen(false);
  };

  const startEditingContact = (contact: Contact) => {
    setSelectedContact(contact);
    setForm({
      nome: contact.nome,
      telefone: contact.telefone,
      email: contact.email,
      dataNascimento: toDateInput(contact.dataNascimento),
      categoria: contact.categoria,
      segmento: contact.segmento,
    });
    setFormError("");
  };

  const saveContact = () => {
    if (!selectedContact) return;
    const nome = form.nome.trim();
    const telefone = form.telefone.trim();
    if (!nome || !telefone) {
      setFormError("Informe o nome e o telefone do contato.");
      return;
    }
    if (!isValidEmail(form.email.trim())) {
      setFormError("Informe um e-mail válido.");
      return;
    }
    const updatedContact = {
      ...selectedContact,
      nome,
      telefone,
      email: form.email.trim(),
      dataNascimento: fromDateInput(form.dataNascimento),
      categoria: form.categoria,
      segmento: form.segmento.trim() || contactCategoryNames[form.categoria],
      iniciais: nome.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    };
    setContacts((current) => current.map((contact) => contact.id === updatedContact.id ? updatedContact : contact));
    setSelectedContact(updatedContact);
    setFormError("");
  };

  const metrics = [
    { label: "Contatos", value: contacts.length.toString(), detail: "na base", icon: Users, color: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Clientes compradores", value: clientsWithPurchases.toString(), detail: "com histórico de compras", icon: CircleDollarSign, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
    { label: "Leads abertos", value: openLeads.toString(), detail: "aguardando conversão", icon: UserPlus, color: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]" },
    { label: "Valor comprado", value: currency(totalSpent), detail: "acumulado na base", icon: ArrowUpRight, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  ];

  return (
    <div className="flex min-h-screen bg-[#f4f5f8] dark:bg-[#030d29] text-slate-800 dark:text-slate-100 transition-colors">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar estilo Dribbble */}
        <header className="h-16 mx-4 mt-4 bg-white dark:bg-[#051647] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm px-6 flex items-center justify-between gap-4">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-300">
            Workspace <span className="text-slate-300 dark:text-slate-600">/</span> <strong className="text-slate-900 dark:text-white">Contatos & Clientes</strong>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <button type="button" className="topbar-icon-button text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer hover:cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => { setForm({ nome: "", telefone: "", email: "", dataNascimento: "", categoria: "lead", segmento: "" }); setFormError(""); setIsCreateOpen(true); }} className="topbar-action-button bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              <Plus className="w-4 h-4" /> Novo Contato
            </button>
          </div>
        </header>

        {/* Conteúdo */}
        <main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Contatos</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Clientes, leads e oportunidades de relacionamento.</p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Base atualizada hoje</span>
          </div>

          <section aria-label="Resumo da base" className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{metric.value}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{metric.detail}</p>
                    </div>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${metric.color}`}><Icon className="h-4 w-4" /></span>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Base de contatos</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filteredContacts.length} de {contacts.length} contatos</p>
                </div>
                <label className="relative block w-full lg:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Nome, telefone ou e-mail"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    aria-label="Buscar contatos"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:focus:border-[#C4D600]"
                  />
                </label>
              </div>

              <div role="tablist" aria-label="Filtrar contatos" className="flex flex-wrap gap-1.5">
                {filters.map((filter) => {
                  const count = filter === "Todos" ? contacts.length
                    : filter === "Clientes" ? clientsWithPurchases
                    : filter === "Leads" ? openLeads
                    : filter === "NPS" ? contacts.filter((contact) => contact.categoria === "nps").length
                    : inactiveContacts;
                  return (
                    <button
                      key={filter}
                      type="button"
                      role="tab"
                      aria-selected={activeFilter === filter}
                      onClick={() => setActiveFilter(filter)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${activeFilter === filter ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"}`}
                    >
                      {filter}<span className={`text-[10px] ${activeFilter === filter ? "opacity-75" : "text-slate-400"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800/40">
                  <tr>
                    <th className="px-5 py-3">Contato</th>
                    <th className="px-4 py-3">Perfil</th>
                    <th className="px-4 py-3">Último contato</th>
                    <th className="px-4 py-3">Nascimento</th>
                    <th className="px-4 py-3 text-right">Compras</th>
                    <th className="px-5 py-3 text-right">Total gasto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      tabIndex={0}
                      aria-label={`Abrir detalhes de ${contact.nome}`}
                      onClick={() => startEditingContact(contact)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          startEditingContact(contact);
                        }
                      }}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/80 focus-visible:outline-2 focus-visible:outline-[#002187] dark:hover:bg-slate-800/30 dark:focus-visible:outline-[#C4D600]"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-bold ${categoryStyles[contact.categoria]}`}>{contact.iniciais}</span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900 group-hover:text-[#002187] dark:text-white dark:group-hover:text-[#C4D600]">{contact.nome}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{contact.telefone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${categoryStyles[contact.categoria]}`}>{contact.segmento}</span></td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{contact.ultimoContato}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{contact.dataNascimento}</td>
                      <td className="px-4 py-3.5 text-right text-xs font-medium text-slate-700 dark:text-slate-200">{contact.compras}</td>
                      <td className="px-5 py-3.5 text-right text-xs font-bold text-slate-900 dark:text-white">{contact.totalGasto ? currency(contact.totalGasto) : "—"}</td>
                    </tr>
                  ))}
                  {filteredContacts.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-14 text-center">
                      <Search className="mx-auto h-5 w-5 text-slate-400" />
                      <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum contato encontrado</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente mudar a busca ou o filtro.</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 dark:border-slate-800">
              <span>Mostrando {filteredContacts.length} de {contacts.length} contatos</span>
              <span>Dados demonstrativos</span>
            </footer>
          </section>
        </main>
      </div>

      {(selectedContact || isCreateOpen) && (
        <EntityDialog
          titleId="contact-dialog-title"
          title={isCreateOpen ? "Novo contato" : selectedContact?.nome ?? "Contato"}
          description={isCreateOpen ? "Cadastre um cliente ou lead na base." : "Edite os dados e o perfil deste contato ou cliente."}
          onClose={() => { setSelectedContact(null); setIsCreateOpen(false); setFormError(""); }}
        >
          {isCreateOpen ? (
            <Stepper
              initialStep={1}
              onStepChange={() => setFormError("")}
              onFinalStepCompleted={addContact}
              validateStep={(step) => {
                if (step === 1 && (!form.nome.trim() || !form.telefone.trim() || !isValidEmail(form.email.trim()))) {
                  setFormError(!isValidEmail(form.email.trim()) ? "Informe um e-mail válido." : "Informe o nome e o telefone do contato.");
                  return false;
                }
                if (step === 2 && !segmentOptions.some((segment) => segment === form.segmento)) {
                  setFormError("Selecione um segmento existente.");
                  return false;
                }
                if (step === 2 && !isValidEmail(form.email.trim())) {
                  setFormError("Informe um e-mail válido.");
                  return false;
                }
                if (step === 3 && (!form.nome.trim() || !form.telefone.trim() || !isValidEmail(form.email.trim()))) {
                  setFormError("Confira o nome e o telefone do contato.");
                  return false;
                }
                setFormError("");
                return true;
              }}
              backButtonText="Voltar"
              nextButtonText="Continuar"
              completeButtonText="Salvar contato"
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
              <Step title="Identificação" description="Dados pessoais">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Dados do contato</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Informe como podemos identificar e falar com essa pessoa.</p></div>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome completo *</span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Telefone *</span><input type="tel" value={form.telefone} onChange={(event) => { setForm({ ...form, telefone: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
              <Step title="Perfil" description="Classificação e contato">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Perfil do contato</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Classifique a categoria e escolha um segmento existente.</p></div>
                  <FormSelect
                    label="Categoria"
                    value={contactCategoryNames[form.categoria]}
                    options={contactCategoryOptions.map((category) => contactCategoryNames[category])}
                    onChange={(value) => setForm({ ...form, categoria: contactCategoryOptions.find((category) => contactCategoryNames[category] === value) ?? "lead" })}
                  />
                  <FormSelect
                    label="Segmento"
                    ariaLabel="Segmento"
                    value={form.segmento || "Selecione um segmento"}
                    options={segmentOptions}
                    onChange={(segmento) => { setForm({ ...form, segmento }); setFormError(""); }}
                  />
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  <BirthdayDatePicker value={form.dataNascimento} onChange={(dataNascimento) => setForm({ ...form, dataNascimento })} />
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
              <Step title="Revisão" description="Confira os dados">
                <div className="space-y-4">
                  <div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Revise o contato</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Confirme os dados antes de adicionar à base.</p></div>
                  <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Nome</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{form.nome || "Não informado"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Telefone</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{form.telefone || "Não informado"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Categoria e segmento</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{contactCategoryNames[form.categoria]} · {form.segmento || "Não selecionado"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">E-mail</dt><dd className="mt-1 break-all text-xs text-slate-700 dark:text-slate-200">{form.email || "Não informado"}</dd></div>
                  </dl>
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
            </Stepper>
          ) : selectedContact && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <span className={`grid h-11 w-11 place-items-center rounded-full text-xs font-bold ${categoryStyles[form.categoria]}`}>{form.nome.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryStyles[form.categoria]}`}>{form.segmento || contactCategoryNames[form.categoria]}</span>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{form.telefone}</p>
                  </div>
                </div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome completo</span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Telefone</span><input type="tel" value={form.telefone} onChange={(event) => { setForm({ ...form, telefone: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  <FormSelect label="Categoria" value={contactCategoryNames[form.categoria]} options={contactCategoryOptions.map((category) => contactCategoryNames[category])} onChange={(value) => setForm({ ...form, categoria: contactCategoryOptions.find((category) => contactCategoryNames[category] === value) ?? "lead" })} />
                </div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Perfil / segmento</span><input value={form.segmento} onChange={(event) => setForm({ ...form, segmento: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Nascimento<input type="date" value={form.dataNascimento} onChange={(event) => setForm({ ...form, dataNascimento: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Último contato</dt><dd className="mt-1 text-xs text-slate-900 dark:text-white">{selectedContact.ultimoContato}</dd></div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Compras · Total gasto</dt><dd className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">{selectedContact.compras} · {currency(selectedContact.totalGasto)}</dd></div>
                </dl>
                {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                <a href={`https://wa.me/55${form.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#051647] text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"><WhatsAppIcon className="h-4 w-4 fill-current" />Conversar no WhatsApp<ArrowUpRight className="h-3.5 w-3.5" /></a>
              </div>
              <footer className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button type="button" onClick={() => { setFormError(""); setForm({ nome: selectedContact.nome, telefone: selectedContact.telefone, email: selectedContact.email, dataNascimento: toDateInput(selectedContact.dataNascimento), categoria: selectedContact.categoria, segmento: selectedContact.segmento }); }} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Descartar alterações</button>
                <button type="button" onClick={saveContact} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer"><Check className="h-3.5 w-3.5" />Salvar alterações</button>
              </footer>
            </div>
          )}
        </EntityDialog>
      )}
    </div>
  );
}
