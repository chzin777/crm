"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightLeft, CalendarClock, Camera, Check, Copy, Hourglass, ListOrdered, MessageSquarePlus, MessagesSquare, Send, type LucideIcon } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";
import { CampaignBadge } from "@/components/chat/CampaignBadge";
import { fieldClass } from "@/components/chat/MenuFormParts";
import { clockTime, formatCpf, initials, waitingLabel } from "@/lib/chat/format";
import { formatPhone } from "@/lib/chat/phone";
import { STATUS_LABELS, type ContactNoteItem, type ContactProfile, type ConversationDetail } from "@/lib/chat/types";

const COPIED_MS = 1500;
const CATEGORY_LABELS: Record<string, string> = { cliente: "Cliente", lead: "Lead", nps: "NPS", inativo: "Inativo" };

type Tab = "cadastro" | "atendimento" | "anotacoes";

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</h3>
      {children}
    </section>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 flex min-h-6 min-w-0 items-center gap-1 text-sm font-medium text-slate-900 dark:text-white">{children}</dd>
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
    <div className="space-y-3">
      {canWrite && (
        <div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={2} maxLength={1000} aria-label="Nova nota interna" placeholder="Ex.: Prefere lentes de contato" className={`${fieldClass} resize-y leading-relaxed`} />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Visível só para a equipe, nunca para o cliente.</p>
            <button type="button" disabled={saving || !text.trim()} onClick={() => void add()} className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-3 text-xs font-semibold text-[#051647] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-3.5 w-3.5" />{saving ? "Salvando..." : "Adicionar nota"}
            </button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <Empty text="Nenhuma nota registrada." />
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border-l-2 border-[#C4D600] bg-slate-50 px-3 py-2 dark:bg-white/5">
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">{note.text}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note.authorName} · {dateTime(note.createdAt)}</p>
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
  canTransfer: boolean;
  canBlock: boolean;
  onClose: () => void;
  onTagsChange: (tags: string[]) => void;
  onToggleBlock: () => void;
  onOpenConversation: (id: string) => void;
  onTransfer: () => void;
  onNewConversation: () => void;
};

export function ContactDetailsDialog({ conversation, canWrite, canTransfer, canBlock, onClose, onTagsChange, onToggleBlock, onOpenConversation, onTransfer, onNewConversation }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("cadastro");
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { id, phone, email, tags } = conversation;

  useEffect(() => {
    let active = true;
    fetch(`/api/chat/conversations/${id}/contact`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as ContactProfile;
        if (active) setProfile(data);
      })
      .catch((error) => {
        console.error("[chat] falha ao carregar ficha:", error);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("conversationId", id);
    const response = await fetch("/api/chat/avatar", { method: "POST", body: form }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { avatarUrl?: string; error?: string } | null;
    setUploading(false);
    if (response?.ok && data?.avatarUrl) {
      const { avatarUrl } = data;
      setProfile((current) => (current ? { ...current, avatarUrl } : current));
    } else {
      toast.error(data?.error ?? "Não foi possível enviar a foto.");
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "cadastro", label: "Cadastro" },
    { id: "atendimento", label: "Atendimento" },
    { id: "anotacoes", label: profile?.notes.length ? `Anotações (${profile.notes.length})` : "Anotações" },
  ];

  const missing = failed ? "Indisponível" : profile ? "Não informado" : "Carregando...";
  const cpf = profile?.cpf ? formatCpf(profile.cpf) : null;
  const attendance = [STATUS_LABELS[conversation.status], conversation.assignee?.name].filter(Boolean).join(" · ");
  const waiting = conversation.status === "waiting" ? waitingLabel(conversation.waitingSince).text : "";
  const firstToday = profile?.firstMessageToday ?? null;
  const canMove = canTransfer && !conversation.closedAt;

  return (
    <EntityDialog titleId="contact-details-title" title="Dados do cliente" description="Contexto completo para o atendimento" size="tabs" onClose={onClose}>
      <div className="flex shrink-0 items-center gap-3 pb-3">
        <div className="relative shrink-0">
          {profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt={`Foto de ${conversation.name}`} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#051647] text-base font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{initials(conversation.name)}</div>
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
          <p title={conversation.name} className="truncate text-lg font-bold leading-tight text-slate-900 dark:text-white">{conversation.name}</p>
          <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
            {formatPhone(phone)}
            <CopyButton value={phone} label="telefone" />
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {canWrite && (
            <button type="button" onClick={onNewConversation} aria-label="Nova conversa" title="Nova conversa" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-[#C4D600] text-[#051647] hover:opacity-90">
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          )}
          {canMove && (
            <button type="button" onClick={onTransfer} aria-label="Transferir" title="Transferir" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5">
              <ArrowRightLeft className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Seções dos dados do cliente" className="flex shrink-0 gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button key={item.id} type="button" role="tab" id={`contact-tab-${item.id}`} aria-selected={active} aria-controls={`contact-panel-${item.id}`} onClick={() => changeTab(item.id)} className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors duration-200 ${active ? "border-[#C4D600] text-[#051647] dark:text-white" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}>
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Os painéis ficam montados: trocar de aba não refaz a busca nem perde a nota em digitação. */}
      <div ref={content} className="min-h-0 flex-1 overflow-y-auto scroll-smooth p-4 [scrollbar-gutter:stable]">
        <div role="tabpanel" id="contact-panel-cadastro" aria-labelledby="contact-tab-cadastro" hidden={tab !== "cadastro"} className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#C4D600]/25 px-2 py-0.5 text-xs font-semibold text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]">{CATEGORY_LABELS[conversation.category] ?? conversation.category}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <span className={`h-2 w-2 rounded-full ${conversation.windowOpen ? "bg-[#C4D600]" : "bg-slate-300 dark:bg-slate-600"}`} />
              Janela 24h {conversation.windowOpen ? "aberta" : "fechada"}
            </span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Info label="Nome completo"><span title={conversation.name} className="min-w-0 truncate">{conversation.name}</span><CopyButton value={conversation.name} label="nome" /></Info>
            <Info label="CPF">
              {cpf ? <>{cpf}<CopyButton value={cpf} label="CPF" /></> : <Empty text={missing} />}
            </Info>
            <Info label="E-mail">
              {email ? (
                <>
                  <a href={`mailto:${email}`} title={email} className="min-w-0 cursor-pointer truncate text-[#002187] hover:underline dark:text-[#C4D600]">{email}</a>
                  <CopyButton value={email} label="e-mail" />
                </>
              ) : <Empty text="Não informado" />}
            </Info>
            <Info label="Telefone">{formatPhone(phone)}<CopyButton value={phone} label="telefone" /></Info>
            <Info label="Cadastro no CRM">{dateTime(profile?.createdAt ?? null) ?? <Empty text={missing} />}</Info>
            <Info label="Última interação">{dateTime(conversation.lastMessageAt) ?? <Empty text="Sem mensagens" />}</Info>
            <Info label="Origem">{profile?.origin ?? <Empty text={missing} />}</Info>
            <Info label="Segmento">{conversation.segment ?? <Empty text="Não informado" />}</Info>
          </dl>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <Link href={`/contatos?busca=${encodeURIComponent(phone.replace(/^55/, ""))}`} className="inline-block cursor-pointer text-sm font-medium text-[#002187] hover:underline dark:text-[#C4D600]">Abrir ficha do contato</Link>
            {canBlock && (
              <button type="button" onClick={onToggleBlock} className="cursor-pointer text-sm font-medium text-red-600 hover:underline dark:text-red-300">
                {conversation.blocked ? "Desbloquear número" : "Bloquear número"}
              </button>
            )}
          </div>
        </div>

        <div role="tabpanel" id="contact-panel-atendimento" aria-labelledby="contact-tab-atendimento" hidden={tab !== "atendimento"} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric icon={ListOrdered} label="Fila atual" value={conversation.queue?.name ?? "Sem fila"} detail={attendance} />
            <Metric icon={MessagesSquare} label="Mensagens" value={profile ? profile.messageCount.toLocaleString("pt-BR") : "..."} detail={profile ? `${profile.conversationCount} ${profile.conversationCount === 1 ? "atendimento" : "atendimentos"}` : "Carregando..."} />
            <Metric icon={CalendarClock} label="Primeira mensagem do dia" value={firstToday ? clockTime(firstToday) : "Sem mensagens hoje"} detail={firstToday ? new Date(firstToday).toLocaleDateString("pt-BR") : "Nada trocado hoje"} />
            <Metric icon={Hourglass} label="Tempo de espera" value={waiting || "Sem espera"} detail={waiting ? "Aguardando atendente" : "Não está na fila de espera"} />
          </div>

          {canMove && (
            <button type="button" onClick={onTransfer} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#C4D600] px-3 text-sm font-semibold text-[#051647] hover:opacity-90">
              <ArrowRightLeft className="h-4 w-4" />Transferir ou trocar de fila
            </button>
          )}

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
                className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#C4D600] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            )}
          </Section>

          {conversation.campaigns.length > 0 && (
            <Section title="Campanhas de origem">
              <div className="space-y-2">
                {conversation.campaigns.map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between gap-3">
                    <CampaignBadge name={campaign.name} className="min-w-0" />
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{new Date(campaign.repliedAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {conversation.previous.length > 0 && (
            <Section title="Conversas anteriores">
              <div className="space-y-2">
                {conversation.previous.map((item) => (
                  <button key={item.id} type="button" onClick={() => onOpenConversation(item.id)} className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5">
                    <span className="text-slate-700 dark:text-slate-200">{new Date(item.createdAt).toLocaleDateString("pt-BR")}{item.queue ? ` · ${item.queue.name}` : ""}</span>
                    <span className="text-slate-500 dark:text-slate-400">{STATUS_LABELS[item.status]}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div role="tabpanel" id="contact-panel-anotacoes" aria-labelledby="contact-tab-anotacoes" hidden={tab !== "anotacoes"}>
          {profile ? (
            <Notes conversationId={id} notes={profile.notes} canWrite={canWrite} onAdded={(note) => setProfile((current) => (current ? { ...current, notes: [note, ...current.notes] } : current))} />
          ) : <Empty text={failed ? "Não foi possível carregar as notas." : "Carregando..."} />}
        </div>
      </div>
    </EntityDialog>
  );
}
