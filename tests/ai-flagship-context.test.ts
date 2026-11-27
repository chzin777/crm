import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  settings: { model: "gpt-5.4-mini", priceInputPerMillionUsd: 0.25, priceOutputPerMillionUsd: 2, temperature: 0.2 } as Record<string, unknown>,
  messages: [] as Record<string, unknown>[],
  findArgs: [] as unknown[],
  modules: [] as Record<string, unknown>[],
  revisions: [] as Record<string, unknown>[],
  workspace: new Map<string, unknown>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/store", async () => {
  const { sanitizeAiSettings } = await import("@/lib/ai/settings");
  return { readAiSettings: vi.fn(async () => sanitizeAiSettings(db.settings)), recordAiUsage: vi.fn(async () => undefined) };
});
vi.mock("@/lib/ai/studio-db", () => ({ listBusinessRules: vi.fn(async () => []), listSkills: vi.fn(async () => []) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatMessage: { findMany: vi.fn(async (args: unknown) => { db.findArgs.push(args); return db.messages; }) },
    crmWorkspaceData: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.workspace.has(where.key) ? { key: where.key } : null)),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => { db.workspace.set(where.key, create.value); return {}; }),
    },
    aiPromptModule: {
      count: vi.fn(async () => db.modules.length),
      findMany: vi.fn(async () => db.modules),
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => db.modules.find((row) => row.slug === where.slug) ?? null),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        let count = 0;
        for (const row of data) if (!db.modules.some((item) => item.slug === row.slug)) { db.modules.push({ id: `m${db.modules.length + 1}`, ...row }); count += 1; }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.modules.find((row) => row.id === where.id)!, data)),
    },
    aiPromptModuleRevision: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.revisions.push(data); return data; }) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}));

import { aiJson, reasoningEffortFor } from "@/lib/ai/openai";
import { FLAGSHIP_MODEL, flagshipModel, sanitizeAiSettings, DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";
import { previousSessionText, AI_CONTEXT_MESSAGES } from "@/lib/ai/assist";
import { detectStaffRequest } from "@/lib/ai/staff-request";
import { consultarLojas } from "@/lib/ai/business-guard";
import type { StoreInfo } from "@/lib/ai/stock";
import { SEED_MODULES } from "./helpers/prompt-seed";

type Sent = { model: string; messages: { role: string; content: unknown }[]; reasoning_effort?: string; temperature?: number; max_completion_tokens: number };
const sent: Sent[] = [];
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  sent.length = 0;
  db.settings = { model: "gpt-5.4-mini", priceInputPerMillionUsd: 0.25, priceOutputPerMillionUsd: 2, temperature: 0.2 };
  db.messages = [];
  db.findArgs = [];
  db.modules = [];
  db.revisions = [];
  db.workspace = new Map();
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("modelo principal (flagship) no atendimento", () => {
  it("padrão é o gpt-5.4 e mini/nano/haiku salvos no banco viram o principal, com o preço dele", () => {
    expect(DEFAULT_AI_SETTINGS.model).toBe("gpt-5.4");
    expect(FLAGSHIP_MODEL).toBe("gpt-5.4");
    for (const small of ["gpt-5.4-mini", "gpt-5-nano", "gpt-4o-mini", "claude-haiku-4-5", "GPT-5.4-MINI"]) expect(flagshipModel(small)).toBe("gpt-5.4");
    expect(flagshipModel("gpt-5")).toBe("gpt-5");
    const saved = sanitizeAiSettings({ model: "gpt-5.4-mini", priceInputPerMillionUsd: 0.25, priceOutputPerMillionUsd: 2 });
    expect(saved).toMatchObject({ model: "gpt-5.4", priceInputPerMillionUsd: 2.5, priceOutputPerMillionUsd: 15 });
    // Modelo grande escolhido na tela continua, com o preço que a equipe digitou.
    expect(sanitizeAiSettings({ model: "gpt-5", priceInputPerMillionUsd: 1.25, priceOutputPerMillionUsd: 10 })).toMatchObject({ model: "gpt-5", priceInputPerMillionUsd: 1.25 });
  });

  it("payload: modelo principal (mesmo com OPENAI_MODEL=gpt-5.4-mini), raciocínio low, histórico com horários e foto intacta", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Sent);
      return reply(200, { choices: [{ message: { content: "{\"reply\":\"Achei sim!\"}" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    }));
    const image = { type: "image_url" as const, image_url: { url: "data:image/jpeg;base64,AAAA", detail: "high" as const } };
    const context = "Conversa (mais antigas primeiro):\n[ontem às 21:08] Cliente: Tem a Armani AR7212?\n[hoje às 07:57] Cliente: Achou ?";
    const result = await aiJson<{ reply: string }>([{ role: "system", content: "sistema" }, { role: "user", content: [{ type: "text", text: context }, image] }], { feature: "atendimento", maxTokens: 800 });
    expect(result.reply).toBe("Achei sim!");
    expect(sent).toHaveLength(1);
    expect(sent[0].model).toBe("gpt-5.4");
    expect(sent[0].reasoning_effort).toBe("low");
    expect(sent[0].temperature).toBeUndefined();
    expect(sent[0].max_completion_tokens).toBe(2800);
    const user = sent[0].messages[1].content as { type: string; text?: string }[];
    expect(user[0].text).toContain("[ontem às 21:08] Cliente: Tem a Armani AR7212?");
    expect(user[1]).toEqual(image);
  });

  it("com ferramentas (atendimento): gpt-5.4 vai com reasoning_effort none e a temperatura salva (o chat/completions recusa tools com raciocínio)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Sent);
      return reply(200, { choices: [{ message: { content: "{\"reply\":\"Oi!\"}" } }] });
    }));
    const tool = { definition: { type: "function" as const, function: { name: "consultar_lojas", description: "", parameters: {} } }, run: async () => null };
    await aiJson([{ role: "user", content: "Achou ?" }], { feature: "atendimento", tools: [tool], maxTokens: 900 });
    expect(sent[0]).toMatchObject({ model: "gpt-5.4", reasoning_effort: "none", temperature: 0.2, max_completion_tokens: 900 });
    expect(reasoningEffortFor("gpt-5.4", true)).toBe("none");
  });

  it("chamada de visão (foto do cliente) também vai no principal, mesmo pedindo um modelo pequeno", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Sent);
      return reply(200, { choices: [{ message: { content: "{\"marca\":\"Armani\"}" } }] });
    }));
    await aiJson([{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,BBBB" } }] }], { feature: "visao", model: "gpt-5.4-mini", maxTokens: 4096 });
    expect(sent[0].model).toBe("gpt-5.4");
  });

  it("modelo que recusa reasoning_effort: repete sem ele (e com a temperatura salva)", async () => {
    db.settings = { model: "gpt-5.1-preview-x", temperature: 0.2 };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Sent;
      sent.push(body);
      if (body.reasoning_effort) return reply(400, { error: { param: "reasoning_effort", message: "unsupported" } });
      return reply(200, { choices: [{ message: { content: "{\"ok\":true}" } }] });
    }));
    await aiJson([{ role: "user", content: "oi" }], { feature: "atendimento" });
    expect(sent).toHaveLength(2);
    expect(sent[1].reasoning_effort).toBeUndefined();
    expect(sent[1].temperature).toBe(0.2);
    expect(reasoningEffortFor("gpt-4o")).toBeNull();
    expect(reasoningEffortFor("gpt-5.4")).toBe("low");
  });
});

describe("contexto: atendimento anterior e retomadas", () => {
  it("sessão curta ganha o fim do atendimento anterior do mesmo cliente (até completar 30), sem notas internas", async () => {
    const now = new Date("2026-11-27T10:57:00Z");
    db.messages = [
      { author: "bot", authorName: "Assistente IA", text: "Vou procurar a Armani pra você!", internal: false, attachment: null, createdAt: new Date("2026-11-27T00:09:00Z") },
      { author: "customer", authorName: null, text: "Tem a armação Armani AR7212?", internal: false, attachment: null, createdAt: new Date("2026-11-27T00:08:00Z") },
    ];
    const text = await previousSessionText("c1", new Date("2026-11-27T10:56:00Z"), 2, now);
    const args = db.findArgs[0] as { where: { conversation: { contactId: string }; internal: boolean; createdAt: { lt: Date } }; take: number; orderBy: { createdAt: string } };
    expect(args.where.conversation.contactId).toBe("c1");
    expect(args.where.internal).toBe(false);
    expect(args.take).toBe(AI_CONTEXT_MESSAGES - 2);
    expect(args.orderBy.createdAt).toBe("desc");
    expect(text).toBe("[ontem às 21:08] Cliente: Tem a armação Armani AR7212?\n[ontem às 21:09] Robô: Vou procurar a Armani pra você!");
    // Sessão atual já com 30 mensagens: nada a completar.
    expect(await previousSessionText("c1", now, AI_CONTEXT_MESSAGES, now)).toBe("");
  });

  it("\"Achou ?\", \"Tem?\" e \"Conseguiu?\" nunca viram pedido para falar com uma pessoa", () => {
    const staff = [{ id: "u1", name: "Leandro Silva", queueId: null, queueName: null }];
    for (const text of ["Achou ?", "achou", "Tem?", "Conseguiu?", "E aí, achou?"]) expect(detectStaffRequest(text, staff, "Maria")).toBeNull();
    expect(detectStaffRequest("Preciso falar com o Leandro", staff, "Maria")?.staff?.id).toBe("u1");
  });
});

describe("cidade sem loja: base para as cidades mais próximas", () => {
  it("consultar_lojas devolve cidade, UF e coordenadas de cada cidade com loja", () => {
    const goiania: StoreInfo = { name: "LJ 10 MARISTA", address: "AV T-10", addressNumber: "1", neighborhood: "SETOR MARISTA", city: "Goiânia", state: "GO", lat: -16.7, lng: -49.26 };
    const goiania2: StoreInfo = { name: "LJ 11 BUENO", address: "AV T-4", addressNumber: "2", neighborhood: "SETOR BUENO", city: "Goiânia", state: "GO", lat: -16.71, lng: -49.27 };
    const araguaina: StoreInfo = { name: "LJ 66 CENTRO", address: "AV CONEGO", addressNumber: "3", neighborhood: "CENTRO", city: "Araguaína", state: "TO", lat: -7.19, lng: -48.2 };
    const result = consultarLojas(new Map([["10", goiania], ["11", goiania2], ["66", araguaina]]), { cidade: "Iporá" });
    expect(result.encontrada).toBe(false);
    if (result.encontrada) return;
    expect(result.cidades_com_loja_detalhe).toEqual([
      { cidade: "Goiânia", uf: "GO", lat: -16.705, lng: -49.265 },
      { cidade: "Araguaína", uf: "TO", lat: -7.19, lng: -48.2 },
    ]);
  });
});

describe("prompt: conversa humana e atualização única dos módulos", () => {
  it("módulo Conversa Humana sempre no prompt: sem URA, retomadas, 1 a 3 cidades mais próximas, foto e tom", () => {
    const module = SEED_MODULES.find((item) => item.slug === "conversa-humana")!;
    expect(module).toMatchObject({ alwaysInclude: true, isActive: true });
    for (const piece of ["Nunca trave a conversa exigindo a cidade", "\"Achou?\"", "nunca como condição para responder", "1 a 3 cidades com loja realmente mais próximas", "cidades_com_loja_detalhe", "nada de resposta de manual técnico", "Mensagens curtas, naturais"]) expect(module.contentMarkdown).toContain(piece);
    const rules = SEED_MODULES.find((item) => item.slug === "regras-criticas")!;
    expect(rules.contentMarkdown).not.toContain("Ainda não possuímos unidade em");
  });

  it("base já semeada: entra o módulo novo e a frase pronta da regra editada sai (com versão anterior guardada), uma vez só", async () => {
    const { applyPromptUpgrades, NATURAL_NO_STORE } = await vi.importActual<typeof import("@/lib/ai/prompt-modules-db")>("@/lib/ai/prompt-modules-db");
    const edited = "3. CIDADE SEM UNIDADE\nSe consultar_lojas retornar encontrada=false, diga: “Ainda não possuímos unidade em [cidade solicitada].” Se oferecer uma unidade de outra cidade, informe claramente em qual cidade ela fica.";
    db.modules = [{ id: "r1", slug: "regras-criticas", title: "Regras críticas", contentMarkdown: edited }];
    await applyPromptUpgrades();
    expect(db.modules.find((row) => row.slug === "conversa-humana")).toMatchObject({ isActive: true, alwaysInclude: true });
    const rules = db.modules.find((row) => row.slug === "regras-criticas")!;
    expect(rules.contentMarkdown).toBe(`3. CIDADE SEM UNIDADE\nSe consultar_lojas retornar encontrada=false, ${NATURAL_NO_STORE} Se oferecer uma unidade de outra cidade, informe claramente em qual cidade ela fica.`);
    expect(db.revisions).toEqual([{ moduleId: "r1", title: "Regras críticas", contentMarkdown: edited, userId: null }]);
    // A equipe apagou o módulo novo depois: não volta.
    db.modules = db.modules.filter((row) => row.slug !== "conversa-humana");
    await applyPromptUpgrades();
    expect(db.modules.some((row) => row.slug === "conversa-humana")).toBe(false);
    expect(db.revisions).toHaveLength(1);
  });
});
