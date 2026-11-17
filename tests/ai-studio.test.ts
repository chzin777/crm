import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({ rules: [] as Row[], chunks: [] as { documentId: string; index: number; content: string; embedding: number[]; document: { title: string } }[], embeddings: [] as string[][] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ requireModule: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/ai/openai", () => ({
  aiConfigured: () => true,
  aiJson: vi.fn(),
  AiError: class extends Error {},
  // Vetor de 3 dimensões: [óculos/lente, garantia, indicação] pela presença das palavras.
  embedTexts: vi.fn(async (texts: string[]) => {
    db.embeddings.push(texts);
    return texts.map((text) => [/lente|indice|1\.74/i.test(text) ? 1 : 0, /garantia|defeito/i.test(text) ? 1 : 0, /indica/i.test(text) ? 1 : 0]);
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiBusinessRule: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) => db.rules.find((rule) => (where.id ? rule.id === where.id : rule.slug === where.slug)) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { slug: string; id: { not: string } } }) => db.rules.find((rule) => rule.slug === where.slug && rule.id !== where.id.not) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const rule = { id: `r${db.rules.length + 1}`, ...data }; db.rules.push(rule); return rule; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const rule = db.rules.find((item) => item.id === where.id)!; Object.assign(rule, data); return rule; }),
      findMany: vi.fn(async () => db.rules),
    },
    knowledgeChunk: { findMany: vi.fn(async () => db.chunks) },
  },
}));

import { POST as createRule } from "@/app/api/ai/rules/route";
import { PUT as updateRule } from "@/app/api/ai/rules/[id]/route";
import { composeSystemPrompt, selectPromptModules } from "@/lib/ai/prompt-composer";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { applySkillsToSettings, chunkText, fallbackSkills, filterToolsBySkills, knowledgePromptBlock, normalizeRuleInput, rankChunks, selectBusinessRules, shouldSearchKnowledge, skillEnabled, skillsPromptBlock, slugify, type AiSkill, type BusinessRule, type SkillKey } from "@/lib/ai/studio";
import { searchKnowledge } from "@/lib/ai/studio-db";

const rule = (patch: Partial<BusinessRule>): BusinessRule => ({ id: "x", title: "Regra", slug: "regra", keywords: [], content: "conteúdo", order: 0, active: true, alwaysInclude: false, ...patch });
const tool = (name: string) => ({ definition: { type: "function" as const, function: { name, description: "", parameters: {} } }, run: async () => null });
const json = (body: unknown) => new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  db.rules = [];
  db.chunks = [];
  db.embeddings = [];
});

describe("AiBusinessRule: criação e ativação", () => {
  it("normaliza o cadastro: slug sem acento, palavras-chave únicas em minúsculas e ativa por padrão", () => {
    const data = normalizeRuleInput({ title: "Programa de Indicação", keywords: ["Indicação", "indicação", " bônus "], content: "## Como funciona" });
    expect(data).toMatchObject({ slug: "programa-de-indicacao", keywords: ["indicação", "bônus"], active: true, alwaysInclude: false });
    expect(normalizeRuleInput({ title: "  " })).toEqual({ error: "Informe o título da regra." });
    expect(slugify("Endereços das Lojas!")).toBe("enderecos-das-lojas");
  });

  it("cria pela rota, recusa slug repetido e desativa pelo PUT", async () => {
    const created = await createRule(json({ title: "Endereços das Lojas", keywords: ["endereço", "onde fica"], content: "- Loja Centro: Rua 1" }));
    expect(created.status).toBe(201);
    const { rule: saved } = (await created.json()) as { rule: BusinessRule };
    expect(saved).toMatchObject({ slug: "enderecos-das-lojas", active: true });

    const duplicate = await createRule(json({ title: "Endereços das lojas" }));
    expect(duplicate.status).toBe(409);

    const off = await updateRule(json({ active: false }), { params: Promise.resolve({ id: saved.id }) });
    expect(((await off.json()) as { rule: BusinessRule }).rule.active).toBe(false);
    // Desativada: o conteúdo some do prompt mesmo com o assunto na conversa.
    expect(selectBusinessRules(db.rules as unknown as BusinessRule[], "qual o endereço da loja?")).toHaveLength(0);
  });

  it("injeta só regras ativas cujo assunto aparece na conversa (ou marcadas como sempre incluir)", () => {
    const rules = [
      rule({ id: "1", title: "Programa de Indicação", keywords: ["indicação", "indicar"], content: "Quem indica ganha R$ 50." }),
      rule({ id: "2", title: "Políticas de Garantia", keywords: ["garantia", "defeito"], content: "Garantia de 1 ano." }),
      rule({ id: "3", title: "Informações Gerais", alwaysInclude: true, content: "Somos a Óticas Brasil.", order: -1 }),
      rule({ id: "4", title: "Inativa", keywords: ["indicar"], content: "não usar", active: false }),
    ];
    const picked = selectBusinessRules(rules, "Oi, como funciona pra INDICAR uma amiga?");
    expect(picked.map((item) => item.id)).toEqual(["3", "1"]);
    // A palavra-chave casa como palavra inteira, sem diferenciar acento ou caixa.
    expect(selectBusinessRules(rules, "quero saber da garantia").map((item) => item.id)).toEqual(["3", "2"]);

    const prompt = composeSystemPrompt({ hasGreetedInSession: true, text: "como funciona pra indicar?", studio: { rules } });
    expect(prompt).toContain("REGRAS DA EMPRESA");
    expect(prompt).toContain("Quem indica ganha R$ 50.");
    expect(prompt).toContain("Somos a Óticas Brasil.");
    expect(prompt).not.toContain("Garantia de 1 ano.");
    expect(prompt).not.toContain("não usar");
  });
});

const skillsWith = (off: SkillKey[] = []): AiSkill[] => fallbackSkills().map((skill) => ({ ...skill, isActive: !off.includes(skill.slug as SkillKey) }));

describe("Skills nativas: filtro de tools e fluxos", () => {
  it("sem lista (banco fora) ou sem a linha, a skill nativa fica ligada", () => {
    expect(skillEnabled(undefined, "estoque_cidade")).toBe(true);
    expect(skillEnabled([], "transbordo_humano")).toBe(true);
    expect(skillEnabled(skillsWith(["estoque_cidade"]), "estoque_cidade")).toBe(false);
  });

  it("estoque desligado tira as tools de estoque e ficha; as demais continuam", () => {
    const tools = [tool("consultarEstoqueProduto"), tool("buscarDetalhesProdutoWeb"), tool("enviarLocalizacaoLoja"), tool("encerrarAtendimento")];
    expect(filterToolsBySkills(tools, skillsWith())).toHaveLength(4);
    const names = filterToolsBySkills(tools, skillsWith(["estoque_cidade"])).map((item) => item.definition.function.name);
    expect(names).toEqual(["enviarLocalizacaoLoja", "encerrarAtendimento"]);
    expect(skillsPromptBlock(skillsWith(["estoque_cidade"]))).toContain("Consulta de estoque DESLIGADA");
  });

  it("transbordo desligado zera os gatilhos automáticos, mantendo palavras de pedido de pessoa", () => {
    const settings = applySkillsToSettings(DEFAULT_AI_SETTINGS, skillsWith(["transbordo_humano"]));
    expect(settings).toMatchObject({ handoffOnComplaint: false, handoffOnPurchaseIntent: false, handoffWhenUnsure: false, handoffOnMedia: false });
    expect(settings.handoffKeywords).toEqual(DEFAULT_AI_SETTINGS.handoffKeywords);
    expect(applySkillsToSettings(DEFAULT_AI_SETTINGS, skillsWith())).toBe(DEFAULT_AI_SETTINGS);
  });

  it("crediário e orçamento de lentes desligados tiram os módulos do prompt", () => {
    const off = { skills: skillsWith(["crediario_aprovacao", "calculo_lentes"]) };
    expect(selectPromptModules({ hasGreetedInSession: true, text: "quero a segunda via do boleto do crediário" })).toContain("financeiro-crediario");
    expect(selectPromptModules({ hasGreetedInSession: true, text: "quero a segunda via do boleto do crediário", studio: off })).not.toContain("financeiro-crediario");
    expect(selectPromptModules({ hasGreetedInSession: true, text: "minha receita tem astigmatismo", studio: off })).not.toContain("receituario-lentes");
  });
});

describe("Base de conhecimento (RAG): chunks e recuperação", () => {
  it("divide textos longos em trechos com tamanho limitado", () => {
    const text = Array.from({ length: 30 }, (_, index) => `Parágrafo ${index} sobre lentes de alto índice e tratamentos antirreflexo.`).join("\n\n");
    const chunks = chunkText(text, 300, 60);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((chunk) => chunk.length <= 360)).toBe(true);
    expect(chunkText("   ")).toEqual([]);
  });

  it("busca textual sem embeddings traz o trecho do assunto e ignora o resto", () => {
    const chunks = [
      { documentId: "d1", documentTitle: "Tabela de lentes", index: 0, content: "Lente índice 1.74 é a mais fina, indicada para graus altos." },
      { documentId: "d2", documentTitle: "Garantia", index: 0, content: "Defeito de fabricação tem garantia de 1 ano." },
    ];
    const hits = rankChunks("qual lente mais fina para grau alto?", chunks);
    expect(hits[0]).toMatchObject({ documentId: "d1", vector: null });
    expect(hits.find((hit) => hit.documentId === "d2")).toBeUndefined();
    expect(knowledgePromptBlock(hits)).toContain("BASE DE CONHECIMENTO");
    expect(shouldSearchKnowledge("oi")).toBe(false);
    expect(shouldSearchKnowledge("qual o prazo da garantia?")).toBe(true);
  });

  it("searchKnowledge usa o embedding da pergunta (híbrido) e devolve os top-K dos documentos ativos", async () => {
    db.chunks = [
      { documentId: "d1", index: 0, content: "Lentes índice 1.74 são as mais finas.", embedding: [1, 0, 0], document: { title: "Tabela de lentes" } },
      { documentId: "d2", index: 0, content: "Defeito de fabricação: garantia de 12 meses.", embedding: [0, 1, 0], document: { title: "Garantia" } },
      { documentId: "d3", index: 0, content: "Quem indica ganha bônus.", embedding: [0, 0, 1], document: { title: "Indicação" } },
    ];
    const hits = await searchKnowledge("meu óculos veio com defeito, tem garantia?", { topK: 2 });
    expect(db.embeddings).toEqual([["meu óculos veio com defeito, tem garantia?"]]);
    expect(hits[0]).toMatchObject({ documentId: "d2", vector: 1 });
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(hits.map((hit) => hit.documentId)).not.toContain("d3");

    const prompt = composeSystemPrompt({ hasGreetedInSession: true, text: "tem garantia?", studio: { knowledge: hits } });
    expect(prompt).toContain("garantia de 12 meses");
  });
});
