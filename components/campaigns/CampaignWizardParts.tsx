"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, ChevronLeft, FileText, Film, Loader2, MoreVertical, Pencil, Phone, Reply, ShieldCheck, Sparkles, UserX, Users, Video, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import type { AudienceSummary } from "@/lib/campaign-wizard";

export type PreviewMedia = { kind: "image" | "video" | "document"; url?: string; name: string; size?: string };

const int = (value: number) => value.toLocaleString("pt-BR");

/** Título de seção do assistente: ícone, título e apoio curto. */
export function WizardSection({ icon: Icon, title, hint, action, children }: { icon: React.ElementType; title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700/70 dark:bg-slate-900/40">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#002187]/8 text-[#002187] dark:bg-[#C4D600]/12 dark:text-[#C4D600]"><Icon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
            {hint && <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Canal de envio: a conta oficial do WhatsApp (Cloud API) conectada ao CRM. */
export function ChannelCard() {
  const [state, setState] = useState<{ loading: boolean; open?: boolean; number?: string | null; name?: string | null; quality?: string | null; error?: string }>({ loading: true });
  useEffect(() => {
    let active = true;
    fetch("/api/whatsapp/connection", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { state?: string; number?: string | null; verifiedName?: string | null; quality?: string | null; error?: string };
        if (!active) return;
        if (!response.ok) setState({ loading: false, error: body.error ?? "Não foi possível consultar o WhatsApp." });
        else setState({ loading: false, open: body.state === "open", number: body.number, name: body.verifiedName, quality: body.quality });
      })
      .catch(() => active && setState({ loading: false, error: "Não foi possível consultar o WhatsApp." }));
    return () => {
      active = false;
    };
  }, []);
  const quality = state.quality?.toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#25D366]/15 text-[#128C7E]"><WhatsAppIcon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{state.name || "WhatsApp oficial (Cloud API)"}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{state.loading ? "Verificando conexão..." : state.error ? state.error : state.number ? `+${state.number.replace(/\D/g, "")}` : "Número não informado"}</p>
      </div>
      {state.loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : state.open ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />Conectado{quality && quality !== "UNKNOWN" ? ` · ${quality === "GREEN" ? "qualidade alta" : quality === "YELLOW" ? "qualidade média" : "qualidade baixa"}` : ""}</span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300"><AlertTriangle className="h-3 w-3" />Desconectado</span>
      )}
    </div>
  );
}

/** Quem de fato recebe: válidos em destaque e o que fica de fora (repetidos, descadastrados, sem celular). */
export function AudienceSummaryCard({ state, segments }: { state: { loading: boolean; summary?: AudienceSummary; error?: string } | null; segments: number }) {
  if (segments === 0) {
    return <p className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"><Users className="h-4 w-4" />Selecione um ou mais segmentos para ver quantos contatos recebem.</p>;
  }
  if (!state || state.loading) {
    return <p className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Calculando o público válido...</p>;
  }
  if (state.error || !state.summary) {
    return <p role="alert" className="flex items-center gap-2 rounded-xl border border-[#F7915E]/40 bg-[#F7915E]/10 p-3 text-xs text-[#9a3d12] dark:text-[#F7915E]"><AlertTriangle className="h-4 w-4 shrink-0" />{state.error ?? "Não foi possível calcular o público."}</p>;
  }
  const { valid, duplicates, optedOut, invalidPhone, total } = state.summary;
  const ignored = [
    { label: "descadastrados (SAIR/PARAR)", value: optedOut, icon: UserX },
    { label: "sem celular válido", value: invalidPhone, icon: Phone },
    { label: "repetidos entre segmentos", value: duplicates, icon: Users },
  ].filter((item) => item.value > 0);
  return (
    <div className={`rounded-xl border p-3 ${valid > 0 ? "border-[#C4D600]/50 bg-[#C4D600]/10" : "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recebem a campanha</p>
          <p className="text-2xl font-bold tabular-nums text-[#051647] dark:text-white">{int(valid)} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">contato{valid === 1 ? "" : "s"} válido{valid === 1 ? "" : "s"}</span></p>
        </div>
        <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{int(total)} no(s) segmento(s)</p>
      </div>
      {ignored.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {ignored.map(({ label, value, icon: Icon }) => (
            <li key={label} className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300"><Icon className="h-3 w-3" /><b className="tabular-nums">{int(value)}</b> {label}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400"><ShieldCheck className="h-3 w-3" />Quem recebeu campanha recentemente ou virou lead frio também pode ser pulado na hora do envio.</p>
    </div>
  );
}

/** Botão compacto de IA que abre um painel flutuante pequeno (não ocupa o formulário). */
export function AiPopover({ label, title, hint, children, open, onOpenChange }: { label: string; title: string; hint?: string; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, onOpenChange]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => onOpenChange(!open)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${open ? "border-[#002187] bg-[#002187]/5 text-[#002187] dark:border-[#C4D600] dark:bg-[#C4D600]/10 dark:text-[#C4D600]" : "border-slate-200 text-slate-600 hover:border-[#002187] hover:text-[#002187] dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600]"}`}>
        <Sparkles className="h-3.5 w-3.5" />{label}
      </button>
      {open && (
        <div role="dialog" aria-label={title} className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,80vw)] space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#0a1f5c]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white"><Sparkles className="h-3.5 w-3.5 text-[#002187] dark:text-[#C4D600]" />{title}</p>
              {hint && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
            </div>
            <button type="button" aria-label="Fechar" onClick={() => onOpenChange(false)} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer"><X className="h-3.5 w-3.5" /></button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Prévia realista de como o cliente recebe no WhatsApp: tela do celular com a conversa da empresa, mídia/cabeçalho,
 * corpo com as variáveis trocadas por exemplos, rodapé e botões de resposta rápida.
 */
export function WhatsAppPreview({ businessName, media, headerText, body, footer, buttons }: { businessName: string; media: PreviewMedia[]; headerText?: string | null; body: string; footer?: string | null; buttons: string[] }) {
  const empty = !body.trim() && media.length === 0 && !headerText;
  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 shadow-xl dark:border-black">
        <div className="flex items-center gap-2 bg-[#075E54] px-2.5 py-2 text-white">
          <ChevronLeft className="h-4 w-4 shrink-0 opacity-90" />
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20 text-[11px] font-bold">{businessName.trim().charAt(0).toUpperCase() || "Ó"}</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[12px] font-semibold leading-tight">{businessName}<CheckCircle2 className="h-3 w-3 shrink-0 text-[#25D366]" aria-label="Conta comercial" /></p>
            <p className="text-[10px] leading-tight opacity-80">Conta comercial</p>
          </div>
          <Video className="h-4 w-4 opacity-90" />
          <Phone className="h-3.5 w-3.5 opacity-90" />
          <MoreVertical className="h-4 w-4 opacity-90" />
        </div>
        <div className="min-h-[340px] space-y-1 bg-[#efeae2] px-2.5 py-3 dark:bg-[#0b141a]">
          <p className="mx-auto w-fit rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm dark:bg-[#182229] dark:text-slate-400">HOJE</p>
          {empty ? (
            <p className="mx-auto mt-8 max-w-[85%] rounded-lg bg-[#fff5c4] px-3 py-2 text-center text-[11px] text-slate-600 shadow-sm dark:bg-[#182229] dark:text-slate-300">Escolha o modelo ou escreva a mensagem para ver a prévia aqui.</p>
          ) : (
            <div className="max-w-[88%] space-y-1">
              <div className="relative rounded-lg rounded-tl-none bg-white p-1 text-[12.5px] leading-snug text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
                <span className="absolute -left-1.5 top-0 h-0 w-0 border-r-[8px] border-t-[8px] border-r-transparent border-t-white dark:border-t-[#202c33]" aria-hidden />
                {media.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="mb-1 overflow-hidden rounded-md bg-slate-100 dark:bg-[#111b21]">
                    {item.kind === "image" && item.url ? (
                      <Image src={item.url} alt={item.name} width={480} height={300} unoptimized className="aspect-[1.91/1] w-full object-cover" />
                    ) : item.kind === "video" && item.url ? (
                      <video src={item.url} className="max-h-40 w-full" aria-label={item.name} />
                    ) : (
                      <div className="flex items-center gap-2 p-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#002187]/10 text-[#002187] dark:text-[#8fa6ff]">{item.kind === "video" ? <Film className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
                        <span className="min-w-0"><span className="block truncate text-[11px] font-semibold">{item.name}</span>{item.size && <span className="text-[10px] opacity-60">{item.size}</span>}</span>
                      </div>
                    )}
                  </div>
                ))}
                <div className="px-1.5 pb-0.5 pt-0.5">
                  {headerText && <p className="mb-0.5 break-words font-bold">{headerText}</p>}
                  {body.trim() && <p className="whitespace-pre-wrap break-words">{body.trim()}</p>}
                  {footer && <p className="mt-1 break-words text-[11px] text-[#667781] dark:text-[#8696a0]">{footer}</p>}
                  <p className="mt-0.5 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">09:41</p>
                </div>
              </div>
              {buttons.filter((text) => text.trim()).map((text, index) => (
                <p key={`${text}-${index}`} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-[12px] font-medium text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]"><Reply className="h-3.5 w-3.5" />{text}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-400">Prévia com dados de exemplo. Cada cliente recebe com os próprios dados.</p>
    </div>
  );
}

/** Item compacto da revisão: rótulo discreto, valor em destaque, detalhe em 1 linha e "Editar" à direita. */
export function ReviewItem({ label, icon: Icon, value, detail, onEdit }: { label: string; icon: React.ElementType; value: ReactNode; detail?: ReactNode; onEdit?: () => void }) {
  return (
    <section className="flex h-auto min-w-0 items-start gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 dark:border-slate-700">
      <div className="min-w-0 flex-1">
        <h4 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Icon className="h-3 w-3 shrink-0" />{label}</h4>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
        {detail && <p className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={typeof detail === "string" ? detail : undefined}>{detail}</p>}
      </div>
      {onEdit && <button type="button" onClick={onEdit} className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#002187] hover:bg-[#002187]/5 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer"><Pencil className="h-3 w-3" />Editar</button>}
    </section>
  );
}

/** Bloco da revisão final com atalho "Editar" para a etapa correspondente. */
export function ReviewBlock({ title, icon: Icon, onEdit, children }: { title: string; icon: React.ElementType; onEdit?: () => void; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Icon className="h-3.5 w-3.5" />{title}</h4>
        {onEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#002187] hover:bg-[#002187]/5 dark:text-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer"><Pencil className="h-3 w-3" />Editar</button>}
      </header>
      <div className="min-w-0 break-words text-sm text-slate-800 dark:text-slate-100">{children}</div>
    </section>
  );
}
