import { describe, expect, it } from "vitest";
import { brasiliaGreeting, buildSystemPrompt, GREETING_RULES } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

/** Horário de Brasília (UTC-3, sem horário de verão) → instante UTC, como num servidor em UTC. */
const br = (hhmm: string) => new Date(`2026-11-13T${hhmm}:00-03:00`);

describe("período do dia em Brasília", () => {
  it.each([
    ["05:00", "manhã", "Bom dia"],
    ["11:10", "manhã", "Bom dia"],
    ["11:59", "manhã", "Bom dia"],
    ["12:00", "tarde", "Boa tarde"],
    ["16:00", "tarde", "Boa tarde"],
    ["17:59", "tarde", "Boa tarde"],
    ["18:00", "noite", "Boa noite"],
    ["21:00", "noite", "Boa noite"],
    ["00:30", "noite", "Boa noite"],
    ["04:59", "noite", "Boa noite"],
  ])("%s em Brasília → %s (%s)", (hhmm, period, greeting) => {
    const result = brasiliaGreeting(br(hhmm));
    expect(result).toMatchObject({ time: hhmm, period, greeting });
  });

  it("usa o fuso de Brasília, não o do servidor: 14:00 UTC é manhã (11:00), 20:59 UTC é tarde (17:59) e 21:00 UTC é noite (18:00)", () => {
    expect(brasiliaGreeting(new Date("2026-11-13T14:00:00Z")).greeting).toBe("Bom dia");
    expect(brasiliaGreeting(new Date("2026-11-13T20:59:00Z")).greeting).toBe("Boa tarde");
    expect(brasiliaGreeting(new Date("2026-11-13T21:00:00Z")).greeting).toBe("Boa noite");
  });
});

describe("saudação natural no prompt", () => {
  const settings = { ...DEFAULT_AI_SETTINGS, extraInstructions: "" };

  it("proíbe apresentação como assistente virtual e manda saudar pelo horário", () => {
    const prompt = buildSystemPrompt({ settings, info: "", now: br("11:10"), firstReply: true });
    expect(prompt).toContain(GREETING_RULES);
    expect(GREETING_RULES).toContain('NUNCA se apresente como "assistente virtual"');
    expect(GREETING_RULES).toContain('"Olá! Eu sou a assistente virtual da Óticas Brasil"');
    expect(prompt).toContain('Horário atual em Brasília: 11:10 (período: manhã -> use "Bom dia")');
    expect(prompt).toContain('comece com "Bom dia!"');
    // Nenhuma instrução manda se apresentar como assistente virtual.
    expect(prompt).not.toMatch(/apresente-se[^.]*assistente virtual/i);
  });

  it("à noite usa Boa noite e, depois da primeira resposta, não cumprimenta de novo", () => {
    const later = buildSystemPrompt({ settings, info: "", now: br("21:00"), firstReply: false });
    expect(later).toContain('(período: noite -> use "Boa noite")');
    expect(later).toContain("não cumprimente de novo");
    expect(later).not.toContain("primeira resposta nesta conversa");
  });
});
