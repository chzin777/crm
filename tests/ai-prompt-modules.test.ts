import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "@/lib/ai/agent-core";
import { assemblePrompt, normalizeModuleInput, wantsJson, type PromptModule } from "@/lib/ai/prompt-modules";
import { buildCopilotPrompt } from "@/lib/ai/reply-copilot";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { SEED_MODULES } from "./helpers/prompt-seed";

const mod = (over: Partial<PromptModule>): PromptModule => ({ id: over.slug ?? "m", slug: "m", title: "Módulo", category: "regras", contentMarkdown: "texto", isActive: true, alwaysInclude: true, keywords: [], priorityOrder: 10, ...over });
const customer = { name: "Ana", city: null, store: null, tier: null, rfvpSegment: null, campaign: null };

describe("1) módulos desligados ou vazios → sem prompt de sistema", () => {
  it("nenhum módulo, todos desligados ou todos vazios: system vazio, sem JSON forçado", () => {
    const off = SEED_MODULES.map((module) => ({ ...module, isActive: false }));
    const empty = SEED_MODULES.map((module) => ({ ...module, contentMarkdown: "   " }));
    for (const modules of [[], off, empty]) {
      const assembled = assembleSystemPrompt({ modules, settings: DEFAULT_AI_SETTINGS, info: "Lojas: LJ 10", knowledge: "garantia 1 ano", firstReply: true, extra: ["fato do turno"] });
      expect(assembled.system).toBe("");
      expect(assembled.used).toEqual([]);
      expect(assembled.tokens).toBe(0);
      expect(wantsJson(assembled.system)).toBe(false);
      expect(buildCopilotPrompt({ modules, settings: DEFAULT_AI_SETTINGS, agentName: "Ana", knowledge: "x", customer })).toBe("");
    }
  });

  it("o agente manda a chamada sem mensagem system quando o prompt montado é vazio", () => {
    const source = readFileSync(join(process.cwd(), "lib", "ai", "agent.ts"), "utf8");
    expect(source).toMatch(/system \? \[\{ role: "system", content: system \}, userMessage\] : \[userMessage\]/);
    expect(source).toMatch(/plainText: !wantsJson\(system\)/);
  });

  it("nenhum texto de prompt fixo sobrou no código da IA (antigos arquivos .md e constantes)", () => {
    for (const file of ["agent-core.ts", "prompt-composer.ts", "routing.ts", "guard.ts", "business-guard.ts", "catalog-search.ts", "stock.ts"]) {
      const source = readFileSync(join(process.cwd(), "lib", "ai", file), "utf8");
      expect(source, file).not.toMatch(/SEGURANÇA \(regras do sistema|SAUDAÇÃO \(primeira resposta|ROTEAMENTO DO TRANSBORDO \(regra fixa\)|loadPromptModule\(/);
    }
  });
});

describe("2) ligar, editar, reordenar e desligar refletem na hora", () => {
  const a = mod({ id: "a", slug: "a", title: "A", contentMarkdown: "REGRA A", priorityOrder: 10 });
  const b = mod({ id: "b", slug: "b", title: "B", contentMarkdown: "REGRA B", priorityOrder: 20 });
  const c = mod({ id: "c", slug: "c", title: "C", contentMarkdown: "GARANTIA C", alwaysInclude: false, keywords: ["garantia"], priorityOrder: 30 });
  const run = (modules: PromptModule[], text = "oi") => assemblePrompt(modules, { conversationText: text, conditions: [], vars: {} });

  it("ordem de prioridade, sob demanda por palavra e desligar", () => {
    expect(run([b, a, c]).system).toBe("REGRA A\n\nREGRA B");
    expect(run([a, b, c], "tem garantia?").system).toBe("REGRA A\n\nREGRA B\n\nGARANTIA C");
    expect(run([a, b, c], "tem garantia?").used.find((item) => item.id === "c")?.reason).toMatch(/garantia/);
    expect(run([{ ...a, isActive: false }, b]).system).toBe("REGRA B");
  });

  it("editar o Markdown e reordenar mudam o prompt seguinte", () => {
    expect(run([{ ...a, contentMarkdown: "REGRA A v2" }, b]).system).toBe("REGRA A v2\n\nREGRA B");
    expect(run([{ ...a, priorityOrder: 40 }, b]).system).toBe("REGRA B\n\nREGRA A");
  });

  it("ativar um módulo novo no motor real entra no system; desativar tira", () => {
    const novo = mod({ id: "novo", slug: "politica-troca", contentMarkdown: "Troca em até 7 dias.", priorityOrder: 5 });
    const on = assembleSystemPrompt({ modules: [...SEED_MODULES, novo], settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(on.system.startsWith("Troca em até 7 dias.")).toBe(true);
    expect(on.used[0].slug).toBe("politica-troca");
    const off = assembleSystemPrompt({ modules: [...SEED_MODULES, { ...novo, isActive: false }], settings: DEFAULT_AI_SETTINGS, info: "" });
    expect(off.system).not.toContain("Troca em até 7 dias.");
  });

  it("validação do cadastro: slug normalizado e categoria válida", () => {
    const ok = normalizeModuleInput({ title: "Política de Trocas", category: "regras", contentMarkdown: "x" });
    expect("error" in ok ? null : ok.slug).toBe("politica-de-trocas");
    const bad = normalizeModuleInput({ title: "X", category: "inexistente" as PromptModule["category"], contentMarkdown: "x" });
    expect("error" in bad || ["persona", "regras", "conhecimento", "lojas", "fluxo"].includes(bad.category)).toBe(true);
  });
});

describe("3) prévia e playground usam o mesmo montador da produção", () => {
  it("inspectSystemPrompt (Inspecionar Prompt) e o atendimento (WhatsApp e Testar IA Agora) chamam assembleSystemPrompt", () => {
    const agent = readFileSync(join(process.cwd(), "lib", "ai", "agent.ts"), "utf8");
    const inspect = agent.slice(agent.indexOf("export async function inspectSystemPrompt"));
    expect(inspect).toMatch(/assembleSystemPrompt\(/);
    expect(inspect).toMatch(/loadPromptModules\(\)/);
    // O playground (simulateAgent) roda o mesmo runAiAgent do WhatsApp, que monta com assembleSystemPrompt.
    const simulate = agent.slice(agent.indexOf("export async function simulateAgent"), agent.indexOf("export async function inspectSystemPrompt"));
    expect(simulate).toMatch(/runAiAgent(Internal)?\(/);
    expect(agent.match(/assembleSystemPrompt\(/g)?.length).toBeGreaterThanOrEqual(2);
    const route = readFileSync(join(process.cwd(), "app", "api", "ai", "modules", "preview", "route.ts"), "utf8");
    expect(route).toMatch(/inspectSystemPrompt/);
  });
});
