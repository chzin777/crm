import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({
  rules: [] as Row[],
  skills: [] as Row[],
  legacySkills: [] as { key: string; enabled: boolean; instructions: string }[],
  workspace: new Map<string, unknown>(),
  topics: [] as { id: string; title: string; enabled: boolean; content: string }[],
  seq: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ requireModule: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/ai/openai", () => ({ aiConfigured: () => false, aiJson: vi.fn(), embedTexts: vi.fn(async () => []), AiError: class extends Error {} }));
vi.mock("@/lib/ai/store", () => ({ readAiSettings: vi.fn(async () => ({ topics: db.topics })) }));

const helpers = vi.hoisted(() => {
  const bySlug = (rows: Record<string, unknown>[], slug: unknown) => rows.find((row) => row.slug === slug) ?? null;
  /** createMany com skipDuplicates por slug, como o Postgres com índice único. */
  const insertMany = (table: "rules" | "skills", prefix: string, data: Record<string, unknown>[]) => {
    let count = 0;
    for (const item of data) {
      if (bySlug(db[table], item.slug)) continue;
      db[table].push({ id: `${prefix}${(db.seq += 1)}`, ...item });
      count += 1;
    }
    return { count };
  };
  return { bySlug, insertMany };
});


vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmWorkspaceData: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.workspace.has(where.key) ? { key: where.key, value: db.workspace.get(where.key) } : null)),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => { if (!db.workspace.has(where.key)) db.workspace.set(where.key, create.value); return {}; }),
    },
    aiBusinessRule: {
      findMany: vi.fn(async (args?: { where?: { active?: boolean } }) => db.rules.filter((rule) => args?.where?.active === undefined || rule.active === args.where.active)),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => helpers.insertMany("rules", "r", data)),
    },
    aiSkillConfig: { findMany: vi.fn(async () => db.legacySkills) },
    aiSkill: {
      count: vi.fn(async () => db.skills.length),
      findMany: vi.fn(async () => [...db.skills].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) => (where.id ? db.skills.find((row) => row.id === where.id) ?? null : helpers.bySlug(db.skills, where.slug))),
      findFirst: vi.fn(async ({ where }: { where: { slug: string; id: { not: string } } }) => db.skills.find((row) => row.slug === where.slug && row.id !== where.id.not) ?? null),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => helpers.insertMany("skills", "s", data)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `s${(db.seq += 1)}`, ...data }; db.skills.push(row); return row; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const row = db.skills.find((item) => item.id === where.id)!; Object.assign(row, data); return row; }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => { db.skills = db.skills.filter((item) => item.id !== where.id); return {}; }),
    },
    knowledgeChunk: { findMany: vi.fn(async () => []) },
  },
}));

import { GET as listSkillsRoute, POST as createSkill } from "@/app/api/ai/skills/route";
import { DELETE as deleteSkill, PUT as updateSkill } from "@/app/api/ai/skills/[id]/route";
import { composeSystemPrompt } from "@/lib/ai/prompt-composer";
import { filterToolsBySkills, selectBusinessRules, topicsToRules, type AiSkill, type BusinessRule } from "@/lib/ai/studio";
import { listBusinessRules, loadSkills, loadStudioContext } from "@/lib/ai/studio-db";

const request = (method: string, body?: unknown) => new Request("http://x", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const tool = (name: string) => ({ definition: { type: "function" as const, function: { name, description: "", parameters: {} } }, run: async () => null });
const TOPICS = [
  { id: "t1", title: "Formas de pagamento", enabled: true, content: "Pix, cartão em até 10x e crediário próprio." },
  { id: "t2", title: "Exame de vista", enabled: false, content: "Exame gratuito na compra dos óculos completos." },
  { id: "t3", title: "Garantia e trocas", enabled: true, content: "Armação: 1 ano.\r\nLentes: 90 dias." },
];

beforeEach(async () => {
  db.rules = [];
  db.skills = [];
  db.legacySkills = [];
  db.workspace = new Map();
  db.topics = TOPICS.map((topic) => ({ ...topic }));
  db.seq = 0;
  // O marcador da migração fica em memória no módulo: reinicia entre os testes.
  vi.resetModules();
});

describe("Regras da empresa: unificação dos Assuntos rápidos", () => {
  it("topicsToRules mantém título, conteúdo e liga/desliga, entra sempre (comportamento antigo) e pula slug já usado", () => {
    const rules = topicsToRules([...TOPICS, { id: "t4", title: "Formas de pagamento", enabled: true, content: "repetido" }, { id: "t5", title: " ", enabled: true, content: "sem título" }], ["garantia-e-trocas"]);
    expect(rules.map((rule) => [rule.slug, rule.active, rule.alwaysInclude])).toEqual([["formas-de-pagamento", true, true], ["exame-de-vista", false, true], ["formas-de-pagamento-2", true, true]]);
    expect(rules[0].content).toBe(TOPICS[0].content);
  });

  it("migra todos os assuntos para AiBusinessRule uma única vez, sem perder conteúdo, e entram no prompt", async () => {
    const studioDb = await import("@/lib/ai/studio-db");
    const rules = await studioDb.listBusinessRules();
    expect(rules).toHaveLength(3);
    for (const topic of TOPICS) {
      const migrated = rules.find((rule) => rule.title === topic.title)!;
      expect(migrated.content).toBe(topic.content.replace(/\r\n/g, "\n"));
      expect(migrated.active).toBe(topic.enabled);
    }
    expect(db.workspace.get("ai-topics-migrated")).toMatchObject({ topics: 3, created: 3 });

    // Regra apagada depois da migração não volta (marcador no banco), mesmo com o módulo recarregado.
    db.rules = db.rules.filter((rule) => rule.title !== "Garantia e trocas");
    vi.resetModules();
    expect(await (await import("@/lib/ai/studio-db")).listBusinessRules()).toHaveLength(2);

    const prompt = composeSystemPrompt({ text: "oi", hasGreetedInSession: true, studio: { rules: selectBusinessRules(db.rules as unknown as BusinessRule[], "oi") } });
    expect(prompt).toContain("Pix, cartão em até 10x e crediário próprio.");
    expect(prompt).not.toContain("Exame gratuito");
  });

  it("não duplica regra que já existia com o mesmo slug", async () => {
    db.rules.push({ id: "r0", title: "Formas de pagamento", slug: "formas-de-pagamento", keywords: [], content: "versão nova da equipe", order: 0, active: true, alwaysInclude: false });
    const rules = await (await import("@/lib/ai/studio-db")).listBusinessRules();
    expect(rules.filter((rule) => rule.slug === "formas-de-pagamento")).toHaveLength(1);
    expect(rules.find((rule) => rule.slug === "formas-de-pagamento")!.content).toBe("versão nova da equipe");
    expect(rules).toHaveLength(3);
  });
});

describe("Skills em Markdown: seed, CRUD e efeito no motor", () => {
  it("seed idempotente: tabela vazia recebe as nativas (aproveitando a configuração anterior) uma vez só", async () => {
    db.legacySkills = [{ key: "crediario_aprovacao", enabled: false, instructions: "Só em horário comercial" }];
    const first = await loadSkills();
    expect(first.map((skill) => skill.slug)).toEqual(["consultoria_pos_campanha", "estoque_cidade", "leitura_receita", "calculo_lentes", "crediario_aprovacao", "pipeline_automatico", "transbordo_humano", "encerramento_autonomo"]);
    const credit = first.find((skill) => skill.slug === "crediario_aprovacao")!;
    expect(credit).toMatchObject({ isActive: false, builtin: true });
    expect(credit.instructionsMd).toContain("Só em horário comercial");
    await loadSkills();
    expect(db.skills).toHaveLength(8);
  });

  it("edita o Markdown, cria skill nova, liga/desliga e exclui só as customizadas", async () => {
    await listSkillsRoute();
    const stock = db.skills.find((skill) => skill.slug === "estoque_cidade")!;

    const edited = await updateSkill(request("PUT", { instructionsMd: "## Protocolo\n1. Pergunte a cidade.\n2. Mostre só 2 opções.", slug: "outro-slug" }), ctx(stock.id));
    expect(edited.status).toBe(200);
    expect(stock).toMatchObject({ slug: "estoque_cidade", instructionsMd: "## Protocolo\n1. Pergunte a cidade.\n2. Mostre só 2 opções." });

    const created = await createSkill(request("POST", { name: "Agendamento de Exame", triggerDescription: "cliente quer marcar exame de vista", instructionsMd: "## Protocolo\n1. Peça o melhor dia." }));
    expect(created.status).toBe(201);
    const { skill } = (await created.json()) as { skill: AiSkill };
    expect(skill).toMatchObject({ slug: "agendamento_de_exame", builtin: false, isActive: true });
    expect((await createSkill(request("POST", { name: "Outra", slug: "estoque_cidade" }))).status).toBe(400);
    expect((await createSkill(request("POST", { name: "Agendamento de Exame" }))).status).toBe(409);

    await updateSkill(request("PUT", { isActive: false }), ctx(skill.id));
    expect(db.skills.find((row) => row.id === skill.id)!.isActive).toBe(false);

    expect((await deleteSkill(request("DELETE"), ctx(stock.id))).status).toBe(400);
    expect((await deleteSkill(request("DELETE"), ctx(skill.id))).status).toBe(200);
    expect(db.skills.some((row) => row.id === skill.id)).toBe(false);
  });

  it("toggle reflete no composeSystemPrompt (Markdown completo + diretriz obrigatória) e nas tools", async () => {
    await loadSkills();
    await createSkill(request("POST", { name: "Agendamento de Exame", triggerDescription: "cliente quer marcar exame de vista", instructionsMd: "## Protocolo\n1. Peça o melhor dia e período.\n2. Confirme a loja." }));
    const stock = db.skills.find((skill) => skill.slug === "estoque_cidade")!;
    await updateSkill(request("PUT", { instructionsMd: "## Protocolo\n1. Pergunte a cidade ANTES de buscar." }), ctx(stock.id));
    const tools = [tool("consultarEstoqueProduto"), tool("buscarDetalhesProdutoWeb"), tool("encerrarAtendimento")];

    const on = await loadStudioContext("quero marcar exame", {});
    const promptOn = composeSystemPrompt({ text: "quero marcar exame", hasGreetedInSession: true, studio: on });
    expect(promptOn).toContain("siga RIGOROSAMENTE as instruções Markdown");
    expect(promptOn).toContain("### Skill: Agendamento de Exame\nQuando acionar: cliente quer marcar exame de vista\n## Protocolo\n1. Peça o melhor dia e período.\n2. Confirme a loja.");
    expect(promptOn).toContain("1. Pergunte a cidade ANTES de buscar.");
    expect(filterToolsBySkills(tools, on.skills)).toHaveLength(3);

    await updateSkill(request("PUT", { isActive: false }), ctx(stock.id));
    const custom = db.skills.find((skill) => skill.slug === "agendamento_de_exame")!;
    await updateSkill(request("PUT", { isActive: false }), ctx(custom.id));
    const off = await loadStudioContext("quero marcar exame", {});
    const promptOff = composeSystemPrompt({ text: "quero marcar exame", hasGreetedInSession: true, studio: off });
    expect(promptOff).not.toContain("Agendamento de Exame");
    expect(promptOff).not.toContain("Pergunte a cidade ANTES de buscar");
    expect(promptOff).toContain("Consulta de estoque DESLIGADA");
    expect(filterToolsBySkills(tools, off.skills).map((item) => item.definition.function.name)).toEqual(["encerrarAtendimento"]);
  });

  it("banco fora: motor segue com as skills nativas ligadas", async () => {
    const { prisma } = await import("@/lib/prisma");
    const studioDb = await import("@/lib/ai/studio-db");
    vi.mocked(prisma.aiSkill.findMany).mockRejectedValueOnce(new Error("db down"));
    const skills = await studioDb.loadSkills();
    expect(skills).toHaveLength(8);
    expect(skills.every((skill) => skill.builtin && skill.isActive)).toBe(true);
    expect(await listBusinessRules()).toBeDefined();
  });
});
