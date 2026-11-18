"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpenText, Boxes, Calculator, ChevronDown, CreditCard, FileText, FileUp, GitBranch, Headset, Loader2, PackageSearch, Pencil, Plus, RefreshCw, Save, Search, Sparkles, Trash2, Wand2, Wrench, Zap } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { EntityDialog } from "@/components/EntityDialog";
import { skillSlug, slugify, type AiSkill, type BusinessRule, type KnowledgeChunkHit, type SkillKey } from "@/lib/ai/studio";

const input = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#C4D600]";
const area = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-900 outline-none focus:border-[#002187] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#C4D600]";
const primary = "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#002187] px-3 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5";

function Panel({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200/70 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#051647] dark:text-white">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`relative inline-flex h-6 w-11 shrink-0 items-center ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`} title={label}>
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-[#C4D600] peer-focus-visible:ring-2 peer-focus-visible:ring-[#002187] dark:bg-slate-600" />
      <span className="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

/** Expande/recolhe com transição suave de altura (grid 0fr → 1fr); recolhido fica fora do foco do teclado. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-all duration-200 ease-in-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!open} inert={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir.");
  return data;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---------------------------------------------------------------- Regras da empresa

type RuleDraft = BusinessRule & { keywordsText: string; dirty?: boolean; isNew?: boolean };
const RULE_TEMPLATES: { title: string; keywords: string; content: string }[] = [
  { title: "Programa de Indicação", keywords: "indicação, indicar, indique, amigo, bônus", content: "## Como funciona\n- Descreva aqui o benefício de quem indica e de quem é indicado.\n\n## Regras\n- Validade, limite de uso e como resgatar." },
  { title: "Endereços das Lojas", keywords: "endereço, loja, onde fica, localização, unidade", content: "## Lojas\n- **Loja Centro**: Rua ..., nº ... — Cidade/UF\n\n> A IA também usa o cadastro de Lojas automaticamente." },
  { title: "Políticas de Garantia", keywords: "garantia, defeito, troca, conserto, quebrou", content: "## Garantia\n- Armações: ...\n- Lentes: ...\n\n## Trocas\n- Prazo e condições." },
  { title: "Informações Gerais", keywords: "", content: "## Sobre a empresa\n- Informações que valem para qualquer conversa." },
];
const toDraft = (rule: BusinessRule): RuleDraft => ({ ...rule, keywordsText: rule.keywords.join(", ") });

export function RulesSection() {
  const toast = useToast();
  const [rules, setRules] = useState<RuleDraft[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    api<{ rules: BusinessRule[] }>("/api/ai/rules")
      .then((data) => { if (active) setRules(data.rules.map(toDraft)); })
      .catch((cause: unknown) => {
        if (!active) return;
        toast.error("Regras da empresa", cause instanceof Error ? cause.message : "Não foi possível carregar.");
        setRules([]);
      });
    return () => { active = false; };
  }, [toast]);

  const patch = (id: string, change: Partial<RuleDraft>) => setRules((current) => current?.map((rule) => (rule.id === id ? { ...rule, ...change, dirty: true } : rule)) ?? current);
  const add = (template?: (typeof RULE_TEMPLATES)[number]) => {
    const id = `novo-${Date.now()}`;
    const title = template?.title ?? "Nova regra";
    setRules((current) => [...(current ?? []), { id, title, slug: slugify(title), keywords: [], keywordsText: template?.keywords ?? "", content: template?.content ?? "", order: (current?.length ?? 0) * 10, active: true, alwaysInclude: template?.title === "Informações Gerais", dirty: true, isNew: true }]);
    setOpen(id);
  };
  const save = async (rule: RuleDraft) => {
    setBusy(rule.id);
    try {
      const body = { title: rule.title, slug: rule.slug, keywords: rule.keywordsText.split(/[,\n]/).map((item) => item.trim()).filter(Boolean), content: rule.content, order: rule.order, active: rule.active, alwaysInclude: rule.alwaysInclude };
      const data = rule.isNew ? await api<{ rule: BusinessRule }>("/api/ai/rules", json("POST", body)) : await api<{ rule: BusinessRule }>(`/api/ai/rules/${rule.id}`, json("PUT", body));
      setRules((current) => current?.map((item) => (item.id === rule.id ? toDraft(data.rule) : item)) ?? current);
      if (open === rule.id) setOpen(data.rule.id);
      toast.success("Regra salva", "A IA já usa a nova versão nas próximas respostas.");
    } catch (cause) {
      toast.error("Erro ao salvar a regra", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };
  const toggleActive = async (rule: RuleDraft, active: boolean) => {
    if (rule.isNew) return patch(rule.id, { active });
    setRules((current) => current?.map((item) => (item.id === rule.id ? { ...item, active } : item)) ?? current);
    try {
      await api(`/api/ai/rules/${rule.id}`, json("PUT", { active }));
    } catch (cause) {
      setRules((current) => current?.map((item) => (item.id === rule.id ? { ...item, active: !active } : item)) ?? current);
      toast.error("Erro ao atualizar", cause instanceof Error ? cause.message : "Tente de novo.");
    }
  };
  const remove = async (rule: RuleDraft) => {
    if (!rule.isNew && !window.confirm(`Excluir a regra "${rule.title}"?`)) return;
    setBusy(rule.id);
    try {
      if (!rule.isNew) await api(`/api/ai/rules/${rule.id}`, { method: "DELETE" });
      setRules((current) => current?.filter((item) => item.id !== rule.id) ?? current);
    } catch (cause) {
      toast.error("Erro ao excluir", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = (rules ?? []).filter((rule) => !query.trim() || plain(`${rule.title} ${rule.keywordsText} ${rule.content}`).includes(plain(query.trim())));
  const active = (rules ?? []).filter((rule) => rule.active && !rule.isNew).length;

  return (
    <Panel
      title="Regras da empresa"
      hint="Uma regra em Markdown por assunto. A IA só carrega a regra quando uma palavra-chave (ou o título) aparece na conversa, ou sempre, se marcada. Salvou, já vale: sem mexer em código."
      action={<button type="button" onClick={() => add()} className={primary}><Plus className="h-3.5 w-3.5" />Nova regra</button>}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título, palavra-chave ou conteúdo" aria-label="Buscar regra" className={`${input} pl-8`} />
        </div>
        <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{rules?.length ?? 0} regra{rules?.length === 1 ? "" : "s"} · {active} ativa{active === 1 ? "" : "s"}</p>
      </div>

      {!rules ? <p className="flex items-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando regras...</p> : rules.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed border-slate-200 p-4 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma regra ainda. Comece por um modelo:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {RULE_TEMPLATES.map((template) => (
              <button key={template.title} type="button" onClick={() => add(template)} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-[#051647] hover:border-[#002187] dark:border-slate-700 dark:text-white dark:hover:border-[#C4D600]">
                <Wand2 className="h-3.5 w-3.5 shrink-0 text-[#002187] dark:text-[#C4D600]" />{template.title}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/70 dark:divide-slate-800 dark:border-slate-800">
          {visible.map((rule) => {
            const expanded = open === rule.id;
            return (
              <li key={rule.id} className="bg-white dark:bg-slate-900/40">
                <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : rule.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ease-in-out ${expanded ? "rotate-180" : ""}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`truncate text-sm font-medium ${rule.active ? "text-[#051647] dark:text-white" : "text-slate-400 line-through"}`}>{rule.title || "Sem título"}</span>
                        {rule.alwaysInclude && <span className="rounded-full bg-[#002187]/10 px-2 py-0.5 text-[10px] font-semibold text-[#002187] dark:bg-white/10 dark:text-[#C4D600]">Sempre</span>}
                        {rule.dirty && <span className="rounded-full bg-[#F7915E]/15 px-2 py-0.5 text-[10px] font-semibold text-[#9a4a1c] dark:text-[#F7915E]">Não salva</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">/{rule.slug} · {rule.keywordsText || (rule.alwaysInclude ? "todas as conversas" : "sem palavras-chave (só pelo título)")}</span>
                    </span>
                  </button>
                  <Switch label={`Regra ${rule.title} ativa`} checked={rule.active} onChange={(value) => void toggleActive(rule, value)} />
                  <button type="button" aria-label={`Excluir ${rule.title}`} title="Excluir regra" disabled={busy === rule.id} onClick={() => void remove(rule)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"><Trash2 className="h-4 w-4" /></button>
                </div>
                <Collapse open={expanded}>
                  <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4 dark:border-slate-800 dark:bg-white/[0.03]">
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Título
                        <input value={rule.title} onChange={(event) => patch(rule.id, { title: event.target.value, ...(rule.isNew ? { slug: slugify(event.target.value) } : {}) })} className={input} maxLength={120} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Slug
                        <input value={rule.slug} onChange={(event) => patch(rule.id, { slug: event.target.value })} onBlur={(event) => patch(rule.id, { slug: slugify(event.target.value || rule.title) })} className={`${input} font-mono`} maxLength={60} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Ordem
                        <input type="number" value={rule.order} onChange={(event) => patch(rule.id, { order: Number(event.target.value) })} className={input} />
                      </label>
                    </div>
                    <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Palavras-chave / gatilho do assunto
                      <input value={rule.keywordsText} onChange={(event) => patch(rule.id, { keywordsText: event.target.value })} placeholder="Separadas por vírgula (ex.: indicação, indicar, bônus)" className={input} />
                    </label>
                    <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Conteúdo (Markdown)
                      <textarea rows={Math.min(20, Math.max(8, rule.content.split("\n").length + 1))} value={rule.content} onChange={(event) => patch(rule.id, { content: event.target.value })} className={`${area} resize-y font-mono`} />
                      <span className="block text-right text-[10px] font-normal text-slate-400">{rule.content.length.toLocaleString("pt-BR")} caracteres</span>
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                        <Switch label="Sempre incluir" checked={rule.alwaysInclude} onChange={(value) => patch(rule.id, { alwaysInclude: value })} />Sempre incluir (independe do assunto)
                      </label>
                      <button type="button" disabled={busy === rule.id || !rule.dirty} onClick={() => void save(rule)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-4 text-xs font-bold text-[#051647] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
                        {busy === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar regra
                      </button>
                    </div>
                  </div>
                </Collapse>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">Nenhuma regra encontrada para essa busca.</li>}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- Skills

const SKILL_ICONS: Record<SkillKey, typeof Boxes> = { estoque_cidade: PackageSearch, leitura_receita: FileText, calculo_lentes: Calculator, crediario_aprovacao: CreditCard, pipeline_automatico: GitBranch, transbordo_humano: Headset };
type SkillDraft = AiSkill & { dirty?: boolean; isNew?: boolean };
type ToolMap = Record<SkillKey, { tools: string[]; flows: string }>;

export function SkillsSection() {
  const toast = useToast();
  const [skills, setSkills] = useState<SkillDraft[] | null>(null);
  const [tools, setTools] = useState<Partial<ToolMap>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ skills: AiSkill[]; tools: ToolMap }>("/api/ai/skills")
      .then((data) => { if (active) { setSkills(data.skills); setTools(data.tools ?? {}); } })
      .catch((cause: unknown) => {
        if (!active) return;
        toast.error("Skills da IA", cause instanceof Error ? cause.message : "Não foi possível carregar.");
        setSkills([]);
      });
    return () => { active = false; };
  }, [toast]);

  const patch = (id: string, change: Partial<SkillDraft>) => setSkills((current) => current?.map((skill) => (skill.id === id ? { ...skill, ...change, dirty: true } : skill)) ?? current);
  const add = () => {
    const id = `novo-${Date.now()}`;
    setSkills((current) => [...(current ?? []), { id, name: "Nova skill", slug: skillSlug("Nova skill"), triggerDescription: "", instructionsMd: "## Protocolo\n1. ...\n2. ...", isActive: true, sortOrder: ((current?.length ?? 0) + 1) * 10, builtin: false, dirty: true, isNew: true }]);
    setOpen(id);
  };
  const save = async (skill: SkillDraft) => {
    setBusy(skill.id);
    try {
      const body = { name: skill.name, slug: skill.slug, triggerDescription: skill.triggerDescription, instructionsMd: skill.instructionsMd, isActive: skill.isActive, sortOrder: skill.sortOrder };
      const data = skill.isNew ? await api<{ skill: AiSkill }>("/api/ai/skills", json("POST", body)) : await api<{ skill: AiSkill }>(`/api/ai/skills/${skill.id}`, json("PUT", body));
      setSkills((current) => current?.map((item) => (item.id === skill.id ? data.skill : item)) ?? current);
      if (open === skill.id) setOpen(data.skill.id);
      toast.success("Skill salva", "A IA já segue o novo protocolo nas próximas respostas.");
    } catch (cause) {
      toast.error("Erro ao salvar a skill", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };
  const toggleActive = async (skill: SkillDraft, isActive: boolean) => {
    if (skill.isNew) return patch(skill.id, { isActive });
    setSkills((current) => current?.map((item) => (item.id === skill.id ? { ...item, isActive } : item)) ?? current);
    try {
      await api(`/api/ai/skills/${skill.id}`, json("PUT", { isActive }));
      toast.success(isActive ? "Skill ligada" : "Skill desligada", skill.builtin && !isActive ? "A ferramenta e o fluxo ligados a ela também foram desligados." : skill.name);
    } catch (cause) {
      setSkills((current) => current?.map((item) => (item.id === skill.id ? { ...item, isActive: !isActive } : item)) ?? current);
      toast.error("Erro ao atualizar", cause instanceof Error ? cause.message : "Tente de novo.");
    }
  };
  const remove = async (skill: SkillDraft) => {
    if (!skill.isNew && !window.confirm(`Excluir a skill "${skill.name}"?`)) return;
    setBusy(skill.id);
    try {
      if (!skill.isNew) await api(`/api/ai/skills/${skill.id}`, { method: "DELETE" });
      setSkills((current) => current?.filter((item) => item.id !== skill.id) ?? current);
    } catch (cause) {
      toast.error("Erro ao excluir", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  const activeCount = (skills ?? []).filter((skill) => skill.isActive && !skill.isNew).length;

  return (
    <Panel
      title="Skills (habilidades)"
      hint="Cada skill é um protocolo em Markdown: quando o assunto bate com o gatilho, a IA segue as instruções à risca. Nas skills nativas, desligar o toggle também desliga a ferramenta e o fluxo do CRM ligados a ela."
      action={<button type="button" onClick={add} className={primary}><Plus className="h-3.5 w-3.5" />Nova skill</button>}
    >
      <p className="text-xs text-slate-500 dark:text-slate-400">{skills?.length ?? 0} skill{skills?.length === 1 ? "" : "s"} · {activeCount} ativa{activeCount === 1 ? "" : "s"}</p>
      {!skills ? <p className="flex items-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando skills...</p> : skills.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Nenhuma skill cadastrada. Use “Nova skill”.</p>
      ) : (
        <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/70 dark:divide-slate-800 dark:border-slate-800">
          {skills.map((skill) => {
            const expanded = open === skill.id;
            const key = skill.builtin ? (skill.slug as SkillKey) : null;
            const Icon = (key && SKILL_ICONS[key]) || Sparkles;
            const linked = key ? tools[key] : undefined;
            return (
              <li key={skill.id} className="bg-white dark:bg-slate-900/40">
                <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : skill.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ease-in-out ${expanded ? "rotate-180" : ""}`} />
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${skill.isActive ? "bg-[#051647] text-[#C4D600]" : "bg-slate-100 text-slate-400 dark:bg-white/10"}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`truncate text-sm font-medium ${skill.isActive ? "text-[#051647] dark:text-white" : "text-slate-400 line-through"}`}>{skill.name || "Sem nome"}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${skill.builtin ? "bg-[#002187]/10 text-[#002187] dark:bg-white/10 dark:text-[#C4D600]" : "bg-[#F7915E]/15 text-[#9a4a1c] dark:text-[#F7915E]"}`}>{skill.builtin ? "Nativa" : "Customizada"}</span>
                        {skill.dirty && <span className="rounded-full bg-[#F7915E]/15 px-2 py-0.5 text-[10px] font-semibold text-[#9a4a1c] dark:text-[#F7915E]">Não salva</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{skill.triggerDescription || "Sem gatilho definido"}</span>
                    </span>
                  </button>
                  <Switch label={`Skill ${skill.name} ativa`} checked={skill.isActive} onChange={(value) => void toggleActive(skill, value)} />
                  {!skill.builtin && <button type="button" aria-label={`Excluir ${skill.name}`} title="Excluir skill" disabled={busy === skill.id} onClick={() => void remove(skill)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"><Trash2 className="h-4 w-4" /></button>}
                </div>
                <Collapse open={expanded}>
                  <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4 dark:border-slate-800 dark:bg-white/[0.03]">
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Nome
                        <input value={skill.name} onChange={(event) => patch(skill.id, { name: event.target.value, ...(skill.isNew ? { slug: skillSlug(event.target.value) } : {}) })} className={input} maxLength={120} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Slug
                        <input value={skill.slug} readOnly={skill.builtin} title={skill.builtin ? "Slug fixo: liga a skill às ferramentas do CRM" : undefined} onChange={(event) => patch(skill.id, { slug: event.target.value })} onBlur={(event) => { if (!skill.builtin) patch(skill.id, { slug: skillSlug(event.target.value || skill.name) }); }} className={`${input} font-mono read-only:opacity-60`} maxLength={60} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Ordem
                        <input type="number" value={skill.sortOrder} onChange={(event) => patch(skill.id, { sortOrder: Number(event.target.value) })} className={input} />
                      </label>
                    </div>
                    {linked && (
                      <p className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <Wrench className="h-3.5 w-3.5 shrink-0" />{linked.flows}
                        {linked.tools.map((tool) => <code key={tool} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">{tool}</code>)}
                      </p>
                    )}
                    <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Quando acionar (gatilho)
                      <input value={skill.triggerDescription} onChange={(event) => patch(skill.id, { triggerDescription: event.target.value })} placeholder="Ex.: cliente pergunta de parcelas, boleto ou crediário" className={input} maxLength={600} />
                    </label>
                    <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Instruções (Markdown)
                      <textarea rows={Math.min(22, Math.max(8, skill.instructionsMd.split("\n").length + 1))} value={skill.instructionsMd} onChange={(event) => patch(skill.id, { instructionsMd: event.target.value })} className={`${area} resize-y font-mono`} />
                      <span className="block text-right text-[10px] font-normal text-slate-400">{skill.instructionsMd.length.toLocaleString("pt-BR")} caracteres</span>
                    </label>
                    <div className="flex justify-end">
                      <button type="button" disabled={busy === skill.id || !skill.dirty} onClick={() => void save(skill)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C4D600] px-4 text-xs font-bold text-[#051647] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
                        {busy === skill.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar skill
                      </button>
                    </div>
                  </div>
                </Collapse>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- Base de conhecimento (RAG)

type KnowledgeDoc = { id: string; title: string; source: string; fileName: string | null; active: boolean; status: string; error: string | null; chunkCount: number; systemKey?: string | null; createdAt: string };

/** Edição do Markdown de um documento (fonte automática ou texto cadastrado). */
function KnowledgeEditor({ document, onClose, onSaved }: { document: KnowledgeDoc; onClose: () => void; onSaved: (document: KnowledgeDoc) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ document: KnowledgeDoc & { content: string } }>(`/api/ai/knowledge/${document.id}`)
      .then((data) => { if (active) setContent(data.document.content); })
      .catch((cause: unknown) => {
        if (!active) return;
        toast.error("Base de conhecimento", cause instanceof Error ? cause.message : "Não foi possível abrir o documento.");
        onClose();
      });
    return () => { active = false; };
  }, [document.id, toast, onClose]);

  const save = async () => {
    if (content === null) return;
    setSaving(true);
    try {
      const data = await api<{ document: KnowledgeDoc }>(`/api/ai/knowledge/${document.id}`, json("PATCH", { title, content }));
      onSaved(data.document);
      toast.success("Documento salvo", document.systemKey ? "A IA usa o novo texto na próxima resposta." : "Texto reindexado para a busca da IA.");
      onClose();
    } catch (cause) {
      toast.error("Erro ao salvar", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityDialog titleId="knowledge-editor" title="Editar documento" description={document.systemKey ? "Fonte automática: o texto orienta a IA e os dados do sistema (lojas, horários, preços) entram atualizados logo abaixo." : "Conteúdo em Markdown usado pela busca da IA."} onClose={onClose} size="lg">
      {content === null ? <p className="flex items-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</p> : (
        <div className="space-y-3">
          <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Título
            <input value={title} onChange={(event) => setTitle(event.target.value)} className={input} maxLength={160} />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Conteúdo (Markdown)
            <textarea rows={14} value={content} onChange={(event) => setContent(event.target.value)} className={`${area} resize-y font-mono`} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={ghost}>Cancelar</button>
            <button type="button" disabled={saving || !title.trim() || !content.trim()} onClick={() => void save()} className={primary}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Salvar</button>
          </div>
        </div>
      )}
    </EntityDialog>
  );
}
const STATUS: Record<string, { label: string; cls: string }> = {
  indexado: { label: "Indexado", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  parcial: { label: "Só busca textual", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  pendente: { label: "Pendente", cls: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400" },
  erro: { label: "Erro", cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

export function KnowledgeSection() {
  const toast = useToast();
  const [documents, setDocuments] = useState<KnowledgeDoc[] | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<KnowledgeChunkHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    api<{ documents: KnowledgeDoc[] }>("/api/ai/knowledge")
      .then((data) => { if (active) setDocuments(data.documents); })
      .catch((cause: unknown) => {
        if (!active) return;
        toast.error("Base de conhecimento", cause instanceof Error ? cause.message : "Não foi possível carregar.");
        setDocuments([]);
      });
    return () => { active = false; };
  }, [toast]);

  const created = (document: KnowledgeDoc) => {
    setDocuments((current) => [document, ...(current ?? [])]);
    toast.success("Documento indexado", `${document.chunkCount} trecho${document.chunkCount === 1 ? "" : "s"} gerado${document.chunkCount === 1 ? "" : "s"}.`);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      if (title.trim()) form.append("title", title.trim());
      created((await api<{ document: KnowledgeDoc }>("/api/ai/knowledge", { method: "POST", body: form })).document);
      setTitle("");
    } catch (cause) {
      toast.error("Erro ao enviar o arquivo", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };
  const addText = async () => {
    setBusy("text");
    try {
      created((await api<{ document: KnowledgeDoc }>("/api/ai/knowledge", json("POST", { title, content }))).document);
      setTitle("");
      setContent("");
    } catch (cause) {
      toast.error("Erro ao cadastrar o texto", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };
  const update = async (document: KnowledgeDoc, body: { active?: boolean; reindex?: boolean }) => {
    setBusy(document.id);
    try {
      const data = await api<{ document: KnowledgeDoc }>(`/api/ai/knowledge/${document.id}`, json("PATCH", body));
      setDocuments((current) => current?.map((item) => (item.id === document.id ? data.document : item)) ?? current);
    } catch (cause) {
      toast.error("Erro ao atualizar", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };
  const remove = async (document: KnowledgeDoc) => {
    if (!window.confirm(`Excluir "${document.title}" da base de conhecimento?`)) return;
    setBusy(document.id);
    try {
      await api(`/api/ai/knowledge/${document.id}`, { method: "DELETE" });
      setDocuments((current) => current?.filter((item) => item.id !== document.id) ?? current);
    } catch (cause) {
      toast.error("Erro ao excluir", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setBusy(null);
    }
  };
  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setHits((await api<{ hits: KnowledgeChunkHit[] }>("/api/ai/knowledge/search", json("POST", { query }))).hits);
    } catch (cause) {
      toast.error("Erro na busca", cause instanceof Error ? cause.message : "Tente de novo.");
    } finally {
      setSearching(false);
    }
  };
  const totalChunks = (documents ?? []).filter((item) => item.active).reduce((sum, item) => sum + item.chunkCount, 0);

  return (
    <div className="space-y-6">
      <Panel title="Adicionar à base de conhecimento" hint="Tabelas de lentes, manuais, catálogos e textos longos. O conteúdo é dividido em trechos e, a cada pergunta, a IA recebe só os mais relevantes (busca textual + vetorial com embeddings OpenAI).">
        <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Tabela de lentes 2026 (opcional para arquivo)" className={input} maxLength={160} />
        </label>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Texto longo
            <textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Cole aqui o conteúdo (Markdown ou texto simples)" className={`${area} resize-y`} />
          </label>
          <div className="flex flex-col gap-2 lg:pt-5">
            <button type="button" disabled={!title.trim() || !content.trim() || !!busy} onClick={() => void addText()} className={primary}>{busy === "text" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Cadastrar texto</button>
            <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className={ghost}>{busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}{busy === "upload" ? "Lendo e indexando..." : "Enviar arquivo (.pdf, .txt, .md)"}</button>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
            <p className="text-[10px] text-slate-400">Até 10 MB. PDF é lido pela IA (conta no consumo).</p>
          </div>
        </div>
      </Panel>

      <Panel title="Documentos indexados" hint={`${documents?.length ?? 0} documento${documents?.length === 1 ? "" : "s"} · ${totalChunks} trecho${totalChunks === 1 ? "" : "s"} ativos para a IA`}>
        {!documents ? <p className="flex items-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</p> : documents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Nenhum documento ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/70 dark:divide-slate-800 dark:border-slate-800">
            {documents.map((document) => {
              const status = STATUS[document.status] ?? STATUS.pendente;
              return (
                <li key={document.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
                  <BookOpenText className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                  <div className="min-w-0 flex-1">
                    <p className={`break-words text-sm font-medium ${document.active ? "text-[#051647] dark:text-white" : "text-slate-400 line-through"}`}>{document.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {document.systemKey ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#C4D600]/25 px-2 py-0.5 text-[10px] font-semibold text-[#051647] dark:text-[#C4D600]"><Zap className="h-3 w-3" />Fonte automática</span>
                          MD · entra inteira no atendimento, com os dados do sistema atualizados
                        </>
                      ) : <>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
                      {document.chunkCount} trecho{document.chunkCount === 1 ? "" : "s"} · {document.source.toUpperCase()}{document.fileName ? ` · ${document.fileName}` : ""}
                      </>}
                      {document.error && <span className="text-red-600 dark:text-red-300">· {document.error}</span>}
                    </p>
                  </div>
                  <Switch label={`Documento ${document.title} ativo`} checked={document.active} disabled={busy === document.id} onChange={(value) => void update(document, { active: value })} />
                  {(document.systemKey || document.source === "texto" || document.source === "md" || document.source === "txt") && (
                    <button type="button" title="Editar" aria-label={`Editar ${document.title}`} disabled={busy === document.id} onClick={() => setEditing(document)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/10 dark:hover:text-[#C4D600]"><Pencil className="h-4 w-4" /></button>
                  )}
                  {!document.systemKey && <>
                  <button type="button" title="Reindexar" aria-label={`Reindexar ${document.title}`} disabled={busy === document.id} onClick={() => void update(document, { reindex: true })} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#002187] dark:hover:bg-white/10 dark:hover:text-[#C4D600]"><RefreshCw className={`h-4 w-4 ${busy === document.id ? "animate-spin" : ""}`} /></button>
                  <button type="button" title="Excluir" aria-label={`Excluir ${document.title}`} disabled={busy === document.id} onClick={() => void remove(document)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15"><Trash2 className="h-4 w-4" /></button>
                  </>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {editing && <KnowledgeEditor document={editing} onClose={closeEditor} onSaved={(saved) => setDocuments((current) => current?.map((item) => (item.id === saved.id ? saved : item)) ?? current)} />}

      <Panel title="Testar busca RAG" hint="Escreva uma pergunta como o cliente faria e veja quais trechos a IA recuperaria (os mais relevantes entram na resposta).">
        <div className="flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="Ex.: qual a diferença entre lente 1.67 e 1.74?" className={input} />
          <button type="button" disabled={searching || !query.trim()} onClick={() => void search()} className={primary}>{searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}Buscar</button>
        </div>
        {hits && (hits.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum trecho relevante: a IA responderia sem a base de conhecimento.</p> : (
          <ol className="space-y-2">
            {hits.map((hit, position) => (
              <li key={`${hit.documentId}-${hit.index}`} className="min-w-0 rounded-lg border border-slate-200/70 p-3 dark:border-slate-800">
                <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#051647] dark:text-white">
                  <span className="rounded bg-[#051647] px-1.5 text-[10px] text-[#C4D600]">#{position + 1}</span>{hit.documentTitle} · trecho {hit.index + 1}
                  <span className="font-normal text-slate-500 dark:text-slate-400">relevância {(hit.score * 100).toFixed(0)}%{hit.vector !== null ? ` (vetorial ${(hit.vector * 100).toFixed(0)}% · texto ${(hit.lexical * 100).toFixed(0)}%)` : " (só texto)"}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">{hit.content}</p>
              </li>
            ))}
          </ol>
        ))}
      </Panel>
    </div>
  );
}
