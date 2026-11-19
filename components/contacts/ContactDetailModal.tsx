"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Paperclip } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { ContactPrescriptionsTab } from "@/components/ContactPrescriptionsTab";
import { ContactCustomFields } from "@/components/ContactCustomFields";
import { ContactScoreTab } from "@/components/ContactScoreTab";
import { MarketingOptOutBadge } from "@/components/MarketingOptOutBadge";
import { FormSelect } from "@/components/FormSelect";
import { FormMultiSelect } from "@/components/FormMultiSelect";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ContactPurchaseHistory } from "@/components/contacts/ContactPurchaseHistory";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { useCrmData } from "@/hooks/useCrmData";
import { useToast } from "@/components/ToastProvider";
import type { Contact, ContactCategory } from "@/lib/contacts";

export const contactCategoryOptions: ContactCategory[] = ["cliente", "lead", "nps", "inativo"];
export const contactCategoryNames: Record<ContactCategory, string> = {
  cliente: "Cliente",
  lead: "Lead",
  nps: "NPS",
  inativo: "Inativo",
};

export const categoryStyles: Record<ContactCategory, string> = {
  cliente: "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]",
  lead: "bg-[#F7915E]/15 text-[#9a3d12] dark:text-[#F7915E]",
  nps: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  inativo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

export const toDateInput = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

export const fromDateInput = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

export const isValidEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const formatBrazilianPhone = (value: string) => {
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

export type ContactForm = { nome: string; telefone: string; email: string; dataNascimento: string; categoria: ContactCategory; segmento: string[] };

export const formFromContact = (contact: Contact): ContactForm => ({
  nome: contact.nome,
  telefone: contact.telefone,
  email: contact.email,
  dataNascimento: toDateInput(contact.dataNascimento),
  categoria: contact.categoria,
  segmento: contact.segmento ? contact.segmento.split(",").map((s) => s.trim()).filter(Boolean) : [],
});

export type ContactTab = "dados" | "perfil" | "pontuacao" | "campos" | "historico" | "receituario" | "comunicacoes";

const contactTabs: { key: ContactTab; label: string }[] = [
  { key: "dados", label: "Dados" },
  { key: "perfil", label: "Perfil" },
  { key: "pontuacao", label: "Pontuação" },
  { key: "campos", label: "Campos" },
  { key: "historico", label: "Histórico" },
  { key: "receituario", label: "Receituário" },
  { key: "comunicacoes", label: "Comunicações" },
];

/** Abas da ficha do contato (Dados, Perfil, Pontuação, Campos, Histórico, Receituário, Comunicações) com rodapé de salvar. */
export function ContactEditTabs({
  form,
  setForm,
  formError,
  setFormError,
  selectedContact,
  segmentOptions,
  saveContact,
  initialTab = "dados",
  onScoreChanged,
}: {
  form: ContactForm;
  setForm: React.Dispatch<React.SetStateAction<ContactForm>>;
  formError: string;
  setFormError: React.Dispatch<React.SetStateAction<string>>;
  selectedContact: Contact;
  segmentOptions: string[];
  saveContact: () => void;
  initialTab?: ContactTab;
  onScoreChanged?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ContactTab>(initialTab);
  const initialFormRef = useRef(form);
  const hasChanges = form.nome !== initialFormRef.current.nome || form.telefone !== initialFormRef.current.telefone || form.email !== initialFormRef.current.email || form.dataNascimento !== initialFormRef.current.dataNascimento || form.categoria !== initialFormRef.current.categoria || JSON.stringify(form.segmento) !== JSON.stringify(initialFormRef.current.segmento);
  const [communications, setCommunications] = useState<{
    whatsapp: { id: string; campaignName: string | null; status: string; sentAt: string | null; deliveredAt: string | null; readAt: string | null; repliedAt: string | null; failedAt: string | null; failureReason: string | null; createdAt: string }[];
    inbound: { id: string; text: string; mediaType: string | null; receivedAt: string }[];
    emails: { id: string; subject: string; status: string; sentAt: string | null }[];
    contactPhone: string;
    contactEmail: string;
  }>({ whatsapp: [], inbound: [], emails: [], contactPhone: "", contactEmail: "" });
  const [commsLoading, setCommsLoading] = useState(false);

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
        <nav role="tablist" className="flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {contactTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative shrink-0 px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${
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
                <div className="mt-1"><MarketingOptOutBadge contactId={selectedContact.id} /></div>
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

        {activeTab === "historico" && <ContactPurchaseHistory contactId={selectedContact.id} />}

        {activeTab === "receituario" && <ContactPrescriptionsTab contactId={selectedContact.id} />}

        {activeTab === "pontuacao" && <ContactScoreTab contactId={selectedContact.id} onChanged={onScoreChanged} />}

        {activeTab === "campos" && <ContactCustomFields contactId={selectedContact.id} canManage showScore={false} />}

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
                            {msg.campaignName && <p className="mt-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{msg.campaignName}</p>}
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
                          <p className="flex items-center gap-1 text-xs text-slate-900 dark:text-white">{msg.text || (msg.mediaType ? <><Paperclip className="h-3 w-3 shrink-0" aria-hidden />{msg.mediaType}</> : "Mensagem sem texto")}</p>
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
            setForm(formFromContact(selectedContact));
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

/**
 * Modal completo do contato aberto a partir de outras telas (ex.: linha do ranking em /clientes-vip): carrega a ficha,
 * mostra todas as abas e salva o cadastro pelo mesmo endpoint de /contatos.
 */
export function ContactDetailModal({ contactId, initialTab = "dados", onClose, onChanged }: { contactId: string; initialTab?: ContactTab; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const { data: segments } = useCrmData<{ id: string; nome: string }[]>("segments", [], { autoSave: false });
  const [contact, setContact] = useState<Contact | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<ContactForm | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/contacts/${encodeURIComponent(contactId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { data?: Contact; error?: string };
        if (!response.ok || !result.data) throw new Error(result.error);
        if (!active) return;
        setContact(result.data);
        setForm(formFromContact(result.data));
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [contactId]);

  const segmentOptions = [...new Set([...segments.map((segment) => segment.nome), ...(form?.segmento ?? [])])];

  const saveContact = async () => {
    if (!contact || !form) return;
    const nome = form.nome.trim();
    const telefone = form.telefone.trim();
    if (!nome || !telefone) { setFormError("Informe o nome e o telefone do contato."); return; }
    if (!isValidEmail(form.email.trim())) { setFormError("Informe um e-mail válido."); return; }
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, telefone, email: form.email.trim(), dataNascimento: fromDateInput(form.dataNascimento), categoria: form.categoria, segmento: form.segmento.join(", ") || contactCategoryNames[form.categoria] }),
      });
      const result = (await response.json()) as { data?: Contact; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error || "Não foi possível atualizar o contato.");
      setContact(result.data);
      setFormError("");
      toast.success("Contato atualizado", `${result.data.nome} foi salvo.`);
      onChanged?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar o contato.";
      setFormError(message);
      toast.error("Erro ao atualizar contato", message);
    }
  };

  return (
    <EntityDialog titleId="contact-detail-modal-title" title={contact?.nome ?? "Contato"} description="Ficha completa do cliente: dados, pontuação, histórico e comunicações." onClose={onClose} size="lg">
      {contact && form ? (
        <ContactEditTabs
          form={form}
          setForm={setForm as React.Dispatch<React.SetStateAction<ContactForm>>}
          formError={formError}
          setFormError={setFormError}
          selectedContact={contact}
          segmentOptions={segmentOptions}
          saveContact={() => void saveContact()}
          initialTab={initialTab}
          onScoreChanged={onChanged}
        />
      ) : failed ? (
        <p className="py-10 text-center text-sm text-slate-500">Não foi possível carregar o contato.</p>
      ) : (
        <LoadingSpinner label="Carregando contato..." className="w-full justify-center py-10" />
      )}
    </EntityDialog>
  );
}
