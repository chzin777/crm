"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, Camera, Check, Copy, ExternalLink, Hourglass, ListOrdered, MessagesSquare, Send, type LucideIcon } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { ContactPrescriptionsTab } from "@/components/ContactPrescriptionsTab";
import { ContactOpportunityCard } from "@/components/chat/ContactOpportunityCard";
import { useToast } from "@/components/ToastProvider";
import { CampaignBadge } from "@/components/chat/CampaignBadge";
import { fieldClass } from "@/components/chat/MenuFormParts";
import { clockTime, formatCpf, initials, waitingLabel } from "@/lib/chat/format";
import { formatPhone } from "@/lib/chat/phone";
import { CUSTOMER_TYPE_COLOR, CUSTOMER_TYPE_LABEL, type CustomerType } from "@/lib/sales-pipeline";
import { STATUS_LABELS, type ContactNoteItem, type ContactProfile, type ConversationDetail } from "@/lib/chat/types";

const COPIED_MS = 1500;
const CATEGORY_LABELS: Record<string, string> = { cliente: "Cliente", lead: "Lead", nps: "NPS", inativo: "Inativo" };
const INPUT = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-[#002187] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] dark:disabled:bg-slate-900";

type Tab = "cadastro" | "receituario" | "atendimento";
type ContactForm = { name: string; cpf: string; email: string; birthDate: string; city: string };

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : null;

const formOf = (profile: ContactProfile, fallbackName: string): ContactForm => ({
  name: profile.name || fallbackName,
  cpf: profile.cpf ? formatCpf(profile.cpf) : "",
  email: profile.email ?? "",
  birthDate: profile.birthDate ?? "",
  city: profile.city ?? "",
});
const sameForm = (a: ContactForm, b: ContactForm) => (Object.keys(a) as (keyof ContactForm)[]).every((key) => a[key].trim() === b[key].trim());

function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <button type="button" onClick={() => void copy()} aria-label={copied ? "Copiado" : `Copiar ${label}`} title={copied ? "Copiado" : `Copiar ${label}`} className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-slate-800 dark:hover:text-[#C4D600]">
      {copied ? <Check className="h-3.5 w-3.5 text-[#002187] dark:text-[#C4D600]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block min-w-0 space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300 ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-white">{children}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <span className="text-sm font-normal italic text-slate-400 dark:text-slate-500">{text}</span>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Icon className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />{label}</p>
      <p title={value} className="mt-1 truncate text-base font-bold text-slate-900 dark:text-white">{value}</p>
      <p title={detail} className="truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function Notes({ conversationId, notes, canWrite, onAdded }: { conversationId: string; notes: ContactNoteItem[]; canWrite: boolean; onAdded: (note: ContactNoteItem) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    const response = await fetch(`/api/chat/conversations/${conversationId}/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as (ContactNoteItem & { error?: string }) | null;
    setSaving(false);
    if (response?.ok && data) {
      onAdded(data);
      setText("");
    } else {
      toast.error(data?.error ?? "Não foi possível salvar a nota.");
    }
  };

  return (
    <div className="space-y-2">
      {canWrite && (
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={2} maxLength={1000} aria-label="Nova nota interna" placeholder="Nova nota (visível só para a equipe). Ex.: prefere lentes de contato" className={`${fieldClass} resize-y leading-relaxed`} />
          <button type="button" disabled={saving || !text.trim()} onClick={() => void add()} aria-label="Adicionar nota" title="Adicionar nota" className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-[#002187] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#C4D600] dark:text-[#051647]">
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
      {notes.length === 0 ? (
        <Empty text="Nenhuma nota registrada." />
      ) : (
        <ul className="space-y-1.5">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border-l-2 border-[#C4D600] bg-slate-50 px-3 py-2 dark:bg-white/5">
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">{note.text}</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{note.authorName} · {dateTime(note.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Props = {
  conversation: ConversationDetail;
  canWrite: boolean;
  onClose: () => void;
  onTagsChange: (tags: string[]) => void;
  onOpenConversation: (id: string) => void;
  /** Cadastro salvo: a conversa recarrega para mostrar o nome novo. */
  onSaved?: () => void;
};

/**
 * "Dados do cliente" no /chat: cabeçalho de identificação (com o X do modal como único fechamento), abas com
 * escopo próprio (Cadastro & Funil, Receituário, Atendimento) e rodapé só com "Salvar dados" na aba de cadastro.
 */
export function ContactDetailsDialog({ conversation, canWrite, onClose, onTagsChange, onOpenConversation, onSaved }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("cadastro");
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [prescriptionCount, setPrescriptionCount] = useState<number | null>(null);
  const [recurrence, setRecurrence] = useState<CustomerType | null>(null);
  const [form, setForm] = useState<ContactForm | null>(null);
  const [savedForm, setSavedForm] = useState<ContactForm | null>(null);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { id, phone, tags } = conversation;

  useEffect(() => {
    let active = true;
    fetch(`/api/chat/conversations/${id}/contact`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as ContactProfile;
        if (!active) return;
        setProfile(data);
        const initial = formOf(data, conversation.name);
        setForm(initial);
        setSavedForm(initial);
      })
      .catch((error) => {
        console.error("[chat] falha ao carregar ficha:", error);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
    // A ficha é do contato da conversa aberta; o nome só serve de reserva enquanto carrega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    const data = new FormData();
    data.append("file", file);
    data.append("conversationId", id);
    const response = await fetch("/api/chat/avatar", { method: "POST", body: data }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { avatarUrl?: string; error?: string } | null;
    setUploading(false);
    if (response?.ok && result?.avatarUrl) {
      const { avatarUrl } = result;
      setProfile((current) => (current ? { ...current, avatarUrl } : current));
    } else {
      toast.error(result?.error ?? "Não foi possível enviar a foto.");
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    setTagInput("");
    if (tag && !tags.includes(tag)) onTagsChange([...tags, tag]);
  };

  const changeTab = (next: Tab) => {
    setTab(next);
    if (content.current) content.current.scrollTop = 0;
  };

  const dirty = !!form && !!savedForm && !sameForm(form, savedForm);
  const setField = (key: keyof ContactForm, value: string) => setForm((current) => (current ? { ...current, [key]: value } : current));

  const saveContact = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!form || !dirty || saving) return;
    setSaving(true);
    const response = await fetch(`/api/chat/conversations/${id}/contact`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; cpf?: string | null } | null;
    setSaving(false);
    if (!response?.ok) {
      toast.error(data?.error ?? "Não foi possível salvar os dados.");
      return;
    }
    const next = { ...form, cpf: data?.cpf ? formatCpf(data.cpf) : "" };
    setForm(next);
    setSavedForm(next);
    setProfile((current) => (current ? { ...current, name: next.name, cpf: data?.cpf ?? null, email: next.email || null, birthDate: next.birthDate || null, city: next.city || null } : current));
    toast.success("Dados do cliente salvos.");
    onSaved?.();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "cadastro", label: "Cadastro & Funil" },
    { id: "receituario", label: prescriptionCount ? `Receituário (${prescriptionCount})` : "Receituário" },
    { id: "atendimento", label: "Atendimento" },
  ];

  const missing = failed ? "Indisponível" : profile ? "Não informado" : "Carregando...";
  const attendance = [STATUS_LABELS[conversation.status], conversation.assignee?.name].filter(Boolean).join(" · ");
  const waiting = conversation.status === "waiting" ? waitingLabel(conversation.waitingSince).text : "";
  const firstToday = profile?.firstMessageToday ?? null;
  const displayName = savedForm?.name || conversation.name;
  const fullRecordHref = `/contatos?busca=${encodeURIComponent(phone.replace(/^55/, ""))}`;

  const header = (
    <div className="flex min-w-0 items-center gap-3 pr-2">
      <div className="relative shrink-0">
        {profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt={`Foto de ${displayName}`} className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{initials(displayName)}</div>
        )}
        {canWrite && (
          <>
            <button type="button" disabled={uploading || !profile} onClick={() => photoInput.current?.click()} aria-label="Enviar foto do cliente" title="Enviar foto do cliente" className="absolute -bottom-1 -right-1 grid h-5 w-5 cursor-pointer place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:text-[#002187] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-200 dark:hover:text-[#C4D600]">
              <Camera className="h-3 w-3" />
            </button>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPhoto(event)} className="hidden" />
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p title={displayName} className="min-w-0 max-w-full truncate text-base font-bold leading-tight text-slate-900 dark:text-white">{displayName}</p>
          {recurrence && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${CUSTOMER_TYPE_COLOR[recurrence]}`}>{CUSTOMER_TYPE_LABEL[recurrence]}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-0.5">{formatPhone(phone)}<CopyButton value={phone} label="telefone" /></span>
          <Link href={fullRecordHref} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 font-medium text-[#002187] hover:underline dark:text-[#C4D600]">
            Abrir ficha completa<ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <EntityDialog titleId="contact-details-title" title={`Dados do cliente: ${displayName}`} description="" size="panel" onClose={onClose} header={header}>
      <div role="tablist" aria-label="Seções dos dados do cliente" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button key={item.id} type="button" role="tab" id={`contact-tab-${item.id}`} aria-selected={active} aria-controls={`contact-panel-${item.id}`} onClick={() => changeTab(item.id)} className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors duration-200 ${active ? "border-[#C4D600] text-[#051647] dark:text-white" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}>
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Os painéis ficam montados: trocar de aba não refaz a busca nem perde o que está sendo digitado. */}
      <div ref={content} className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-1 py-4 [scrollbar-gutter:stable]">
        <div role="tabpanel" id="contact-panel-cadastro" aria-labelledby="contact-tab-cadastro" hidden={tab !== "cadastro"} className="space-y-6">
          <Section title="Identificação">
            {form ? (
              <form id="contact-form" onSubmit={(event) => void saveContact(event)} className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome completo"><input value={form.name} onChange={(event) => setField("name", event.target.value)} disabled={!canWrite} maxLength={200} className={INPUT} /></Field>
                <Field label="CPF"><input value={form.cpf} onChange={(event) => setField("cpf", event.target.value)} disabled={!canWrite} inputMode="numeric" placeholder="000.000.000-00" maxLength={20} className={`${INPUT} font-mono`} /></Field>
                <Field label="E-mail"><input value={form.email} onChange={(event) => setField("email", event.target.value)} disabled={!canWrite} type="email" placeholder="cliente@email.com" maxLength={200} className={INPUT} /></Field>
                <Field label="Data de nascimento"><input value={form.birthDate} onChange={(event) => setField("birthDate", event.target.value)} disabled={!canWrite} placeholder="dd/mm/aaaa" inputMode="numeric" maxLength={32} className={INPUT} /></Field>
                <Field label="Cidade"><input value={form.city} onChange={(event) => setField("city", event.target.value)} disabled={!canWrite} placeholder="Goiânia" maxLength={120} className={INPUT} /></Field>
              </form>
            ) : (
              <Empty text={failed ? "Não foi possível carregar o cadastro." : "Carregando..."} />
            )}
          </Section>

          <Section title="Oportunidade no Pipeline">
            <ContactOpportunityCard contactId={conversation.contactId} canWrite={canWrite} onRecurrence={setRecurrence} />
          </Section>

          <Section title={profile?.notes.length ? `Notas internas (${profile.notes.length})` : "Notas internas"}>
            {profile ? (
              <Notes conversationId={id} notes={profile.notes} canWrite={canWrite} onAdded={(note) => setProfile((current) => (current ? { ...current, notes: [note, ...current.notes] } : current))} />
            ) : <Empty text={failed ? "Não foi possível carregar as notas." : "Carregando..."} />}
          </Section>
        </div>

        <div role="tabpanel" id="contact-panel-receituario" aria-labelledby="contact-tab-receituario" hidden={tab !== "receituario"}>
          <ContactPrescriptionsTab contactId={conversation.contactId} canWrite={canWrite} onCountChange={setPrescriptionCount} />
        </div>

        <div role="tabpanel" id="contact-panel-atendimento" aria-labelledby="contact-tab-atendimento" hidden={tab !== "atendimento"} className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric icon={ListOrdered} label="Fila atual" value={conversation.queue?.name ?? "Sem fila"} detail={attendance} />
            <Metric icon={MessagesSquare} label="Mensagens" value={profile ? profile.messageCount.toLocaleString("pt-BR") : "..."} detail={profile ? `${profile.conversationCount} ${profile.conversationCount === 1 ? "atendimento" : "atendimentos"}` : "Carregando..."} />
            <Metric icon={CalendarClock} label="Primeira mensagem do dia" value={firstToday ? clockTime(firstToday) : "Sem mensagens hoje"} detail={firstToday ? new Date(firstToday).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nada trocado hoje"} />
            <Metric icon={Hourglass} label="Tempo de espera" value={waiting || "Sem espera"} detail={waiting ? "Aguardando atendente" : "Não está na fila de espera"} />
          </div>

          <Section title="Contato">
            <dl className="grid gap-3 sm:grid-cols-3">
              <Info label="Categoria">{CATEGORY_LABELS[conversation.category] ?? conversation.category}</Info>
              <Info label="Janela 24h">
                <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${conversation.windowOpen ? "bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`} />{conversation.windowOpen ? "Aberta" : "Fechada"}</span>
              </Info>
              <Info label="Segmento">{conversation.segment ?? <Empty text="Não informado" />}</Info>
              <Info label="Origem">{profile?.origin ?? <Empty text={missing} />}</Info>
              <Info label="Cadastro no CRM">{dateTime(profile?.createdAt ?? null) ?? <Empty text={missing} />}</Info>
              <Info label="Última interação">{dateTime(conversation.lastMessageAt) ?? <Empty text="Sem mensagens" />}</Info>
            </dl>
          </Section>

          <Section title="Etiquetas">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button key={tag} type="button" title="Remover etiqueta" disabled={!canWrite} onClick={() => onTagsChange(tags.filter((item) => item !== tag))} className="cursor-pointer rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">{tag} ×</button>
              ))}
              {tags.length === 0 && <Empty text="Nenhuma etiqueta." />}
            </div>
            {canWrite && (
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Nova etiqueta e Enter"
                aria-label="Nova etiqueta"
                className={INPUT}
              />
            )}
          </Section>

          {conversation.campaigns.length > 0 && (
            <Section title="Campanhas de origem">
              <div className="space-y-2">
                {conversation.campaigns.map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between gap-3">
                    <CampaignBadge name={campaign.name} className="min-w-0" />
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{new Date(campaign.repliedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {conversation.previous.length > 0 && (
            <Section title="Conversas anteriores">
              <div className="space-y-1.5">
                {conversation.previous.map((item) => (
                  <button key={item.id} type="button" onClick={() => onOpenConversation(item.id)} className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5">
                    <span className="text-slate-700 dark:text-slate-200">{new Date(item.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}{item.queue ? ` · ${item.queue.name}` : ""}</span>
                    <span className="text-slate-500 dark:text-slate-400">{STATUS_LABELS[item.status]}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Rodapé só na aba de cadastro: a única ação é salvar os dados editados. */}
      {tab === "cadastro" && canWrite && (
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          {dirty && <span className="text-xs text-slate-500 dark:text-slate-400">Alterações não salvas</span>}
          <button type="submit" form="contact-form" disabled={!dirty || saving} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? "Salvando..." : "Salvar dados"}
          </button>
        </footer>
      )}
    </EntityDialog>
  );
}
