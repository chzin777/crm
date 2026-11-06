"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCrmTheme } from "@/hooks/useCrmTheme";
import { EntityDialog } from "@/components/EntityDialog";
import { FormSelect } from "@/components/FormSelect";
import { FormMultiSelect } from "@/components/FormMultiSelect";
import { BirthdayDatePicker } from "@/components/BirthdayDatePicker";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Stepper, { Step } from "@/components/Stepper";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import type { Contact, ContactCategory } from "@/lib/contacts";
import { useCrmData } from "@/hooks/useCrmData";
import { useToast } from "@/components/ToastProvider";
import {
  ArrowUpRight,
  Bell,
  CircleDollarSign,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  Check,
  ChevronUp,
  ChevronsUpDown,
} from "lucide-react";

type ContactFilter = "Todos" | "Clientes" | "Leads" | "NPS" | "Inativos";

const filters: ContactFilter[] = ["Todos", "Clientes", "Leads", "NPS", "Inativos"];
const contactCategoryOptions: ContactCategory[] = ["cliente", "lead", "nps", "inativo"];
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

const formatDateBR = (value: string | null | undefined) => {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};
const isValidEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validBrazilianAreaCodes = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38", "41", "42", "43", "44", "45", "46", "47",
  "48", "49", "51", "53", "54", "55", "61", "62", "63", "64", "65", "66", "67", "68",
  "69", "71", "73", "74", "75", "77", "79", "81", "82", "83", "84", "85", "86", "87",
  "88", "89", "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

const formatBrazilianPhone = (value: string) => {
  let digits = value.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  const subscriber = digits.slice(2);
  const splitAt = digits.length > 10 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${subscriber.slice(0, splitAt)}-${subscriber.slice(splitAt)}`;
};

const isValidBrazilianPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10 && digits.length !== 11) return false;
  if (!validBrazilianAreaCodes.has(digits.slice(0, 2))) return false;
  const subscriber = digits.slice(2);
  return digits.length === 11 ? /^9\d{8}$/.test(subscriber) : /^[2-5]\d{7}$/.test(subscriber);
};

type ContactTab = "dados" | "perfil" | "historico" | "comunicacoes";

const contactTabs: { key: ContactTab; label: string }[] = [
  { key: "dados", label: "Dados" },
  { key: "perfil", label: "Perfil" },
  { key: "historico", label: "Histórico" },
  { key: "comunicacoes", label: "Comunicações" },
];

function ContactEditTabs({
  form,
  setForm,
  formError,
  setFormError,
  selectedContact,
  segmentOptions,
  contactCategoryOptions,
  contactCategoryNames,
  categoryStyles,
  currency,
  saveContact,
}: {
  form: { nome: string; telefone: string; email: string; dataNascimento: string; categoria: ContactCategory; segmento: string[] };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  formError: string;
  setFormError: React.Dispatch<React.SetStateAction<string>>;
  selectedContact: Contact;
  segmentOptions: string[];
  contactCategoryOptions: ContactCategory[];
  contactCategoryNames: Record<ContactCategory, string>;
  categoryStyles: Record<ContactCategory, string>;
  currency: (value: number) => string;
  saveContact: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ContactTab>("dados");
  const initialFormRef = useRef(form);
  const hasChanges = form.nome !== initialFormRef.current.nome || form.telefone !== initialFormRef.current.telefone || form.email !== initialFormRef.current.email || form.dataNascimento !== initialFormRef.current.dataNascimento || form.categoria !== initialFormRef.current.categoria || JSON.stringify(form.segmento) !== JSON.stringify(initialFormRef.current.segmento);
  const [purchases, setPurchases] = useState<{ produto: string; data: string; valor: string }[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [communications, setCommunications] = useState<{
    whatsapp: { id: string; status: string; sentAt: string | null; deliveredAt: string | null; readAt: string | null; repliedAt: string | null; failedAt: string | null; failureReason: string | null; createdAt: string }[];
    inbound: { id: string; text: string; mediaType: string | null; receivedAt: string }[];
    emails: { id: string; subject: string; status: string; sentAt: string | null }[];
    contactPhone: string;
    contactEmail: string;
  }>({ whatsapp: [], inbound: [], emails: [], contactPhone: "", contactEmail: "" });
  const [commsLoading, setCommsLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "historico") return;
    let cancelled = false;
    setPurchasesLoading(true);
    fetch(`/api/contacts/${encodeURIComponent(selectedContact.id)}/purchases`)
      .then((res) => res.json())
      .then((result) => {
        if (!cancelled && Array.isArray(result.data)) setPurchases(result.data);
      })
      .catch(() => {
        if (!cancelled) setPurchases([]);
      })
      .finally(() => {
        if (!cancelled) setPurchasesLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, selectedContact.id]);

  useEffect(() => {
    if (activeTab !== "comunicacoes") return;
    let cancelled = false;
    setCommsLoading(true);
    fetch(`/api/contacts/${encodeURIComponent(selectedContact.id)}/communications`)
      .then((res) => res.json())
      .then((result) => {
        if (!cancelled && result.data) setCommunications(result.data);
      })
      .catch(() => {
        if (!cancelled) setCommunications({ whatsapp: [], inbound: [], emails: [], contactPhone: "", contactEmail: "" });
      })
      .finally(() => {
        if (!cancelled) setCommsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, selectedContact.id]);

  const formatDateDisplay = (value: string | null | undefined) => {
    if (!value) return "—";
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (brMatch) return value;
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    } catch { /* ignore */ }
    return value;
  };

  const infoFieldClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]";
  const labelClass = "block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tab navigation */}
      <div className="shrink-0 border-b border-slate-100 dark:border-slate-800">
        <nav role="tablist" className="flex gap-1 px-1">
          {contactTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${
                activeTab === tab.key
                  ? "text-[#002187] dark:text-[#C4D600]"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#002187] dark:bg-[#C4D600]" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content — fixed height container */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-4">
        {activeTab === "dados" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <span className={`grid h-11 w-11 place-items-center rounded-full text-xs font-bold ${categoryStyles[form.categoria]}`}>
                {form.nome.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryStyles[form.categoria]}`}>
                  {form.segmento.length > 0 ? form.segmento.join(", ") : contactCategoryNames[form.categoria]}
                </span>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{formatBrazilianPhone(form.telefone)}</p>
              </div>
            </div>
            <label className={labelClass}>
              <span>Nome completo <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span>
              <input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className={infoFieldClass} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                <span>Telefone <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span>
                <input type="tel" value={form.telefone} onChange={(event) => { setForm({ ...form, telefone: event.target.value }); setFormError(""); }} className={infoFieldClass} />
              </label>
              <label className={labelClass}>
                E-mail
                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={infoFieldClass} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Nascimento
                <input type="date" value={form.dataNascimento} onChange={(event) => setForm({ ...form, dataNascimento: event.target.value })} className={infoFieldClass} />
              </label>
              <label className={labelClass}>
                CPF
                <input type="text" readOnly value={selectedContact.cpf ?? ""} placeholder="Não informado" className={`${infoFieldClass} cursor-not-allowed opacity-60`} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Gênero
                <input type="text" readOnly value={selectedContact.genero ?? ""} placeholder="Não informado" className={`${infoFieldClass} cursor-not-allowed opacity-60`} />
              </label>
              <label className={labelClass}>
                Ocupação
                <input type="text" readOnly value={selectedContact.ocupacao ?? ""} placeholder="Não informado" className={`${infoFieldClass} cursor-not-allowed opacity-60`} />
              </label>
            </div>
            {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
          </div>
        )}

        {activeTab === "perfil" && (
          <div className="space-y-4">
            <FormSelect
              label="Categoria"
              value={contactCategoryNames[form.categoria]}
              options={contactCategoryOptions.map((category) => contactCategoryNames[category])}
              onChange={(value) => setForm({ ...form, categoria: contactCategoryOptions.find((category) => contactCategoryNames[category] === value) ?? "lead" })}
            />
            <FormMultiSelect
              label="Perfil / segmento"
              ariaLabel="Segmento"
              selected={form.segmento}
              options={segmentOptions}
              onChange={(segmento) => { setForm({ ...form, segmento }); setFormError(""); }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Loja
                <input type="text" readOnly value={selectedContact.loja ?? ""} placeholder="Não informada" className={`${infoFieldClass} cursor-not-allowed opacity-60`} />
              </label>
              <label className={labelClass}>
                Cidade
                <input type="text" readOnly value={selectedContact.cidade ?? ""} placeholder="Não informada" className={`${infoFieldClass} cursor-not-allowed opacity-60`} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Bairro
                <input type="text" readOnly value={selectedContact.bairro ?? ""} placeholder="Não informado" className={`${infoFieldClass} cursor-not-allowed opacity-60`} />
              </label>
              <label className={labelClass}>
                Estado
                <input type="text" readOnly value={selectedContact.estado ?? ""} placeholder="Não informado" className={`${infoFieldClass} cursor-not-allowed opacity-60`} />
              </label>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <dt className="text-[10px] text-slate-500 dark:text-slate-400">Último contato</dt>
                <dd className="mt-1 text-xs text-slate-900 dark:text-white">{formatDateDisplay(selectedContact.ultimoContato)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <dt className="text-[10px] text-slate-500 dark:text-slate-400">Compras · Total gasto</dt>
                <dd className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">{selectedContact.compras} · {currency(selectedContact.totalGasto)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <dt className="text-[10px] text-slate-500 dark:text-slate-400">Última compra</dt>
                <dd className="mt-1 text-xs text-slate-900 dark:text-white">{formatDateDisplay(selectedContact.ultimaCompra)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <dt className="text-[10px] text-slate-500 dark:text-slate-400">Prescrição validade</dt>
                <dd className="mt-1 text-xs text-slate-900 dark:text-white">{formatDateDisplay(selectedContact.prescricaoValidade)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <dt className="text-[10px] text-slate-500 dark:text-slate-400">Cadastrado em</dt>
                <dd className="mt-1 text-xs text-slate-900 dark:text-white">{formatDateDisplay(selectedContact.criadoEm)}</dd>
              </div>
              {selectedContact.npsRatings && selectedContact.npsRatings.length > 0 && (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <dt className="text-[10px] text-slate-500 dark:text-slate-400">NPS ({selectedContact.npsRatings.length} avaliações)</dt>
                  <dd className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">
                    {(selectedContact.npsRatings.reduce((a, b) => a + b, 0) / selectedContact.npsRatings.length).toFixed(1)} média
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {activeTab === "historico" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Histórico de compras</h3>
            {purchasesLoading ? (
              <LoadingSpinner label="Carregando compras..." className="w-full justify-center py-8" />
            ) : purchases.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
                <CircleDollarSign className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Nenhuma compra registrada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {purchases.map((purchase, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{purchase.produto}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{formatDateDisplay(purchase.data)}</p>
                    </div>
                    <span className="ml-3 shrink-0 text-xs font-bold text-slate-900 dark:text-white">{purchase.valor}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "comunicacoes" && (
          <div className="space-y-4">
            {commsLoading ? (
              <LoadingSpinner label="Carregando comunicações..." className="w-full justify-center py-8" />
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">WhatsApp</h3>
                    <a
                      href={`https://wa.me/55${communications.contactPhone.replace(/\D/g, "") || form.telefone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#051647] px-2.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer"
                    >
                      <WhatsAppIcon className="h-3 w-3 fill-current" />
                      Abrir conversa
                      <ArrowUpRight className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Mensagens enviadas via campanhas do CRM.</p>
                </div>
                {communications.whatsapp.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center dark:border-slate-700">
                    <WhatsAppIcon className="mx-auto h-5 w-5 fill-slate-400" />
                    <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Nenhuma mensagem enviada</p>
                    <p className="mt-1 text-[10px] text-slate-400">As mensagens de WhatsApp enviadas por campanhas aparecerão aqui.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {communications.whatsapp.map((msg) => {
                      const statusLabel: Record<string, string> = { queued: "Na fila", sent: "Enviada", delivered: "Entregue", read: "Lida", replied: "Respondida", failed: "Falhou" };
                      const statusColor: Record<string, string> = {
                        queued: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                        sent: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                        delivered: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                        read: "bg-[#C4D600]/15 text-[#051647] dark:bg-[#C4D600]/20 dark:text-[#C4D600]",
                        replied: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
                        failed: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                      };
                      return (
                        <div key={msg.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                          <div className="min-w-0 flex-1">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor[msg.status] ?? statusColor.queued}`}>
                              {statusLabel[msg.status] ?? msg.status}
                            </span>
                            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                              {formatDateDisplay(msg.sentAt ?? msg.createdAt)}
                              {msg.failureReason && <span className="ml-2 text-red-500">· {msg.failureReason.slice(0, 60)}</span>}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {communications.inbound.length > 0 && (
                  <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Mensagens recebidas</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Respostas do contato via WhatsApp.</p>
                    <div className="mt-2 space-y-2">
                      {communications.inbound.map((msg) => (
                        <div key={msg.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                          <p className="text-xs text-slate-900 dark:text-white">{msg.text || (msg.mediaType ? `📎 ${msg.mediaType}` : "Mensagem sem texto")}</p>
                          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{formatDateDisplay(msg.receivedAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">E-mails enviados</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comunicações por e-mail via Resend.</p>
                </div>
                {communications.emails.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center dark:border-slate-700">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-5 w-5 text-slate-400">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Nenhum e-mail registrado</p>
                    <p className="mt-1 text-[10px] text-slate-400">Os e-mails enviados via Resend aparecerão aqui quando integrados ao histórico do contato.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {communications.emails.map((email) => (
                      <div key={email.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{email.subject}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{formatDateDisplay(email.sentAt)} · {email.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer actions — always visible */}
      <footer className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setFormError("");
            setForm({
              nome: selectedContact.nome,
              telefone: selectedContact.telefone,
              email: selectedContact.email,
              dataNascimento: toDateInput(selectedContact.dataNascimento),
              categoria: selectedContact.categoria,
              segmento: selectedContact.segmento ? selectedContact.segmento.split(",").map((s) => s.trim()).filter(Boolean) : [],
            });
          }}
          className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
        >
          Descartar alterações
        </button>
        <button
          type="button"
          disabled={!hasChanges}
          onClick={() => { saveContact(); initialFormRef.current = { ...form }; }}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${
            hasChanges
              ? "bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:brightness-95"
              : "bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
          Salvar alterações
        </button>
      </footer>
    </div>
  );
}

export default function ContatosPage() {
  const { isDark } = useCrmTheme();
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const term = new URLSearchParams(window.location.search).get("busca");
    if (term) setSearchTerm(term);
  }, []);
  const [activeFilter, setActiveFilter] = useState<ContactFilter>("Todos");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const { data: segments } = useCrmData<{ id: string; nome: string }[]>("segments", []);
  const segmentOptions = [...new Set([
    ...segments.map((segment) => segment.nome),
    ...contacts.map((contact) => contact.segmento.trim()).filter(Boolean),
  ])];
  const [contactsLoading, setContactsLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 0 });
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", dataNascimento: "", categoria: "lead" as ContactCategory, segmento: [] as string[] });
  const [sortConfig, setSortConfig] = useState<{ field: string; order: "asc" | "desc" }>({ field: "ultimoContato", order: "desc" });

  const handleSort = useCallback((field: string) => {
    setSortConfig((prev) => {
      const nextOrder = prev.field === field && prev.order === "desc" ? "asc" : "desc";
      return { field, order: nextOrder };
    });
  }, []);

  const SortIndicator = ({ field }: { field: string }) => {
    const isActive = sortConfig.field === field;
    if (!isActive) return <ChevronsUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />;
    return <ChevronUp className={`h-3 w-3 transition-transform ${sortConfig.order === "desc" ? "rotate-180" : ""} text-[#002187] dark:text-[#C4D600]`} />;
  };

  const categoryToApiFilter: Record<ContactFilter, string> = {
    Todos: "",
    Clientes: "", // handled client-side via compras > 0 since API doesn't have this filter
    Leads: "lead",
    NPS: "nps",
    Inativos: "inativo",
  };

  const fetchContacts = useCallback(async (page = 1, search = "", filter: ContactFilter = "Todos", size?: number, sort?: { field: string; order: "asc" | "desc" }) => {
    setContactsLoading(true);
    setDataError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(size ?? pagination.pageSize));
      if (search) params.set("search", search);
      const apiCategory = categoryToApiFilter[filter];
      if (apiCategory) params.set("category", apiCategory);
      const activeSort = sort ?? sortConfig;
      params.set("sortBy", activeSort.field);
      params.set("sortOrder", activeSort.order);

      const response = await fetch(`/api/contacts?${params.toString()}`);
      const result = await response.json() as { data?: Contact[]; error?: string; pagination?: typeof pagination };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os contatos.");
      setContacts(result.data ?? []);
      if (result.pagination) setPagination(result.pagination);
    } catch (error: unknown) {
      setDataError(error instanceof Error ? error.message : "Não foi possível carregar os contatos.");
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts(1, searchTerm, activeFilter, undefined, sortConfig);
  }, [activeFilter, sortConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchContacts(1, searchTerm, activeFilter, undefined, sortConfig);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, sortConfig]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Stats are computed from the current page of contacts (server-side pagination)
  const totalSpent = contacts.reduce((sum, contact) => sum + contact.totalGasto, 0);
  const clientsWithPurchases = contacts.filter((contact) => contact.compras > 0).length;
  const openLeads = contacts.filter((contact) => contact.categoria === "lead").length;
  const inactiveContacts = contacts.filter((contact) => contact.categoria === "inativo").length;

  const addContact = async () => {
    const nome = form.nome.trim();
    const telefone = form.telefone.trim();
    if (!nome || !isValidBrazilianPhone(telefone)) {
      setFormError(!nome ? "Informe o nome do contato." : "Informe um telefone brasileiro válido com DDD.");
      return;
    }
    if (!isValidEmail(form.email.trim())) {
      setFormError("Informe um e-mail válido.");
      return;
    }
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          telefone,
          email: form.email.trim(),
          dataNascimento: fromDateInput(form.dataNascimento),
          categoria: form.categoria,
          segmento: form.segmento.join(", "),
        }),
      });
      const result = await response.json() as { data?: Contact; error?: string };
      const savedContact = result.data;
      if (!response.ok || !savedContact) throw new Error(result.error || "Não foi possível salvar o contato.");
      setContacts((current) => [savedContact, ...current]);
      toast.success("Contato adicionado", `${savedContact.nome} foi cadastrado.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o contato.";
      setFormError(message);
      toast.error("Erro ao adicionar contato", message);
      return;
    }
    setActiveFilter("Todos");
    setSearchTerm("");
    setForm({ nome: "", telefone: "", email: "", dataNascimento: "", categoria: "lead", segmento: [] });
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
      segmento: contact.segmento ? contact.segmento.split(",").map((s) => s.trim()).filter(Boolean) : [],
    });
    setFormError("");
  };

  const saveContact = async () => {
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
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(selectedContact.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          telefone,
          email: form.email.trim(),
          dataNascimento: fromDateInput(form.dataNascimento),
          categoria: form.categoria,
          segmento: form.segmento.join(", ") || contactCategoryNames[form.categoria],
        }),
      });
      const result = await response.json() as { data?: Contact; error?: string };
      const savedContact = result.data;
      if (!response.ok || !savedContact) throw new Error(result.error || "Não foi possível atualizar o contato.");
      setContacts((current) => current.map((contact) => contact.id === savedContact.id ? savedContact : contact));
      setSelectedContact(savedContact);
      setFormError("");
      toast.success("Contato atualizado", `${savedContact.nome} foi salvo.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar o contato.";
      setFormError(message);
      toast.error("Erro ao atualizar contato", message);
    }
  };

  const metrics = [
    { label: "Contatos", value: contacts.length.toString(), detail: "na base", icon: Users, color: "bg-blue-50 text-[#002187] dark:bg-blue-950/50 dark:text-[#C4D600]" },
    { label: "Clientes compradores", value: clientsWithPurchases.toString(), detail: "com histórico de compras", icon: CircleDollarSign, color: "bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]" },
    { label: "Leads abertos", value: openLeads.toString(), detail: "aguardando conversão", icon: UserPlus, color: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]" },
    { label: "Valor comprado", value: currency(totalSpent), detail: "acumulado na base", icon: ArrowUpRight, color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  ];

  return (
    <div>
      <div className="flex-1 flex flex-col min-w-0">

        {/* Conteúdo */}
        <main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">
          {dataError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dataError}</p>}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Contatos</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Clientes, leads e oportunidades de relacionamento.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void fetchContacts(1, searchTerm, activeFilter, undefined, sortConfig)} disabled={contactsLoading} aria-label="Atualizar lista" title="Atualizar lista" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${contactsLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
              <button type="button" onClick={() => { setForm({ nome: "", telefone: "", email: "", dataNascimento: "", categoria: "lead", segmento: [] }); setFormError(""); setIsCreateOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-[#051647] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer">
                <Plus className="h-4 w-4" />
                Novo Contato
              </button>
            </div>
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

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <label className="relative block w-full sm:w-72 md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Nome, telefone ou e-mail"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Buscar contatos"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]"
              />
            </label>
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
                    className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${activeFilter === filter ? "bg-[#051647] text-white dark:bg-[#C4D600] dark:text-[#051647]" : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"}`}
                  >
                    {filter}<span className={`text-[10px] ${activeFilter === filter ? "opacity-75" : "text-slate-400"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07194f]">
            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Base de contatos</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Página {pagination.page.toLocaleString('pt-BR')} de {pagination.totalPages.toLocaleString('pt-BR')} ({pagination.total.toLocaleString('pt-BR')} contatos)</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-400 dark:bg-slate-800/40">
                  <tr>
                    <th className="px-5 py-3"><button type="button" onClick={() => handleSort("nome")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Contato<SortIndicator field="nome" /></button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => handleSort("segmento")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Perfil<SortIndicator field="segmento" /></button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => handleSort("ultimoContato")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Último contato<SortIndicator field="ultimoContato" /></button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => handleSort("dataNascimento")} className="inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Nascimento<SortIndicator field="dataNascimento" /></button></th>
                    <th className="px-4 py-3 text-right"><button type="button" onClick={() => handleSort("compras")} className="ml-auto inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Compras<SortIndicator field="compras" /></button></th>
                    <th className="px-5 py-3 text-right"><button type="button" onClick={() => handleSort("totalGasto")} className="ml-auto inline-flex items-center gap-1 cursor-pointer hover:cursor-pointer hover:text-slate-600 dark:hover:text-slate-200">Total gasto<SortIndicator field="totalGasto" /></button></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {contactsLoading && (
                    <tr><td colSpan={6} className="px-5 py-8">
                      <LoadingSpinner label="Carregando contatos..." className="w-full justify-center" />
                    </td></tr>
                  )}
                  {!contactsLoading && contacts.map((contact) => (
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
                            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{formatBrazilianPhone(contact.telefone)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${categoryStyles[contact.categoria]}`}>{contact.segmento}</span></td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{formatDateBR(contact.ultimoContato)}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{contact.dataNascimento ? formatDateBR(new Date(contact.dataNascimento).toISOString().slice(0, 10)) : "—"}</td>
                      <td className="px-4 py-3.5 text-right text-xs font-medium text-slate-700 dark:text-slate-200">{contact.compras}</td>
                      <td className="px-5 py-3.5 text-right text-xs font-bold text-slate-900 dark:text-white">{contact.totalGasto ? currency(contact.totalGasto) : "—"}</td>
                    </tr>
                  ))}
                  {!contactsLoading && contacts.length === 0 && (
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
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <span>Itens por página:</span>
                  <select
                    value={pagination.pageSize}
                    onChange={(e) => {
                      const size = Number(e.target.value);
                      setPagination((prev) => ({ ...prev, pageSize: size, page: 1 }));
                      fetchContacts(1, searchTerm, activeFilter, size, sortConfig);
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                  >
                    <option value={15}>15</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pagination.page <= 1 || contactsLoading}
                  onClick={() => fetchContacts(pagination.page - 1, searchTerm, activeFilter, undefined, sortConfig)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Anterior
                </button>
                <span>Página {pagination.page} de {pagination.totalPages}</span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || contactsLoading}
                  onClick={() => fetchContacts(pagination.page + 1, searchTerm, activeFilter, undefined, sortConfig)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Próxima
                </button>
              </div>
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
          size={!isCreateOpen && selectedContact ? "lg" : "md"}
        >
          {isCreateOpen ? (
            <Stepper
              initialStep={1}
              onStepChange={() => setFormError("")}
              onFinalStepCompleted={addContact}
              validateStep={(step) => {
                if (step === 1 && (!form.nome.trim() || !isValidBrazilianPhone(form.telefone) || !isValidEmail(form.email.trim()))) {
                  setFormError(!isValidEmail(form.email.trim()) ? "Informe um e-mail válido." : !form.nome.trim() ? "Informe o nome do contato." : "Informe um telefone brasileiro válido com DDD.");
                  return false;
                }
                if (step === 2 && form.segmento.length === 0) {
                  setFormError("Selecione pelo menos um segmento.");
                  return false;
                }
                if (step === 2 && !isValidEmail(form.email.trim())) {
                  setFormError("Informe um e-mail válido.");
                  return false;
                }
                if (step === 3 && (!form.nome.trim() || !isValidBrazilianPhone(form.telefone) || !isValidEmail(form.email.trim()))) {
                  setFormError(!isValidBrazilianPhone(form.telefone) ? "Informe um telefone brasileiro válido com DDD." : "Confira o nome e os dados do contato.");
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
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Nome completo <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><input value={form.nome} onChange={(event) => { setForm({ ...form, nome: event.target.value }); setFormError(""); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /></label>
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Telefone <span aria-hidden="true" className="text-red-600 dark:text-red-400">*</span></span><input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={15} placeholder="(11) 91234-5678" value={form.telefone} onChange={(event) => { setForm({ ...form, telefone: formatBrazilianPhone(event.target.value) }); setFormError(""); }} aria-describedby="new-contact-phone-hint" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#002187] dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600]" /><span id="new-contact-phone-hint" className="text-[10px] font-normal text-slate-400">Formato brasileiro com DDD. Ex.: (11) 91234-5678</span></label>
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
                  <FormMultiSelect
                    label="Segmento"
                    ariaLabel="Segmento"
                    selected={form.segmento}
                    options={segmentOptions}
                    onChange={(segmento) => { setForm({ ...form, segmento }); setFormError(""); }}
                    required
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
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">Categoria e segmento</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{contactCategoryNames[form.categoria]} · {form.segmento.length > 0 ? form.segmento.join(", ") : "Não selecionado"}</dd></div>
                    <div className="py-3"><dt className="text-[10px] font-bold uppercase text-slate-400">E-mail</dt><dd className="mt-1 break-all text-xs text-slate-700 dark:text-slate-200">{form.email || "Não informado"}</dd></div>
                  </dl>
                  {formError && <p role="alert" className="text-xs font-medium text-[#9a3d12] dark:text-[#F7915E]">{formError}</p>}
                </div>
              </Step>
            </Stepper>
          ) : selectedContact && (
            <ContactEditTabs
              form={form}
              setForm={setForm}
              formError={formError}
              setFormError={setFormError}
              selectedContact={selectedContact}
              segmentOptions={segmentOptions}
              contactCategoryOptions={contactCategoryOptions}
              contactCategoryNames={contactCategoryNames}
              categoryStyles={categoryStyles}
              currency={currency}
              saveContact={saveContact}
            />
          )}
        </EntityDialog>
      )}
    </div>
  );
}
