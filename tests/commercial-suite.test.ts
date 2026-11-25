import { describe, expect, it } from "vitest";
import {
  contactLensDurationDays,
  contactLensModality,
  contactLensProductName,
  contactLensReminderDue,
  isContactLensItem,
  isRxLensItem,
  planContactLensReminder,
  reminderTemplateParams,
  rxReviewDue,
} from "@/lib/commercial/recurrence";
import {
  attributeSalesToConversations,
  budgetRecoveryMessage,
  buildHandoffBrief,
  classifyObjection,
  cpfKey,
  detectInterests,
  formatHandoffBrief,
  isoWeek,
  parseHandoffBrief,
  phoneMatchKey,
  prescriptionLine,
  rankObjections,
  shouldRecoverBudget,
  summarizeConversion,
} from "@/lib/commercial/insights";
import { sanitizeCommercialSettings } from "@/lib/commercial/settings";
import { prescriptionFromExtraction } from "@/lib/prescriptions";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("recorrência óptica", () => {
  it("revisão de grau vence aos 335 dias, com tolerância de 7 dias e só uma vez por janela", () => {
    const sale = day("2025-12-24");
    expect(rxReviewDue(sale, day("2026-11-23"))).toBe(false); // 334 dias
    expect(rxReviewDue(sale, day("2026-11-24"))).toBe(true); // 335 dias
    expect(rxReviewDue(sale, day("2026-12-01"))).toBe(true); // 342 dias
    expect(rxReviewDue(sale, day("2026-12-02"))).toBe(false);
  });

  it("separa lentes de grau, lentes de contato e outros itens do VMSet", () => {
    expect(isRxLensItem({ category: "LENTES", description: "LENTE VARILUX 1.67" })).toBe(true);
    expect(isRxLensItem({ category: "ARMACAO", description: "RAY-BAN RB5154" })).toBe(false);
    expect(isContactLensItem({ category: "LENTES DE CONTATO", description: "LENTE DE CONTATO ACUVUE 2 -6.00" })).toBe(true);
    expect(isRxLensItem({ category: "LENTES", description: "LENTE DE CONTATO BIOFINITY" })).toBe(false);
  });

  it("identifica a modalidade pela descrição", () => {
    expect(contactLensModality("LENTE DE CONTATO ACUVUE MOIST 1 DAY -7.50")).toBe("diaria");
    expect(contactLensModality("LENTE DE CONTATO ACUVUE 2 -6.00")).toBe("quinzenal");
    expect(contactLensModality("LENTE DE CONTATO ACUVUE OASYS -1.50")).toBe("quinzenal");
    expect(contactLensModality("LENTE DE CONTATO BIOFINITY COOPER VISION -3.50")).toBe("mensal");
    expect(contactLensModality("LENTE DE CONTATO NATURAL VISION BEAUTY DIAMANTE")).toBe("anual");
  });

  it("calcula duração pelos dois olhos e o lembrete 5 dias antes do término", () => {
    // 2 caixas mensais de 6 lentes: 12 lentes × 30 dias ÷ 2 olhos = 180 dias.
    expect(contactLensDurationDays([{ description: "LENTE DE CONTATO BIOFINITY -3.50", quantity: 2 }])).toBe(180);
    // 2 caixas diárias de 30: 60 lentes ÷ 2 olhos = 30 dias.
    expect(contactLensDurationDays([{ description: "LENTE DE CONTATO ACUVUE MOIST 1 DAY", quantity: 2 }])).toBe(30);
    const plan = planContactLensReminder(day("2026-10-01"), [{ description: "LENTE DE CONTATO ACUVUE MOIST 1 DAY", quantity: 2 }]);
    expect(plan.runOutDate.toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(plan.reminderDate.toISOString().slice(0, 10)).toBe("2026-10-26");
    expect(contactLensReminderDue(plan, day("2026-10-25"))).toBe(false);
    expect(contactLensReminderDue(plan, day("2026-10-26"))).toBe(true);
    expect(contactLensReminderDue(plan, day("2026-11-03"))).toBe(true);
    expect(contactLensReminderDue(plan, day("2026-11-04"))).toBe(false);
  });

  it("monta nome do produto e variáveis do modelo sem campo vazio", () => {
    expect(contactLensProductName("LENTE DE CONTATO ACUVUE OASYS -1.50")).toBe("Acuvue Oasys");
    expect(reminderTemplateParams(3, { name: "MARIA SILVA", item: "Acuvue Oasys", store: null })).toEqual(["Maria", "Acuvue Oasys", "nossa loja"]);
    expect(reminderTemplateParams(1, { name: "", item: null, store: null })).toEqual(["cliente"]);
    expect(reminderTemplateParams(0, { name: "Ana", item: null, store: null })).toEqual([]);
  });
});

describe("parser de receita e resumo do transbordo", () => {
  const extraction = { tipo: "receita", receita: { od: { esferico: "-2,00", cilindrico: "-0,50", eixo: "180", dnp: "31" }, oe: { esferico: "-1,75", adicao: "+2,00" }, data: "13/05/2026" } };

  it("extrai OD/OE, eixo com grau e data da receita", () => {
    const fields = prescriptionFromExtraction(extraction as never);
    expect(fields.odEsferico).toBe("-2,00");
    expect(fields.odEixo).toBe("180°");
    expect(fields.oeAdicao).toBe("+2,00");
    expect(fields.dataReceita?.toISOString().slice(0, 10)).toBe("2026-05-13");
    expect(prescriptionLine({ ...fields })).toBe("OD Esf -2,00 | Cil -0,50 | Eixo 180° | DNP 31; OE Esf -1,75 | Ad +2,00; Data 13/05/2026");
  });

  it("resumo com interesse, marcas, receita e loja ida e volta pela nota", () => {
    const brief = buildHandoffBrief({
      customer: "Maria Souza",
      customerTexts: ["oi, queria um óculos de sol ray ban", "também preciso de lente de grau"],
      products: ["Ray-Ban RB4340"],
      brands: [],
      prescription: { ...prescriptionFromExtraction(extraction as never) },
      store: null,
      city: "Goiânia",
    });
    expect(brief.interests).toEqual(["sol", "grau"]);
    expect(brief.products).toEqual(["Ray-Ban RB4340", "Ray-Ban"]);
    const parsed = parseHandoffBrief(formatHandoffBrief(brief));
    expect(parsed?.interest).toBe("Óculos de sol, Óculos de grau");
    expect(parsed?.store).toBe("Região: Goiânia");
    expect(parsed?.prescription).toContain("OD Esf -2,00");
  });

  it("detecta lentes de contato e ignora nota que não é resumo", () => {
    expect(detectInterests(["quero repor minha acuvue"])).toEqual(["lentes_contato"]);
    expect(parseHandoffBrief("IA transferiu o atendimento")).toBeNull();
  });
});

describe("recuperação de orçamento e janela de 24h", () => {
  const now = new Date("2026-11-24T15:00:00Z");
  const base = { lastAuthor: "bot" as const, hasIntent: true, brHour: 12, now };
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it("só entre 4 e 6 horas de silêncio do cliente, com intenção e janela aberta", () => {
    expect(shouldRecoverBudget({ ...base, lastAt: hoursAgo(5), lastInboundAt: hoursAgo(5.2) })).toBe(true);
    expect(shouldRecoverBudget({ ...base, lastAt: hoursAgo(3.5), lastInboundAt: hoursAgo(4) })).toBe(false);
    expect(shouldRecoverBudget({ ...base, lastAt: hoursAgo(6.5), lastInboundAt: hoursAgo(7) })).toBe(false);
    expect(shouldRecoverBudget({ ...base, hasIntent: false, lastAt: hoursAgo(5), lastInboundAt: hoursAgo(5) })).toBe(false);
    expect(shouldRecoverBudget({ ...base, lastAuthor: "customer", lastAt: hoursAgo(5), lastInboundAt: hoursAgo(5) })).toBe(false);
  });

  it("fora da janela de 24h ou de madrugada não manda texto livre", () => {
    expect(shouldRecoverBudget({ ...base, lastAt: hoursAgo(5), lastInboundAt: hoursAgo(23.95) })).toBe(false);
    expect(shouldRecoverBudget({ ...base, brHour: 22, lastAt: hoursAgo(5), lastInboundAt: hoursAgo(5) })).toBe(false);
  });

  it("mensagem cita o item exato sem travessão nem hífen", () => {
    const text = budgetRecoveryMessage({ name: "joão pedro", item: "Ray-Ban RB4340 — Preto", prescription: false });
    expect(text).toContain("Ray Ban RB4340, Preto");
    expect(text.startsWith("Oi, João!")).toBe(true);
    expect(text).not.toMatch(/[-–—]/);
    expect(budgetRecoveryMessage({ name: null, item: null, prescription: true })).toContain("receita");
  });
});

describe("atribuição CRM x VMSet", () => {
  it("normaliza telefone (55, nono dígito, máscara) e CPF", () => {
    expect(phoneMatchKey("5511987654321")).toBe("1187654321");
    expect(phoneMatchKey("(11) 98765-4321")).toBe("1187654321");
    expect(phoneMatchKey("11 8765-4321")).toBe("1187654321");
    expect(phoneMatchKey("4321")).toBeNull();
    expect(cpfKey("123.456.789-09")).toBe("12345678909");
    expect(cpfKey("111.111.111-11")).toBeNull();
  });

  it("venda em até 15 dias vai para o atendimento mais recente; fora da janela ou antes não conta", () => {
    const conversations = [
      { id: "c1", contactKey: "A", createdAt: new Date("2026-11-01T14:00:00Z"), assignee: "Ana", origin: "WhatsApp orgânico" },
      { id: "c2", contactKey: "A", createdAt: new Date("2026-11-05T14:00:00Z"), assignee: "Bia", origin: "Campanha: Black" },
      { id: "c3", contactKey: "B", createdAt: new Date("2026-11-01T14:00:00Z"), assignee: "Ana", origin: "WhatsApp orgânico" },
    ];
    const sales = [
      { saleKey: "L1-1", contactKey: "A", saleDate: day("2026-11-06"), total: 1000 },
      { saleKey: "L1-1", contactKey: "A", saleDate: day("2026-11-06"), total: 1000 },
      { saleKey: "L1-2", contactKey: "B", saleDate: day("2026-11-17"), total: 500 },
      { saleKey: "L1-3", contactKey: "B", saleDate: day("2026-10-30"), total: 300 },
    ];
    const attributed = attributeSalesToConversations(conversations, sales);
    expect(attributed.map((item) => [item.saleKey, item.conversationId])).toEqual([["L1-1", "c2"]]);
    const inWindow = attributeSalesToConversations(conversations, [{ saleKey: "L1-4", contactKey: "B", saleDate: day("2026-11-16"), total: 500 }]);
    expect(inWindow[0]?.conversationId).toBe("c3");

    const byAttendant = summarizeConversion(conversations, attributed, (item) => item.assignee);
    expect(byAttendant.find((row) => row.key === "Bia")).toMatchObject({ attended: 1, converted: 1, revenue: 1000, ticket: 1000, rate: 1 });
    expect(byAttendant.find((row) => row.key === "Ana")).toMatchObject({ attended: 2, converted: 0, revenue: 0, rate: 0 });
  });
});

describe("mapa de objeções", () => {
  it("classifica pelo que o cliente disse, estoque da equipe e falta de resposta", () => {
    expect(classifyObjection({ customerTexts: ["achei muito caro"], teamTexts: [], lastAuthor: "customer", closedByInactivity: false }).reason).toBe("preco");
    expect(classifyObjection({ customerTexts: ["fica muito longe de mim"], teamTexts: [], lastAuthor: "customer", closedByInactivity: false }).reason).toBe("distancia");
    expect(classifyObjection({ customerTexts: ["ok"], teamTexts: ["Infelizmente esse modelo está sem estoque"], lastAuthor: "customer", closedByInactivity: false }).reason).toBe("indisponibilidade");
    expect(classifyObjection({ customerTexts: ["quanto custa?"], teamTexts: ["Custa R$ 500"], lastAuthor: "agent", closedByInactivity: true }).reason).toBe("sem_resposta");
    expect(classifyObjection({ customerTexts: ["obrigado"], teamTexts: [], lastAuthor: "customer", closedByInactivity: false }).reason).toBe("outro");
  });

  it("ranking consolidado e semana ISO", () => {
    const ranking = rankObjections([{ reason: "preco" }, { reason: "preco" }, { reason: "distancia" }]);
    expect(ranking[0]).toMatchObject({ reason: "preco", label: "Preço", count: 2 });
    expect(isoWeek(day("2026-11-24"))).toBe("2026-W48");
  });
});

describe("configuração da suíte", () => {
  it("aceita só nomes de modelo válidos e mantém o padrão", () => {
    expect(sanitizeCommercialSettings({ rxReviewTemplate: { name: "revisao_grau", language: "pt_BR" }, contactLensTemplate: { name: "x y", language: "pt_BR" } })).toMatchObject({
      rxReviewTemplate: { name: "revisao_grau", language: "pt_BR" },
      contactLensTemplate: null,
      budgetRecoveryEnabled: true,
    });
  });
});
