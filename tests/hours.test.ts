import { describe, expect, it } from "vitest";
import { autoReplyText, DEFAULT_SCHEDULE, describeSchedule, isOpenAt, sanitizeSchedule } from "@/lib/chat/hours";

const rule = { enabled: true, schedule: DEFAULT_SCHEDULE, autoReplyMessage: "" };
// Datas com fuso explícito de Brasília: o resultado não depende do fuso da máquina.
const at = (iso: string) => new Date(`${iso}-03:00`);

describe("horário de atendimento", () => {
  it("dentro do expediente em dia útil", () => {
    expect(isOpenAt(rule, at("2026-11-11T10:00:00"))).toBe(true); // quarta
  });

  it("antes de abrir e no minuto de fechar está fechado", () => {
    expect(isOpenAt(rule, at("2026-11-11T07:59:00"))).toBe(false);
    expect(isOpenAt(rule, at("2026-11-11T18:00:00"))).toBe(false);
  });

  it("sábado só até meio-dia e domingo fechado", () => {
    expect(isOpenAt(rule, at("2026-11-14T11:30:00"))).toBe(true);
    expect(isOpenAt(rule, at("2026-11-14T12:30:00"))).toBe(false);
    expect(isOpenAt(rule, at("2026-11-15T10:00:00"))).toBe(false);
  });

  it("usa o horário de Brasília mesmo quando o UTC já é outro dia", () => {
    // 22h de sexta em Brasília = 01h de sábado em UTC
    expect(isOpenAt(rule, new Date("2026-11-14T01:00:00Z"))).toBe(false);
    expect(isOpenAt({ ...rule, schedule: [{ day: 5, open: "08:00", close: "23:00" }] }, new Date("2026-11-14T01:00:00Z"))).toBe(true);
  });

  it("regra desligada nunca bloqueia", () => {
    expect(isOpenAt({ ...rule, enabled: false }, at("2026-11-15T03:00:00"))).toBe(true);
  });

  it("descarta faixas inválidas e dias repetidos", () => {
    expect(sanitizeSchedule([{ day: 1, open: "18:00", close: "08:00" }, { day: 9, open: "08:00", close: "18:00" }, { day: 2, open: "8h", close: "18:00" }])).toEqual([]);
    expect(sanitizeSchedule([{ day: 1, open: "08:00", close: "12:00" }, { day: 1, open: "13:00", close: "18:00" }])).toEqual([{ day: 1, open: "13:00", close: "18:00" }]);
  });

  it("descreve dias seguidos como intervalo", () => {
    expect(describeSchedule(DEFAULT_SCHEDULE)).toBe("seg a sex, 8h às 18h; sáb, 8h às 12h");
    expect(describeSchedule([{ day: 1, open: "08:30", close: "17:45" }])).toBe("seg, 08h30 às 17h45");
  });

  it("mensagem automática preenche {horario}", () => {
    expect(autoReplyText({ ...rule, autoReplyMessage: "Atendemos {horario}." })).toBe("Atendemos seg a sex, 8h às 18h; sáb, 8h às 12h.");
    expect(autoReplyText(rule)).toContain("seg a sex, 8h às 18h");
  });
});
