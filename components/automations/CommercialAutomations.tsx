"use client";

import { useEffect, useState } from "react";
import { BellRing, CalendarClock, CheckCircle2, Clock, Contact, Glasses, History, Loader2, MessageSquareText, Pause, Play, Save } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";
import type { CommercialAutomationKind, CommercialAutomationsOverview } from "@/lib/commercial/jobs-db";
import type { CommercialSettings, SendWindow, TemplateRef } from "@/lib/commercial/settings";
import { ownTemplates } from "@/lib/meta-sample-templates";

type MetaTemplate = { name: string; language: string; status: string };

const META: Record<CommercialAutomationKind, { name: string; icon: React.ElementType; description: string }> = {
  rx_review: { name: "Revisão anual de grau (VMSET)", icon: Glasses, description: "Modelo oficial da Meta para quem comprou lentes de grau." },
  contact_lens: { name: "Reposição de lentes de contato (VMSET)", icon: Contact, description: "Modelo oficial da Meta antes do fim estimado das caixas compradas." },
  budget_recovery: { name: "Recuperação de orçamento aberto (janela 24h)", icon: MessageSquareText, description: "Mensagem de acompanhamento para quem consultou produto, preço ou receita e parou de responder." },
};
const ORDER: CommercialAutomationKind[] = ["rx_review", "contact_lens", "budget_recovery"];
const STATUS_LABEL: Record<string, string> = { sent: "Enviado", failed: "Falha", skipped: "Ignorado", sending: "Enviando" };
const hour = (value: number) => `${String(value).padStart(2, "0")}:00`;
const windowLabel = (window: SendWindow) => `${hour(window.from)} às ${hour(window.to)}`;

function triggerLabel(kind: CommercialAutomationKind, settings: CommercialSettings) {
  if (kind === "rx_review") return `${settings.rxReview.days} dias após a compra · ${windowLabel(settings.rxReview.window)}`;
  if (kind === "contact_lens") return `${settings.contactLens.leadDays} dias antes do fim das caixas · ${windowLabel(settings.contactLens.window)}`;
  return `${settings.budgetRecovery.minHours} a ${settings.budgetRecovery.maxHours} h sem resposta · ${windowLabel(settings.budgetRecovery.window)}`;
}

const enabledOf = (kind: CommercialAutomationKind, settings: CommercialSettings) =>
  kind === "rx_review" ? settings.rxReview.enabled : kind === "contact_lens" ? settings.contactLens.enabled : settings.budgetRecovery.enabled;

const inputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-[#C4D600]";

function NumberField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{label}
      <span className="flex items-center gap-2">
        <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${inputClass} w-28`} />
        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{suffix}</span>
      </span>
    </label>
  );
}

function WindowField({ value, onChange }: { value: SendWindow; onChange: (value: SendWindow) => void }) {
  const hours = Array.from({ length: 25 }, (_, index) => index);
  return (
    <div className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Janela de envio (horário de Brasília)</span>
      <span className="flex items-center gap-2 font-normal">
        <select aria-label="Início da janela" value={value.from} onChange={(event) => onChange({ ...value, from: Number(event.target.value) })} className={`${inputClass} w-28 cursor-pointer`}>
          {hours.slice(0, 24).map((item) => <option key={item} value={item}>{hour(item)}</option>)}
        </select>
        <span className="text-slate-500">até</span>
        <select aria-label="Fim da janela" value={value.to} onChange={(event) => onChange({ ...value, to: Number(event.target.value) })} className={`${inputClass} w-28 cursor-pointer`}>
          {hours.slice(1).map((item) => <option key={item} value={item}>{hour(item)}</option>)}
        </select>
      </span>
      {value.to <= value.from && <span className="block font-normal text-red-600">O fim precisa ser depois do início.</span>}
    </div>
  );
}

function TemplateField({ value, templates, onChange }: { value: TemplateRef; templates: MetaTemplate[]; onChange: (value: TemplateRef) => void }) {
  const current = value ? `${value.name}|${value.language}` : "";
  return (
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Modelo oficial da Meta (aprovado)
      <select
        value={current}
        onChange={(event) => {
          const [name, language] = event.target.value.split("|");
          onChange(name && language ? { name, language } : null);
        }}
        className={`${inputClass} cursor-pointer`}
      >
        <option value="">Nenhum modelo</option>
        {current && !templates.some((item) => `${item.name}|${item.language}` === current) && <option value={current}>{value?.name} ({value?.language})</option>}
        {templates.map((item) => <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>{item.name} ({item.language})</option>)}
      </select>
      <span className="block font-normal text-slate-500 dark:text-slate-400">Variáveis: {"{{1}}"} primeiro nome, {"{{2}}"} item comprado, {"{{3}}"} loja. Contatos com opt-out nunca recebem.</span>
    </label>
  );
}

function EditDialog({ kind, overview, templates, onClose, onSaved }: { kind: CommercialAutomationKind; overview: CommercialAutomationsOverview; templates: MetaTemplate[]; onClose: () => void; onSaved: (settings: CommercialSettings) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<CommercialSettings>(overview.settings);
  const [saving, setSaving] = useState(false);
  const history = overview.history[kind];
  const needsTemplate = (kind === "rx_review" && draft.rxReview.enabled && !draft.rxReview.template) || (kind === "contact_lens" && draft.contactLens.enabled && !draft.contactLens.template);
  const rule = kind === "rx_review" ? draft.rxReview : kind === "contact_lens" ? draft.contactLens : draft.budgetRecovery;
  const invalid = needsTemplate || rule.window.to <= rule.window.from || (kind === "budget_recovery" && draft.budgetRecovery.maxHours <= draft.budgetRecovery.minHours);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/automations/commercial", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = (await response.json().catch(() => ({}))) as { data?: CommercialSettings; error?: string };
      if (!response.ok || !data.data) throw new Error(data.error ?? "Não foi possível salvar.");
      toast.success("Automação salva", META[kind].name);
      onSaved(data.data);
    } catch (cause) {
      toast.error("Não foi possível salvar", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#051647] dark:text-white">
      <input
        type="checkbox"
        checked={rule.enabled}
        onChange={(event) => {
          const enabled = event.target.checked;
          setDraft((current) => kind === "rx_review" ? { ...current, rxReview: { ...current.rxReview, enabled } } : kind === "contact_lens" ? { ...current, contactLens: { ...current.contactLens, enabled } } : { ...current, budgetRecovery: { ...current.budgetRecovery, enabled } });
        }}
        className="h-4 w-4 cursor-pointer accent-[#002187]"
      />
      Automação ativa
    </label>
  );

  return (
    <EntityDialog titleId={`automacao-${kind}`} title={META[kind].name} description={META[kind].description} onClose={() => { if (!saving) onClose(); }} size="lg">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        {toggle}
        {kind === "rx_review" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Gatilho: dias após a compra de lentes de grau" value={draft.rxReview.days} min={30} max={730} suffix="dias" onChange={(days) => setDraft({ ...draft, rxReview: { ...draft.rxReview, days } })} />
            <WindowField value={draft.rxReview.window} onChange={(window) => setDraft({ ...draft, rxReview: { ...draft.rxReview, window } })} />
            <div className="sm:col-span-2"><TemplateField value={draft.rxReview.template} templates={templates} onChange={(template) => setDraft({ ...draft, rxReview: { ...draft.rxReview, template } })} /></div>
          </div>
        )}
        {kind === "contact_lens" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Gatilho: dias antes do fim estimado das caixas" value={draft.contactLens.leadDays} min={0} max={30} suffix="dias antes" onChange={(leadDays) => setDraft({ ...draft, contactLens: { ...draft.contactLens, leadDays } })} />
            <WindowField value={draft.contactLens.window} onChange={(window) => setDraft({ ...draft, contactLens: { ...draft.contactLens, window } })} />
            <div className="sm:col-span-2"><TemplateField value={draft.contactLens.template} templates={templates} onChange={(template) => setDraft({ ...draft, contactLens: { ...draft.contactLens, template } })} /></div>
          </div>
        )}
        {kind === "budget_recovery" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Gatilho: sem resposta há pelo menos" value={draft.budgetRecovery.minHours} min={1} max={22} suffix="horas" onChange={(minHours) => setDraft({ ...draft, budgetRecovery: { ...draft.budgetRecovery, minHours } })} />
            <NumberField label="E no máximo" value={draft.budgetRecovery.maxHours} min={2} max={23} suffix="horas (dentro da janela de 24h)" onChange={(maxHours) => setDraft({ ...draft, budgetRecovery: { ...draft.budgetRecovery, maxHours } })} />
            <WindowField value={draft.budgetRecovery.window} onChange={(window) => setDraft({ ...draft, budgetRecovery: { ...draft.budgetRecovery, window } })} />
            <label className="block min-w-0 space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">Texto da mensagem
              <textarea rows={4} maxLength={1000} value={draft.budgetRecovery.message} onChange={(event) => setDraft({ ...draft, budgetRecovery: { ...draft.budgetRecovery, message: event.target.value } })} placeholder="Vazio: mensagem automática citando o item consultado. Ex.: Oi, {nome}! Ficou alguma dúvida sobre o {item}? Posso confirmar a disponibilidade na loja mais perto de você." className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-[#C4D600]" />
              <span className="block font-normal text-slate-500 dark:text-slate-400">Use {"{nome}"} para o primeiro nome e {"{item}"} para o item consultado. Uma mensagem por conversa; contatos com opt-out nunca recebem.</span>
            </label>
          </div>
        )}
        {needsTemplate && <p role="alert" className="text-xs text-red-600">Escolha um modelo aprovado para ativar esta automação.</p>}

        <section className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><History className="h-3.5 w-3.5" />Histórico de disparos</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Últimos 30 dias: {Object.keys(history.last30).length === 0 ? "nenhum disparo" : Object.entries(history.last30).map(([status, count]) => `${count} ${(STATUS_LABEL[status] ?? status).toLowerCase()}`).join(" · ")}
          </p>
          {history.recent.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 text-xs dark:divide-slate-800 dark:border-slate-800">
              {history.recent.map((item, index) => (
                <li key={`${item.at}-${index}`} className="grid grid-cols-[110px_minmax(0,1fr)_80px] gap-2 px-3 py-2">
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">{new Date(item.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="min-w-0 break-words text-slate-700 dark:text-slate-200" title={item.detail ?? undefined}>{item.contact ?? "Cliente sem cadastro"}{item.detail ? <span className="text-slate-400"> · {item.detail}</span> : null}</span>
                  <span className={`text-right font-semibold ${item.status === "sent" ? "text-emerald-600 dark:text-emerald-400" : item.status === "failed" ? "text-red-600" : "text-slate-500"}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button type="button" disabled={saving} onClick={onClose} className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Cancelar</button>
        <button type="button" disabled={saving || invalid} onClick={() => void save()} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-4 text-xs font-bold text-[#051647] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </EntityDialog>
  );
}

/** Automações comerciais do VMSet listadas em /automacoes: gatilho, status, disparos e edição completa. */
export function CommercialAutomations() {
  const toast = useToast();
  const [overview, setOverview] = useState<CommercialAutomationsOverview | null>(null);
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [editing, setEditing] = useState<CommercialAutomationKind | null>(null);
  const [busy, setBusy] = useState<CommercialAutomationKind | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/automations/commercial")
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { data?: CommercialAutomationsOverview; error?: string };
        if (!response.ok || !data.data) throw new Error(data.error ?? "Não foi possível carregar.");
        if (active) setOverview(data.data);
      })
      .catch((cause: unknown) => { if (active) toast.error("Automações comerciais", cause instanceof Error ? cause.message : "Erro ao carregar."); });
    fetch("/api/whatsapp/templates")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { data?: MetaTemplate[] };
        if (active) setTemplates(ownTemplates(data.data).filter((item) => item.status === "APPROVED"));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [toast]);

  const setEnabled = async (kind: CommercialAutomationKind, enabled: boolean) => {
    if (!overview) return;
    const settings = overview.settings;
    if (enabled && ((kind === "rx_review" && !settings.rxReview.template) || (kind === "contact_lens" && !settings.contactLens.template))) {
      setEditing(kind);
      return;
    }
    const next = kind === "rx_review" ? { ...settings, rxReview: { ...settings.rxReview, enabled } } : kind === "contact_lens" ? { ...settings, contactLens: { ...settings.contactLens, enabled } } : { ...settings, budgetRecovery: { ...settings.budgetRecovery, enabled } };
    setBusy(kind);
    try {
      const response = await fetch("/api/automations/commercial", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const data = (await response.json().catch(() => ({}))) as { data?: CommercialSettings; error?: string };
      if (!response.ok || !data.data) throw new Error(data.error ?? "Não foi possível alterar.");
      setOverview({ ...overview, settings: data.data });
      toast.success(enabled ? "Automação ativada" : "Automação pausada", META[kind].name);
    } catch (cause) {
      toast.error("Não foi possível alterar", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-2">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#051647] dark:text-white"><BellRing className="h-4 w-4 text-[#002187] dark:text-[#C4D600]" />Automações comerciais</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Pós-venda a partir das vendas do VMSET e recuperação de orçamento parado. Edite gatilho, modelo, texto e horário de envio.</p>
      </div>
      {!overview ? (
        <p className="flex items-center gap-2 py-4 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando automações comerciais...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900/40">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ORDER.map((kind) => {
              const meta = META[kind];
              const Icon = meta.icon;
              const enabled = enabledOf(kind, overview.settings);
              const sent = overview.history[kind].last30.sent ?? 0;
              return (
                <li key={kind} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_110px_minmax(0,1.6fr)_140px] lg:items-center lg:gap-4">
                  <button type="button" onClick={() => setEditing(kind)} className="flex min-w-0 cursor-pointer items-start gap-2 text-left">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#051647] hover:underline dark:text-white">{meta.name}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{meta.description}</span>
                    </span>
                  </button>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"><CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" /><span className="truncate">{triggerLabel(kind, overview.settings)}</span></span>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${enabled ? "bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]" : "bg-[#F7915E]/15 text-[#9a4a1c] dark:text-[#F7915E]"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-[#9aaa00] dark:bg-[#C4D600]" : "bg-[#F7915E]"}`} />{enabled ? "Ativo" : "Pausado"}
                  </span>
                  <span className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" title="Enviados nos últimos 30 dias"><CheckCircle2 className="h-3 w-3" />{sent} em 30 dias</span>
                  </span>
                  <span className="flex items-center gap-1 lg:justify-end">
                    {enabled ? (
                      <button type="button" disabled={busy === kind} onClick={() => void setEnabled(kind, false)} title="Pausar" aria-label={`Pausar ${meta.name}`} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-white/10"><Pause className="h-4 w-4" /></button>
                    ) : (
                      <button type="button" disabled={busy === kind} onClick={() => void setEnabled(kind, true)} title="Ativar" aria-label={`Ativar ${meta.name}`} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[#002187] hover:bg-slate-100 disabled:opacity-40 dark:text-[#C4D600] dark:hover:bg-white/10"><Play className="h-4 w-4" /></button>
                    )}
                    <button type="button" onClick={() => setEditing(kind)} className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Editar</button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {editing && overview && (
        <EditDialog kind={editing} overview={overview} templates={templates} onClose={() => setEditing(null)} onSaved={(settings) => { setOverview({ ...overview, settings }); setEditing(null); }} />
      )}
    </section>
  );
}
