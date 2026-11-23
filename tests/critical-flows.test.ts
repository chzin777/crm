import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isAutoReplyText, looksLikeGreeting } from "@/lib/chat/auto-reply";
import { classifyNoise } from "@/lib/chat/noise";
import { planInactivity } from "@/lib/chat/inactivity";
import { planQueuePositions, type QueueRow } from "@/lib/chat/queue-rules";
import { detectOptOutCommand, optOutKeys, withoutOptedOut } from "@/lib/marketing-opt-out";
import { dedupeRecipients } from "@/lib/campaign-audience";
import { sortCampaignRows, type SortableCampaignRow } from "@/lib/campaign-sort";
import { distinctModels, type ShowcaseModel } from "@/lib/ai/stock-showcase";

// ---- Triagem pós-campanha: respostas automáticas e ruído não viram atendimento nem resposta da campanha ----
const campaigns = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { crmWorkspaceData: { findUnique: async () => ({ value: campaigns.value }) } } }));
const { campaignAiReplyEnabled } = await import("@/lib/chat/campaign-origin");

describe("triagem pós-campanha", () => {
  it("reconhece auto-resposta do WhatsApp Business (não conta como resposta da campanha)", () => {
    expect(isAutoReplyText("Olá! Obrigado por entrar em contato. No momento não podemos responder, retornaremos em breve.")).toBe(true);
    expect(isAutoReplyText("Quero saber o preço do óculos da promoção")).toBe(false);
  });

  it("saudação solta não indica interesse; ruído (figurinha, risada, pontuação) é absorvido", () => {
    expect(looksLikeGreeting("Bom dia, como podemos ajudar?")).toBe(true);
    expect(classifyNoise({ type: "sticker", text: "", hasMedia: true })).toBe("sticker");
    expect(classifyNoise({ type: "text", text: "kkkkkk", hasMedia: false })).toBe("risada");
    expect(classifyNoise({ type: "text", text: "??", hasMedia: false })).toBe("pontuacao");
    expect(classifyNoise({ type: "text", text: "Tem a armação Ray-Ban?", hasMedia: false })).toBeNull();
  });

  it("respeita a flag de IA por campanha (aiAutoReplyEnabled)", async () => {
    campaigns.value = [{ id: "c-ia", aiAutoReplyEnabled: true }, { id: "c-fila", aiAutoReplyEnabled: false }, { id: "c-antiga" }];
    expect(await campaignAiReplyEnabled("c-ia")).toBe(true);
    expect(await campaignAiReplyEnabled("c-fila")).toBe(false);
    expect(await campaignAiReplyEnabled("c-antiga")).toBe(true); // campanha antiga, sem o campo: IA como antes
    expect(await campaignAiReplyEnabled(null)).toBe(true);
    expect(await campaignAiReplyEnabled("excluida")).toBe(true);
  });
});

// ---- Fila e inatividade ----
const minutes = (value: number) => value * 60 * 1000;
const at = (minute: number) => new Date(Date.UTC(2026, 10, 23, 12, minute));

describe("fila e inatividade", () => {
  it("aviso de 3 minutos só quando a última mensagem é do operador/IA", () => {
    const base = { warnedAt: null, now: at(30), askMs: minutes(3), closeMs: minutes(3) };
    expect(planInactivity({ ...base, lastAuthor: "agent", lastAt: at(20) })).toBe("warn");
    expect(planInactivity({ ...base, lastAuthor: "bot", lastAt: at(20) })).toBe("warn");
    expect(planInactivity({ ...base, lastAuthor: "agent", lastAt: at(29) })).toBe("none");
  });

  it("última mensagem do cliente: ticket continua aberto, sem aviso nem encerramento", () => {
    expect(planInactivity({ lastAuthor: "customer", lastAt: at(0), warnedAt: null, now: at(59), askMs: minutes(3), closeMs: minutes(3) })).toBe("none");
    expect(planInactivity({ lastAuthor: "customer", lastAt: at(25), warnedAt: at(22), now: at(59), askMs: minutes(3), closeMs: minutes(3) })).toBe("reset");
  });

  it("posição na fila é só interna (planejamento não gera texto para o cliente)", () => {
    const row = (id: string, minute: number): QueueRow => ({ id, status: "waiting", queueId: "q1", queueName: "Vendas", assigneeId: null, closedAt: null, waitingSince: at(minute), lastInboundAt: at(minute), menuState: null });
    const updates = planQueuePositions([row("b", 5), row("a", 1)], { now: at(10) });
    expect(updates.map((update) => [update.id, update.position])).toEqual([["a", 1], ["b", 2]]);
    for (const update of updates) expect(Object.keys(update).sort()).toEqual(["id", "position", "positionSince"]);
  });

  it("nenhum código envia mensagem automática de posição na fila ao cliente", () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
    const offenders = [...files(join(process.cwd(), "lib")), ...files(join(process.cwd(), "app", "api"))].filter((file) => {
      const source = readFileSync(file, "utf8");
      return /send(Automatic|Text)[^;]*(sua posi[cç][aã]o|posi[cç][aã]o na fila|voc[eê] [eé] o \d)/i.test(source);
    });
    expect(offenders).toEqual([]);
  });
});

// ---- Campanhas e higiene de base ----
const campaignRow = (nome: string, status: string, updatedAt: number, startedAt?: string): SortableCampaignRow & { id: string } => ({
  id: nome, nome, status, updatedAt, mensagem: "", publico: "", total: 0, stats: { sent: 0, replied: 0 }, job: startedAt ? { startedAt } : null,
});

describe("campanhas e higiene de base", () => {
  it("'Enviando' no topo (mais recente primeiro) e o resto em ordem decrescente de atualização", () => {
    const rows = [
      campaignRow("antiga", "Enviada", 100),
      campaignRow("envio-1", "Enviando", 50, "2026-11-23T10:00:00Z"),
      campaignRow("nova", "Rascunho", 300),
      campaignRow("envio-2", "Enviando", 10, "2026-11-23T11:00:00Z"),
    ];
    expect(sortCampaignRows(rows, "atualizacao", "desc").map((row) => row.nome)).toEqual(["envio-2", "envio-1", "nova", "antiga"]);
    expect(sortCampaignRows(rows, "atualizacao", "asc").map((row) => row.nome)).toEqual(["envio-2", "envio-1", "antiga", "nova"]);
  });

  it("descadastrados (optedOut) saem do disparo por id ou por qualquer variação do telefone", () => {
    const keys = optOutKeys([{ id: "c1", phone: "5511987654321" }]);
    const recipients = [
      { id: "c1", telefone: "" },
      { id: "outro-cadastro", telefone: "(11) 98765-4321" },
      { id: "sem-9", telefone: "551187654321" },
      { id: "c2", telefone: "11912345678" },
    ];
    expect(withoutOptedOut(recipients, keys).map((recipient) => recipient.id)).toEqual(["c2"]);
    expect(detectOptOutCommand("SAIR")).toBe("opt_out");
    expect(detectOptOutCommand("Parar promoções")).toBe("opt_out");
    expect(detectOptOutCommand("quero cancelar o pedido")).toBeNull();
  });

  it("produtos do VMSet: mesmo modelo (referência ou código repetido) aparece uma vez na vitrine", () => {
    const model = (nomeComercial: string, referencia: string | null, codigos: string[]): ShowcaseModel => ({ nomeComercial, referencia, categoriaModelo: null, precoVenda: "R$ 500,00", totalDisponivelRede: 3, codigos });
    const result = distinctModels([
      model("Ray-Ban Justin", "RB4165", ["101"]),
      model("Ray-Ban Justin Preto", "rb4165", ["102"]),
      model("Ray-Ban Clubmaster", "RB3016", ["101"]),
      model("Oakley Holbrook", "OO9102", ["300"]),
    ]);
    expect(result.map((item) => item.nomeComercial)).toEqual(["Ray-Ban Justin", "Oakley Holbrook"]);
  });

  it("deduplica destinatários repetidos (mesmo contato ou mesmo telefone)", () => {
    const { unique, removed } = dedupeRecipients([
      { id: "a", telefone: "11987654321" },
      { id: "a", telefone: "11987654321" },
      { id: "b", telefone: "5511987654321" },
      { id: "c", telefone: "11911112222" },
    ]);
    expect(unique.map((recipient) => recipient.id)).toEqual(["a", "c"]);
    expect(removed).toBe(2);
  });
});
