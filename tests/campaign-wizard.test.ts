import { describe, expect, it } from "vitest";
import { firstName, missingParams, outsideSendWindow, parseSchedule, renderPreview, resolveParam, summarizeAudience, validateWizardStep, type WizardState } from "@/lib/campaign-wizard";

const NOW = new Date("2026-11-26T13:00:00Z"); // 10:00 em Brasília
const base: WizardState = {
  name: "Black Friday",
  segments: 1,
  audienceValid: 120,
  message: "Olá {{1}}, sua oferta: {{2}}",
  hasTemplate: true,
  params: ["primeiro_nome", "fixo:20% off"],
  uploading: false,
  schedule: { mode: "now", day: "", time: "09:00" },
};

describe("assistente de campanha: variáveis do modelo", () => {
  it("texto fixo vai igual para todos; campo do contato vem do contato; vazio vira '-' (a Meta recusa vazio)", () => {
    const values = { primeiro_nome: "Maria", nome: "MARIA SOUZA" };
    expect(resolveParam("fixo:Black Friday", values)).toBe("Black Friday");
    expect(resolveParam("primeiro_nome", values)).toBe("Maria");
    expect(resolveParam("email", values)).toBe("-");
    expect(resolveParam("fixo:   ", values)).toBe("-");
    expect(firstName("MARIA DA SILVA")).toBe("Maria");
    expect(firstName("")).toBe("");
  });

  it("prévia troca as variáveis por exemplos e pelo texto fixo", () => {
    expect(renderPreview("Olá {{1}}! {{2}} até domingo. {{3}}", ["primeiro_nome", "fixo:20% off"])).toBe("Olá Maria! 20% off até domingo. {{3}}");
  });

  it("variável sem campo ou com texto fixo vazio é apontada", () => {
    expect(missingParams("Olá {{1}}, {{2}} e {{3}}", ["nome", "fixo:", "fixo:ok"])).toEqual([2]);
    expect(missingParams("Olá {{1}} e {{2}}", ["nome"])).toEqual([2]);
    expect(missingParams("Sem variáveis", [])).toEqual([]);
  });
});

describe("assistente de campanha: público válido", () => {
  it("tira repetidos (mesmo celular), descadastrados e quem não tem celular válido", () => {
    const summary = summarizeAudience([
      { id: "a", telefone: "62999990001" },
      { id: "b", telefone: "+55 62 99999-0001" },
      { id: "c", telefone: "62999990002" },
      { id: "d", telefone: "123" },
      { id: "e", telefone: "62999990003" },
    ], new Set(["c"]));
    expect(summary).toEqual({ total: 5, duplicates: 1, optedOut: 1, invalidPhone: 1, valid: 2 });
  });
});

describe("assistente de campanha: agendamento em horário de Brasília", () => {
  it("converte o horário de parede de Brasília para o instante certo", () => {
    const parsed = parseSchedule("2026-11-27", "09:30", NOW);
    expect("at" in parsed && parsed.at.toISOString()).toBe("2026-11-27T12:30:00.000Z");
  });

  it("recusa passado, menos de 5 min, mais de 60 dias e campos vazios", () => {
    expect(parseSchedule("2026-11-26", "09:00", NOW)).toEqual({ error: "Agende para pelo menos 5 minutos a partir de agora." });
    expect(parseSchedule("2026-11-26", "10:03", NOW)).toEqual({ error: "Agende para pelo menos 5 minutos a partir de agora." });
    expect("at" in parseSchedule("2026-11-26", "10:06", NOW)).toBe(true);
    expect(parseSchedule("2027-02-01", "10:00", NOW)).toEqual({ error: "Agende para no máximo 60 dias à frente." });
    expect(parseSchedule("", "10:00", NOW)).toEqual({ error: "Informe a data e o horário do disparo." });
  });

  it("avisa quando o horário cai fora da janela permitida (inclusive domingo)", () => {
    const window = { start: "08:30", end: "18:30", skipSundays: true };
    expect(outsideSendWindow("2026-11-27", "09:00", window)).toBe(false);
    expect(outsideSendWindow("2026-11-27", "19:00", window)).toBe(true);
    expect(outsideSendWindow("2026-11-29", "10:00", window)).toBe(true);
    expect(outsideSendWindow("2026-11-29", "10:00", null)).toBe(false);
  });
});

describe("assistente de campanha: validação por etapa", () => {
  it("etapa 1: nome, segmento e público válido maior que zero", () => {
    expect(validateWizardStep(1, base, NOW)).toBe("");
    expect(validateWizardStep(1, { ...base, name: "  " }, NOW)).toBe("Informe o nome da campanha.");
    expect(validateWizardStep(1, { ...base, segments: 0 }, NOW)).toBe("Selecione pelo menos um segmento para o público.");
    expect(validateWizardStep(1, { ...base, audienceValid: 0 }, NOW)).toMatch(/nenhum contato válido/);
    expect(validateWizardStep(1, { ...base, audienceValid: null }, NOW)).toBe("");
  });

  it("etapa 2: modelo escolhido, variáveis preenchidas e anexos terminados", () => {
    expect(validateWizardStep(2, base, NOW)).toBe("");
    expect(validateWizardStep(2, { ...base, message: "" }, NOW)).toBe("Escolha o modelo aprovado.");
    expect(validateWizardStep(2, { ...base, hasTemplate: false, message: "" }, NOW)).toBe("Escolha um modelo aprovado ou escreva a mensagem.");
    expect(validateWizardStep(2, { ...base, params: ["nome", "fixo:"] }, NOW)).toBe("Preencha a variável {{2}} do modelo.");
    expect(validateWizardStep(2, { ...base, uploading: true }, NOW)).toBe("Aguarde o envio dos arquivos anexados terminar.");
  });

  it("etapa 3: agendamento válido só quando escolheu agendar", () => {
    expect(validateWizardStep(3, base, NOW)).toBe("");
    expect(validateWizardStep(3, { ...base, schedule: { mode: "later", day: "2026-11-26", time: "08:00" } }, NOW)).toMatch(/5 minutos/);
    expect(validateWizardStep(3, { ...base, schedule: { mode: "later", day: "2026-11-28", time: "09:00" } }, NOW)).toBe("");
  });
});
