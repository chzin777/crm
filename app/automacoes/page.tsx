"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, FilePlus2, Loader2, Pause, Play, Plus, Trash2, Workflow, Zap } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { useToast } from "@/components/ToastProvider";

type FlowRow = { id: string; name: string; description: string; status: "draft" | "active" | "paused"; trigger: string; steps: number; running: number; completed: number; failed: number; cancelled: number; updatedAt: string };
type Template = { id: string; name: string; description: string };

const STATUS = {
  active: { label: "Ativo", cls: "bg-[#C4D600]/25 text-[#051647] dark:text-[#C4D600]", dot: "bg-[#9aaa00] dark:bg-[#C4D600]" },
  paused: { label: "Pausado", cls: "bg-[#F7915E]/15 text-[#9a4a1c] dark:text-[#F7915E]", dot: "bg-[#F7915E]" },
  draft: { label: "Rascunho", cls: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400", dot: "bg-slate-400" },
} as const;

/** /automacoes: lista de fluxos com status, gatilho e contadores de execuções. */
export default function AutomationsPage() {
  const toast = useToast();
  const router = useRouter();
  const [flows, setFlows] = useState<FlowRow[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/automations")
      .then(async (response) => {
        const data = (await response.json()) as { flows?: FlowRow[]; templates?: Template[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as automações.");
        if (!active) return;
        setFlows(data.flows ?? []);
        setTemplates(data.templates ?? []);
      })
      .catch((cause: unknown) => { if (active) { toast.error("Automações", cause instanceof Error ? cause.message : "Erro ao carregar."); setFlows([]); } });
    return () => { active = false; };
  }, [toast, reload]);

  const create = async (templateId?: string) => {
    setBusy(templateId ?? "blank");
    try {
      const response = await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId }) });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error ?? "Não foi possível criar.");
      router.push(`/automacoes/${data.id}`);
    } catch (cause) {
      toast.error("Nova automação", cause instanceof Error ? cause.message : "Tente de novo.");
      setBusy(null);
    }
  };

  const setStatus = async (flow: FlowRow, status: FlowRow["status"]) => {
    setBusy(flow.id);
    try {
      const response = await fetch(`/api/automations/${flow.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível alterar.");
      setFlows((current) => current?.map((item) => (item.id === flow.id ? { ...item, status } : item)) ?? current);
      toast.success(status === "active" ? "Automação ativada" : "Automação pausada", flow.name);
    } catch (cause) {
      toast.error("Não foi possível alterar", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (flow: FlowRow) => {
    if (!window.confirm(`Excluir a automação "${flow.name}" e o histórico de execuções?`)) return;
    setBusy(flow.id);
    try {
      await fetch(`/api/automations/${flow.id}`, { method: "DELETE" });
      setReload((value) => value + 1);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#051647] dark:text-white">Automações</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Fluxos visuais que reagem a mensagens, etapas do funil, tags, inatividade e webhooks, com mensagens, tarefas no CRM e IA.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-[#C4D600] px-4 text-sm font-semibold text-[#051647] hover:brightness-105">
          <Plus className="h-4 w-4" />Nova automação
        </button>
      </div>

      {!flows ? (
        <p className="flex items-center gap-2 py-10 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando automações...</p>
      ) : flows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center dark:border-slate-700">
          <Workflow className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-[#051647] dark:text-white">Nenhuma automação ainda</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comece do zero ou por um modelo pronto.</p>
          <button type="button" onClick={() => setCreating(true)} className="mt-4 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#002187] px-3 text-xs font-semibold text-white hover:brightness-110"><Plus className="h-3.5 w-3.5" />Nova automação</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900/40">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_110px_minmax(0,1.6fr)_140px] gap-4 border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:grid dark:border-slate-800">
            <span>Fluxo</span><span>Gatilho</span><span>Status</span><span>Execuções</span><span className="text-right">Ações</span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {flows.map((flow) => {
              const status = STATUS[flow.status] ?? STATUS.draft;
              return (
                <li key={flow.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_110px_minmax(0,1.6fr)_140px] lg:items-center lg:gap-4">
                  <Link href={`/automacoes/${flow.id}`} className="min-w-0 cursor-pointer">
                    <span className="block truncate text-sm font-semibold text-[#051647] hover:underline dark:text-white">{flow.name}</span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{flow.description || `${flow.steps} passo${flow.steps === 1 ? "" : "s"}`}</span>
                  </Link>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"><Zap className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" /><span className="truncate">{flow.trigger}</span></span>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span>
                  <span className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#002187]/10 px-2 py-0.5 font-semibold text-[#002187] dark:bg-white/10 dark:text-slate-200" title="Em andamento (rodando ou aguardando)"><Clock className="h-3 w-3" />{flow.running}</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" title="Concluídas"><CheckCircle2 className="h-3 w-3" />{flow.completed}</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300" title="Com erro"><AlertTriangle className="h-3 w-3" />{flow.failed}</span>
                  </span>
                  <span className="flex items-center gap-1 lg:justify-end">
                    {flow.status === "active" ? (
                      <button type="button" disabled={busy === flow.id} onClick={() => void setStatus(flow, "paused")} title="Pausar" aria-label={`Pausar ${flow.name}`} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-white/10"><Pause className="h-4 w-4" /></button>
                    ) : (
                      <button type="button" disabled={busy === flow.id} onClick={() => void setStatus(flow, "active")} title="Ativar" aria-label={`Ativar ${flow.name}`} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[#002187] hover:bg-slate-100 disabled:opacity-40 dark:text-[#C4D600] dark:hover:bg-white/10"><Play className="h-4 w-4" /></button>
                    )}
                    <Link href={`/automacoes/${flow.id}`} className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">Editar</Link>
                    <button type="button" disabled={busy === flow.id} onClick={() => void remove(flow)} title="Excluir" aria-label={`Excluir ${flow.name}`} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-500/15"><Trash2 className="h-4 w-4" /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {creating && (
        <EntityDialog titleId="nova-automacao" title="Nova automação" description="Comece do zero ou a partir de um modelo pronto (você ajusta tudo no editor)." onClose={() => setCreating(false)} size="md">
          <div className="grid gap-2 overflow-y-auto">
            <button type="button" disabled={!!busy} onClick={() => void create()} className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-left hover:border-[#002187] disabled:opacity-50 dark:border-slate-600 dark:hover:border-[#C4D600]">
              <FilePlus2 className="mt-0.5 h-5 w-5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
              <span><span className="block text-sm font-semibold text-[#051647] dark:text-white">Começar do zero</span><span className="block text-xs text-slate-500 dark:text-slate-400">Canvas vazio para montar o fluxo.</span></span>
              {busy === "blank" && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
            </button>
            {templates.map((template) => (
              <button key={template.id} type="button" disabled={!!busy} onClick={() => void create(template.id)} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-[#002187] disabled:opacity-50 dark:border-slate-700 dark:hover:border-[#C4D600]">
                <Workflow className="mt-0.5 h-5 w-5 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                <span className="min-w-0"><span className="block text-sm font-semibold text-[#051647] dark:text-white">{template.name}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{template.description}</span></span>
                {busy === template.id && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" />}
              </button>
            ))}
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
