import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStageConfigs } from "@/lib/pipeline-stages";
import { applySalesEvent, detectSalesEvents, isSalesQueue, moveCardManually, parseBrl, type PipelineCard, type SalesEvent } from "@/lib/sales-pipeline";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  contacts: new Map<string, Record<string, unknown>>(),
  sales: [] as { sourceKey: string; dia: Date; total: number; resumo: string }[],
}));
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn(async () => undefined) }));
vi.mock("@/lib/prisma", () => {
  const client = {
    crmWorkspaceData: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.store.has(where.key) ? { key: where.key, value: db.store.get(where.key) } : null)),
      upsert: vi.fn(async ({ where, update }: { where: { key: string }; update: { value: unknown } }) => {
        db.store.set(where.key, update.value);
        return {};
      }),
    },
    contact: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.contacts.get(where.id) ?? null),
      findMany: vi.fn(async ({ where }: { where: { phone: { in: string[] } } }) => [...db.contacts.values()].filter((item) => where.phone.in.includes(item.phone as string))),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray | { strings?: string[] }, ...values: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join("?") : "";
      if (!sql.includes("VmsetSale")) return [{ locked: 1 }];
      const keys = values[0] as string[];
      const rows = db.sales.filter((sale) => keys.includes(sale.sourceKey)).sort((a, b) => b.dia.getTime() - a.dia.getTime());
      if (sql.includes("orderDate\" >=")) return [{ total: rows.filter((row) => row.dia.toISOString().slice(0, 10) >= (values[1] as string)).reduce((sum, row) => sum + row.total, 0) }];
      return rows.slice(0, 1).map((row) => ({ dia: row.dia, total: row.total, resumo: row.resumo }));
    }),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(client)),
  };
  return { prisma: client };
});

const configs = resolveStageConfigs({});
const NOW = new Date("2026-11-16T15:00:00Z");
let seq = 0;
const id = () => `id-${++seq}`;
const contact = { id: "c1", name: "Vivi Souza", phone: "5511999990000", email: null };

function apply(cards: PipelineCard[], event: SalesEvent, type: "novo" | "recorrente" = "novo") {
  return applySalesEvent(cards, { contact, conversationId: "conv1", event, recurrence: { type, lastPurchase: type === "recorrente" ? "10/03/2026 — Ray-Ban RB3025 — R$ 890,00" : null }, configs, now: NOW, id });
}

describe("detecção de eventos comerciais", () => {
  it("'Oi' e dúvida geral não geram oportunidade", () => {
    expect(detectSalesEvents({ pendingText: "Oi" })).toEqual([]);
    expect(detectSalesEvents({ pendingText: "Bom dia, qual o horário de vocês?" })).toEqual([]);
    expect(detectSalesEvents({ pendingText: "Onde fica a loja do centro?", locationStore: "Centro" })).toEqual([]);
  });

  it("receita, modelo com preço, orçamento de lentes e loja para comprar viram eventos", () => {
    expect(detectSalesEvents({ pendingText: "", prescriptions: ["Receita — OD -1,25"] })).toEqual([{ type: "receita_enviada", summary: "Receita — OD -1,25" }]);
    expect(detectSalesEvents({ pendingText: "tem o RB3025?", product: { name: "Ray-Ban Aviator RB3025", price: 890 } })[0]).toEqual({ type: "interesse_produto", product: "Ray-Ban Aviator RB3025", value: 890 });
    expect(detectSalesEvents({ pendingText: "Quero um orçamento de lentes multifocais" })[0].type).toBe("orcamento_lentes");
    expect(detectSalesEvents({ pendingText: "qual a loja mais perto pra eu comprar?", anchoredProduct: "Ray-Ban RB3025", locationStore: "Shopping Norte" })).toEqual([{ type: "visita_loja", store: "Shopping Norte", product: "Ray-Ban RB3025" }]);
    expect(detectSalesEvents({ pendingText: "pode reservar pra mim?" })[0].type).toBe("visita_loja");
  });

  it("preço e fila comercial", () => {
    expect(parseBrl("R$ 1.290,00")).toBe(1290);
    expect(parseBrl("sob consulta")).toBeNull();
    expect(isSalesQueue("Vendas")).toBe(true);
    expect(isSalesQueue("Comercial")).toBe(true);
    expect(isSalesQueue("Financeiro")).toBe(false);
  });
});

describe("motor de etapas", () => {
  beforeEach(() => {
    seq = 0;
  });

  it("cliente novo envia receita → Novo Cliente em Orçamento (Em atendimento), com receita anexada", () => {
    const result = apply([], { type: "receita_enviada", summary: "Receita — OD -1,25" });
    expect(result.created).toBe(true);
    expect(result.card).toMatchObject({ coluna: "em-atendimento", customerType: "novo", tag: "Novo Cliente", receitaAnexada: true, conversationId: "conv1", sourceTrigger: "receita_enviada", autoMoveEnabled: true });
    expect(result.card?.observacoes?.[0].texto).toContain("Oportunidade criada automaticamente em 'Em atendimento'");
  });

  it("cliente do ERP pergunta do Ray-Ban e pede a loja → Recorrente, com valor, em Visita/Reserva (Fechamento)", () => {
    const first = apply([], { type: "interesse_produto", product: "Ray-Ban Aviator RB3025", value: 890 }, "recorrente");
    expect(first.card).toMatchObject({ coluna: "novo-lead", customerType: "recorrente", valor: "R$ 890,00", estimatedValue: 890 });
    const second = apply(first.cards, { type: "visita_loja", store: "Shopping Norte", product: "Ray-Ban Aviator RB3025" }, "recorrente");
    expect(second.cards).toHaveLength(1);
    expect(second.moved).toBe(true);
    expect(second.card).toMatchObject({ coluna: "fechamento", lojaInteresse: "Shopping Norte", valor: "R$ 890,00", customerType: "recorrente" });
    expect(second.card?.observacoes?.[0].texto).toBe("🤖 Movido automaticamente para 'Fechamento' — Cliente pediu a loja para comprar/reservar (Shopping Norte)");
    expect(second.card?.aiSummary).toContain("Última compra: 10/03/2026");
  });

  it("card movido à mão para frente não volta com evento de etapa anterior", () => {
    const created = apply([], { type: "interesse_produto", product: "Oakley Holbrook", value: 700 });
    const manual = moveCardManually(created.cards, { cardId: created.card!.id, column: "fechamento", author: "Leandro", configs, now: NOW, id });
    expect(manual.card?.observacoes?.[0]).toMatchObject({ autor: "Leandro", texto: "Movido para 'Fechamento' pelo vendedor no atendimento" });
    const later = apply(manual.cards, { type: "receita_enviada", summary: "Receita" });
    expect(later.moved).toBe(false);
    expect(later.card).toMatchObject({ coluna: "fechamento", receitaAnexada: true });
    expect(later.cards).toHaveLength(1);
  });

  it("automação pausada no card não move, mas atualiza o resumo", () => {
    const created = apply([], { type: "interesse_produto", product: "Oakley Holbrook", value: 700 });
    const paused = created.cards.map((card) => ({ ...card, autoMoveEnabled: false }));
    const later = apply(paused, { type: "visita_loja", store: "Centro" });
    expect(later.card).toMatchObject({ coluna: "novo-lead", lojaInteresse: "Centro" });
  });

  it("venda faturada fecha em Ganho com o valor real; venda sem oportunidade aberta não cria card", () => {
    const created = apply([], { type: "orcamento_lentes" });
    const won = apply(created.cards, { type: "venda_faturada", value: 1450.5 });
    expect(won.card).toMatchObject({ coluna: "ganho", valor: "R$ 1.450,50", valorFaturado: 1450.5, progresso: 100 });
    expect(apply([], { type: "venda_faturada", value: 100 }).card).toBeNull();
    // Depois de ganho, novo interesse abre outra oportunidade.
    const again = apply(won.cards, { type: "interesse_produto", product: "Prada PR 17WS", value: 1200 });
    expect(again.created).toBe(true);
    expect(again.cards).toHaveLength(2);
  });
});

describe("gravação no pipeline (banco)", () => {
  beforeEach(() => {
    db.store.clear();
    db.contacts.clear();
    db.sales.length = 0;
    db.contacts.set("novo", { id: "novo", name: "Ana Lima", phone: "5511911112222", email: null, birthDate: null, sourceKey: "chat:5511911112222", cpf: null, purchases: 0, lastPurchaseDate: null });
    db.contacts.set("erp", { id: "erp", name: "Carlos Dias", phone: "5511933334444", email: null, birthDate: null, sourceKey: "chat:5511933334444", cpf: "123.456.789-01", purchases: 0, lastPurchaseDate: null });
    db.sales.push({ sourceKey: "cpf:12345678901", dia: new Date("2026-03-10T00:00:00Z"), total: 890, resumo: "RAY-BAN RB3025" });
  });

  it("classifica pelo ERP (CPF) e grava uma oportunidade só por contato", async () => {
    const { classifyCustomerRecurrence, recordSalesEvents } = await import("@/lib/sales-pipeline-db");
    expect(await classifyCustomerRecurrence("novo")).toEqual({ type: "novo", lastPurchase: null });
    const recurrent = await classifyCustomerRecurrence("erp");
    expect(recurrent.type).toBe("recorrente");
    expect(recurrent.lastPurchase).toContain("10/03/2026");

    await recordSalesEvents({ contactId: "erp", conversationId: "conv-erp", events: [{ type: "interesse_produto", product: "Ray-Ban RB3025", value: 890 }] });
    await recordSalesEvents({ contactId: "erp", conversationId: "conv-erp", events: [{ type: "visita_loja", store: "Centro" }] });
    const cards = db.store.get("pipeline") as PipelineCard[];
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ contactId: "erp", customerType: "recorrente", coluna: "fechamento", lojaInteresse: "Centro" });
  });

  it("nenhum evento ('Oi') não grava nada; automação desligada nas configurações também não", async () => {
    const { recordSalesEvents } = await import("@/lib/sales-pipeline-db");
    await recordSalesEvents({ contactId: "novo", events: detectSalesEvents({ pendingText: "Oi" }) });
    expect(db.store.has("pipeline")).toBe(false);
    db.store.set("settings", { pipelineAutoSyncEnabled: false });
    await recordSalesEvents({ contactId: "novo", events: [{ type: "orcamento_lentes" }] });
    expect(db.store.has("pipeline")).toBe(false);
  });

  it("venda no ERP depois da abertura move para Ganho", async () => {
    const { recordSalesEvents, syncWonOpportunities } = await import("@/lib/sales-pipeline-db");
    await recordSalesEvents({ contactId: "erp", conversationId: "c", events: [{ type: "orcamento_lentes" }] });
    db.sales.push({ sourceKey: "cpf:12345678901", dia: new Date(), total: 1200, resumo: "LENTE" });
    expect(await syncWonOpportunities(Date.now() + 2 * 60 * 60 * 1000)).toBe(1);
    const [card] = db.store.get("pipeline") as PipelineCard[];
    expect(card).toMatchObject({ coluna: "ganho", valorFaturado: 1200 });
  });
});
