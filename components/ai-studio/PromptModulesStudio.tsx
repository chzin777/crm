"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Bold, Eye, FileCode2, Heading2, History, List, Loader2, Plus, Quote, RotateCcw, Save, ScanSearch, Search, Trash2, X } from "lucide-react";
import { EntityDialog } from "@/components/EntityDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import { estimateTokens, type ModuleCategory, type PromptModule, type UsedModule } from "@/lib/ai/prompt-modules";

/**
 * Estúdio de Módulos de Prompt (/ia): tudo o que a IA sabe e segue vem daqui. Lista com categoria, tokens e liga/desliga,
 * editor Markdown com prévia lado a lado, histórico de versões e a inspeção do prompt exato enviado à OpenAI.
 */

const NAVY = "#07163B";
const LIME = "#C8E600";

type ModuleRow = PromptModule & { tokens: number };
type Catalog = { categories: ModuleCategory[]; conditions: Record<string, string>; variables: Record<string, string> };
type Revision = { id: string; title: string; contentMarkdown: string; createdAt: string };
type Preview = { system: string; used: UsedModule[]; tokens: number; model: string; temperature: number | null; json: boolean };

const CATEGORY_LABEL: Record<ModuleCategory, string> = { persona: "Persona", regras: "Regras", conhecimento: "Conhecimento", lojas: "Lojas", fluxo: "Fluxo" };
const CATEGORY_TONE: Record<ModuleCategory, string> = {
  persona: "bg-[#C8E600]/25 text-[#07163B] dark:text-[#C8E600]",
  regras: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  conhecimento: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  lojas: "bg-[#F7915E]/20 text-[#9a4a1c] dark:text-[#F7915E]",
  fluxo: "bg-[#07163B]/10 text-[#07163B] dark:bg-white/10 dark:text-slate-200",
};
const field = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-[#07163B] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#C8E600]";
const int = (value: number) => value.toLocaleString("pt-BR");

/** Trecho com {{variável}} e @condição destacados. */
function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*[a-z_]+\s*\}\}|@[a-z_]+)/g);
  return <>{parts.map((part, index) => /^\{\{/.test(part) ? <code key={index} className="rounded bg-[#C8E600]/30 px-1 text-[#07163B] dark:text-[#C8E600]">{part}</code> : /^@[a-z_]+$/.test(part) ? <code key={index} className="rounded bg-sky-100 px-1 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">{part}</code> : <InlineMd key={index} text={part} />)}</>;
}

/** **negrito**, *itálico* e `código` em linha (sem HTML bruto). */
function InlineMd({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g);
  return <>{tokens.map((token, index) => token.startsWith("**") && token.endsWith("**") && token.length > 4 ? <strong key={index}>{token.slice(2, -2)}</strong> : token.startsWith("`") && token.endsWith("`") && token.length > 2 ? <code key={index} className="rounded bg-slate-100 px-1 dark:bg-white/10">{token.slice(1, -1)}</code> : token.startsWith("*") && token.endsWith("*") && token.length > 2 ? <em key={index}>{token.slice(1, -1)}</em> : <span key={index}>{token}</span>)}</>;
}

/** Prévia do Markdown: títulos, listas, citações (bloco de regra) e parágrafos. */
function MarkdownPreview({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(<ul key={`l${blocks.length}`} className="ml-4 list-disc space-y-0.5">{list.map((item, index) => <li key={index}><Highlight text={item} /></li>)}</ul>);
    list = [];
  };
  lines.forEach((line, index) => {
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) return void list.push(bullet[1]);
    flush();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) return void blocks.push(<p key={index} className={`font-bold text-[#07163B] dark:text-white ${heading[1].length === 1 ? "text-sm" : "text-xs"}`}><Highlight text={heading[2]} /></p>);
    if (/^>\s?/.test(line)) return void blocks.push(<p key={index} className="border-l-2 border-[#C8E600] pl-2 text-slate-700 dark:text-slate-200"><Highlight text={line.replace(/^>\s?/, "")} /></p>);
    if (!line.trim()) return void blocks.push(<div key={index} className="h-2" />);
    blocks.push(<p key={index}><Highlight text={line} /></p>);
  });
  flush();
  return <div className="space-y-1 break-words text-xs leading-relaxed text-slate-700 dark:text-slate-300">{blocks}</div>;
}

export function PromptModulesStudio() {
  const toast = useToast();
  const [modules, setModules] = useState<ModuleRow[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ categories: ["persona", "regras", "conhecimento", "lojas", "fluxo"], conditions: {}, variables: {} });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromptModule | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewText, setPreviewText] = useState("Vocês fazem exame de vista?");
  const [previewFirst, setPreviewFirst] = useState(true);
  const [keywordDraft, setKeywordDraft] = useState("");
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/ai/modules", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { modules?: ModuleRow[]; error?: string } & Partial<Catalog>;
    if (!response.ok || !data.modules) return toast.error("Módulos", data.error ?? "Não foi possível carregar os módulos.");
    setModules(data.modules);
    setCatalog({ categories: data.categories ?? catalog.categories, conditions: data.conditions ?? {}, variables: data.variables ?? {} });
    return data.modules;
  }, [toast, catalog.categories]);

  useEffect(() => {
    void load().then((rows) => { if (rows?.length && !selectedId) select(rows[0]); });
    // Carrega uma vez ao abrir a seção.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (module: PromptModule) => {
    setSelectedId(module.id);
    setDraft({ ...module });
    setRevisions(null);
    setKeywordDraft("");
  };

  const current = modules?.find((module) => module.id === selectedId) ?? null;
  const dirty = !!draft && !!current && (["title", "slug", "category", "contentMarkdown", "alwaysInclude", "isActive"] as const).some((key) => draft[key] !== current[key]) || (!!draft && !!current && draft.keywords.join("|") !== current.keywords.join("|"));
  const activeTokens = useMemo(() => (modules ?? []).filter((module) => module.isActive).reduce((sum, module) => sum + module.tokens, 0), [modules]);
  const visible = (modules ?? []).filter((module) => !filter.trim() || `${module.title} ${module.slug} ${module.contentMarkdown}`.toLowerCase().includes(filter.trim().toLowerCase()));

  const patchModule = async (id: string, body: Partial<PromptModule>, quiet = false) => {
    setBusy(id);
    const response = await fetch(`/api/ai/modules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { module?: PromptModule; error?: string };
    setBusy(null);
    if (!response.ok || !data.module) return toast.error("Módulo", data.error ?? "Não foi possível salvar.");
    const saved = data.module;
    setModules((rows) => rows?.map((row) => (row.id === id ? { ...saved, tokens: estimateTokens(saved.contentMarkdown) } : row)) ?? rows);
    // Liga/desliga pela lista não descarta o que está sendo editado no módulo aberto.
    if (selectedId === id) setDraft((value) => (value && quiet ? { ...value, isActive: saved.isActive } : { ...saved }));
    if (!quiet) toast.success("Módulo salvo", "Vale na próxima resposta da IA.");
    return saved;
  };

  const save = async () => {
    if (!draft || !dirty) return;
    await patchModule(draft.id, draft);
    setRevisions(null);
  };

  // Ctrl+S salva o módulo aberto.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const create = async () => {
    setBusy("new");
    const response = await fetch("/api/ai/modules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Novo módulo", category: "regras", contentMarkdown: "## Novo módulo\n- ", alwaysInclude: true, isActive: false }) });
    const data = (await response.json().catch(() => ({}))) as { module?: PromptModule; error?: string };
    setBusy(null);
    if (!response.ok || !data.module) return toast.error("Módulo", data.error ?? "Não foi possível criar.");
    const created = data.module;
    setModules((rows) => [...(rows ?? []), { ...created, tokens: estimateTokens(created.contentMarkdown) }]);
    select(created);
    toast.success("Módulo criado", "Começa desligado: escreva o Markdown e ligue quando estiver pronto.");
  };

  const remove = async () => {
    if (!draft) return;
    const response = await fetch(`/api/ai/modules/${draft.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Módulo", "Não foi possível excluir.");
    const rest = (modules ?? []).filter((module) => module.id !== draft.id);
    setModules(rest);
    if (rest[0]) select(rest[0]);
    else { setSelectedId(null); setDraft(null); }
    toast.success("Módulo excluído", "Ele não entra mais no prompt.");
  };

  const move = async (id: string, direction: -1 | 1) => {
    const rows = [...(modules ?? [])];
    const index = rows.findIndex((row) => row.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    const ordered = rows.map((row, position) => ({ ...row, priorityOrder: (position + 1) * 10 }));
    setModules(ordered);
    const response = await fetch("/api/ai/modules/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ordered.map((row) => row.id) }) });
    if (!response.ok) { toast.error("Ordem", "Não foi possível salvar a ordem."); void load(); }
  };

  const loadRevisions = async () => {
    if (!draft) return;
    const response = await fetch(`/api/ai/modules/${draft.id}/revisions`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { revisions?: Revision[] };
    setRevisions(data.revisions ?? []);
  };

  const restore = async (revision: Revision) => {
    if (!draft) return;
    const response = await fetch(`/api/ai/modules/${draft.id}/revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revisionId: revision.id }) });
    const data = (await response.json().catch(() => ({}))) as { module?: PromptModule; error?: string };
    if (!response.ok || !data.module) return toast.error("Versão", data.error ?? "Não foi possível restaurar.");
    const restored = data.module;
    setModules((rows) => rows?.map((row) => (row.id === restored.id ? { ...restored, tokens: estimateTokens(restored.contentMarkdown) } : row)) ?? rows);
    setDraft({ ...restored });
    setRevisions(null);
    toast.success("Versão restaurada", "A versão que estava em uso também ficou no histórico.");
  };

  const inspect = async () => {
    setInspectOpen(true);
    setPreview(null);
    const response = await fetch("/api/ai/modules/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: previewText, firstReply: previewFirst }) });
    const data = (await response.json().catch(() => ({}))) as Preview & { error?: string };
    if (!response.ok) return toast.error("Inspeção", data.error ?? "Não foi possível montar o prompt.");
    setPreview(data);
  };

  /** Toolbar: envolve a seleção ou insere no começo da linha. */
  const format = (kind: "h2" | "bold" | "list" | "rule") => {
    const area = editorRef.current;
    if (!area || !draft) return;
    const { selectionStart: start, selectionEnd: end, value } = area;
    const selected = value.slice(start, end);
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let next = value;
    let caret = end;
    if (kind === "bold") { next = `${value.slice(0, start)}**${selected || "texto"}**${value.slice(end)}`; caret = end + 4 + (selected ? 0 : 5); }
    else {
      const prefix = kind === "h2" ? "## " : kind === "list" ? "- " : "> **REGRA:** ";
      next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
      caret = end + prefix.length;
    }
    setDraft({ ...draft, contentMarkdown: next });
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(caret, caret); });
  };

  const addKeyword = (value = keywordDraft) => {
    const keyword = value.trim().toLowerCase();
    if (!draft || !keyword || draft.keywords.includes(keyword)) return setKeywordDraft("");
    setDraft({ ...draft, keywords: [...draft.keywords, keyword] });
    setKeywordDraft("");
  };

  if (!modules) return <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white p-6 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40"><Loader2 className="h-4 w-4 animate-spin" />Carregando módulos...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: NAVY }}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Módulos de Prompt</p>
          <p className="text-[11px] text-white/70">O prompt enviado à OpenAI é só a soma dos módulos ativos, nesta ordem. Sem módulo ativo, nenhuma instrução é enviada.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] tabular-nums">{modules.filter((module) => module.isActive).length} ativos · ~{int(activeTokens)} tokens</span>
          <button type="button" onClick={() => void inspect()} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 px-3 text-xs font-semibold hover:bg-white/10"><ScanSearch className="h-4 w-4" />Inspecionar Prompt Final Montado</button>
          <button type="button" disabled={busy === "new"} onClick={() => void create()} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-60" style={{ backgroundColor: LIME, color: NAVY }}>{busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Novo Módulo Markdown</button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-2 rounded-xl border border-slate-200/70 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/40">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar módulo ou trecho" className={`${field} pl-8`} />
          </label>
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {visible.map((module) => {
              const index = modules.findIndex((row) => row.id === module.id);
              const selected = module.id === selectedId;
              return (
                <li key={module.id} className={`rounded-lg border p-2 transition ${selected ? "border-[#07163B] bg-[#07163B]/5 dark:border-[#C8E600] dark:bg-white/5" : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => select(module)} className="min-w-0 flex-1 cursor-pointer text-left">
                      <span className="block truncate text-xs font-semibold text-slate-800 dark:text-white">{module.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CATEGORY_TONE[module.category]}`}>{CATEGORY_LABEL[module.category]}</span>
                        <span className="text-[10px] text-slate-400">{module.alwaysInclude ? "sempre" : "sob demanda"} · ~{int(module.tokens)} tk</span>
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button type="button" role="switch" aria-checked={module.isActive} aria-label={`${module.isActive ? "Desativar" : "Ativar"} ${module.title}`} disabled={busy === module.id} onClick={() => void patchModule(module.id, { isActive: !module.isActive }, true)} className={`relative h-5 w-9 cursor-pointer rounded-full transition ${module.isActive ? "" : "bg-slate-300 dark:bg-slate-600"}`} style={module.isActive ? { backgroundColor: LIME } : undefined}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${module.isActive ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                      <span className="flex">
                        <button type="button" aria-label="Subir prioridade" disabled={index === 0} onClick={() => void move(module.id, -1)} className="cursor-pointer rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-white"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Descer prioridade" disabled={index === modules.length - 1} onClick={() => void move(module.id, 1)} className="cursor-pointer rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-white"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
            {!visible.length && <li className="p-3 text-center text-xs text-slate-400">{modules.length ? "Nenhum módulo com esse texto." : "Nenhum módulo: a IA responde sem instrução nenhuma (GPT padrão)."}</li>}
          </ul>
        </aside>

        {draft ? (
          <section className="min-w-0 space-y-3 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_160px]">
              <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Título
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={field} maxLength={120} />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Categoria
                <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ModuleCategory })} className={`${field} cursor-pointer`}>
                  {catalog.categories.map((category) => <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Slug
                <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} className={field} maxLength={60} />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {([[true, "Sempre incluir"], [false, "Sob demanda"]] as const).map(([value, label]) => (
                <button key={label} type="button" aria-pressed={draft.alwaysInclude === value} onClick={() => setDraft({ ...draft, alwaysInclude: value })} className={`cursor-pointer rounded-lg border px-3 py-1.5 font-semibold ${draft.alwaysInclude === value ? "border-[#07163B] text-white dark:border-[#C8E600]" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`} style={draft.alwaysInclude === value ? { backgroundColor: NAVY } : undefined}>{label}</button>
              ))}
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 font-semibold text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} className="h-4 w-4 cursor-pointer accent-[#07163B]" />Ativo
              </label>
            </div>

            {!draft.alwaysInclude && (
              <div className="space-y-2 rounded-lg border border-slate-200/70 p-3 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Entra quando a conversa tiver uma destas palavras ou condições</p>
                <div className="flex flex-wrap gap-1.5">
                  {draft.keywords.map((keyword) => (
                    <span key={keyword} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${keyword.startsWith("@") ? "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"}`} title={catalog.conditions[keyword]}>
                      {keyword}
                      <button type="button" aria-label={`Remover ${keyword}`} onClick={() => setDraft({ ...draft, keywords: draft.keywords.filter((item) => item !== keyword) })} className="cursor-pointer text-slate-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  {!draft.keywords.length && <span className="text-[11px] text-[#9a4a1c] dark:text-[#F7915E]">Sem gatilho: este módulo nunca entra.</span>}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input value={keywordDraft} onChange={(event) => setKeywordDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addKeyword(); } }} placeholder="Palavra e Enter (ex.: garantia)" className={field} />
                  <select value="" onChange={(event) => addKeyword(event.target.value)} className={`${field} cursor-pointer sm:w-72`} aria-label="Adicionar condição do motor">
                    <option value="">+ Condição do motor</option>
                    {Object.entries(catalog.conditions).map(([key, label]) => <option key={key} value={key}>{key} · {label}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/70 p-1 dark:border-slate-700">
              {([["h2", Heading2, "Título"], ["bold", Bold, "Negrito"], ["list", List, "Lista"], ["rule", Quote, "Bloco de regra"]] as const).map(([kind, Icon, label]) => (
                <button key={kind} type="button" onClick={() => format(kind)} aria-label={label} title={label} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"><Icon className="h-3.5 w-3.5" />{label}</button>
              ))}
              <select value="" onChange={(event) => { if (!event.target.value) return; setDraft({ ...draft, contentMarkdown: `${draft.contentMarkdown}${draft.contentMarkdown.endsWith("\n") || !draft.contentMarkdown ? "" : "\n"}{{${event.target.value}}}` }); }} className="h-8 cursor-pointer rounded-md border-0 bg-transparent px-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300" aria-label="Inserir variável">
                <option value="">{"{{ }} Variável"}</option>
                {Object.entries(catalog.variables).map(([key, label]) => <option key={key} value={key}>{key} · {label}</option>)}
              </select>
              <span className="ml-auto pr-2 text-[10px] tabular-nums text-slate-400">~{int(estimateTokens(draft.contentMarkdown))} tokens · {int(draft.contentMarkdown.length)} caracteres · Ctrl+S salva</span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500"><FileCode2 className="h-3.5 w-3.5" />Markdown</span>
                <textarea ref={editorRef} value={draft.contentMarkdown} onChange={(event) => setDraft({ ...draft, contentMarkdown: event.target.value })} spellCheck={false} className="h-[52vh] min-h-[320px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-900 outline-none focus:border-[#07163B] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-[#C8E600]" />
              </label>
              <div className="min-w-0">
                <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Eye className="h-3.5 w-3.5" />Prévia</span>
                <div className="h-[52vh] min-h-[320px] overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700"><MarkdownPreview text={draft.contentMarkdown} /></div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" />Excluir</button>
              <button type="button" onClick={() => void loadRevisions()} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"><History className="h-4 w-4" />Restaurar versão anterior</button>
              {dirty && <button type="button" onClick={() => current && setDraft({ ...current })} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"><RotateCcw className="h-4 w-4" />Descartar</button>}
              <button type="button" disabled={!dirty || busy === draft.id} onClick={() => void save()} className="ml-auto inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: NAVY }}>{busy === draft.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar módulo</button>
            </div>

            {revisions && (
              <div className="space-y-2 rounded-lg border border-slate-200/70 p-3 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Versões anteriores</p>
                {!revisions.length && <p className="text-[11px] text-slate-400">Ainda não há versões salvas deste módulo.</p>}
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {revisions.map((revision) => (
                    <li key={revision.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-slate-50 dark:hover:bg-white/5">
                      <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300"><strong>{new Date(revision.createdAt).toLocaleString("pt-BR")}</strong> · {revision.title} · ~{int(estimateTokens(revision.contentMarkdown))} tk</span>
                      <button type="button" onClick={() => void restore(revision)} className="cursor-pointer rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300">Restaurar</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <section className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 p-10 text-xs text-slate-400 dark:border-slate-700">Crie um módulo para começar.</section>
        )}
      </div>

      {confirmDelete && draft && <ConfirmDialog title="Excluir módulo?" description={`"${draft.title}" sai do prompt da IA e o histórico de versões dele é apagado.`} confirmLabel="Excluir" variant="destructive" onConfirm={async () => { await remove(); setConfirmDelete(false); }} onClose={() => setConfirmDelete(false)} />}

      {inspectOpen && (
        <EntityDialog titleId="ai-inspect-title" title="Prompt Final Montado" description="Exatamente o que vai na mensagem system para a OpenAI agora: só os módulos ativos, nesta ordem." onClose={() => setInspectOpen(false)} size="2xl">
          <div className="space-y-3 overflow-y-auto">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={previewText} onChange={(event) => setPreviewText(event.target.value)} placeholder="Mensagem de exemplo do cliente" className={field} />
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={previewFirst} onChange={(event) => setPreviewFirst(event.target.checked)} className="h-4 w-4 cursor-pointer accent-[#07163B]" />Primeira resposta</label>
              <button type="button" onClick={() => void inspect()} className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white" style={{ backgroundColor: NAVY }}><ScanSearch className="h-4 w-4" />Montar</button>
            </div>
            {!preview ? <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Montando...</p> : (
              <>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Modelo <strong>{preview.model}</strong> · temperatura <strong>{preview.temperature ?? "padrão"}</strong> · formato {preview.json ? "JSON" : "texto livre"} · ~{int(preview.tokens)} tokens · {preview.used.length} módulos</p>
                <div className="flex flex-wrap gap-1">{preview.used.map((module) => <span key={module.id} title={module.reason} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CATEGORY_TONE[module.category]}`}>{module.title} · {module.reason}</span>)}</div>
                {preview.system ? (
                  <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{preview.system}</pre>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700">Nenhum módulo ativo para esta mensagem: a chamada vai <strong>sem mensagem system</strong> (GPT padrão, só com as ferramentas técnicas).</p>
                )}
                <p className="text-[10px] text-slate-400">Os fatos calculados numa resposta real (busca feita, foto lida, loja resolvida) entram em {"{{contexto_do_turno}}"} e aparecem no Testar IA Agora.</p>
              </>
            )}
          </div>
        </EntityDialog>
      )}
    </div>
  );
}
