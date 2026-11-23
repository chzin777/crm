import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_AGENT_CAPACITY } from "@/lib/chat/types";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("limite de conversas simultâneas por atendente", () => {
  it("teto é 999", () => {
    expect(MAX_AGENT_CAPACITY).toBe(999);
  });

  it("API, tela de filas e painel da equipe usam o teto comum, sem o antigo 200", () => {
    for (const file of ["app/api/chat/team/route.ts", "components/chat/QueueBoard.tsx", "components/chat/TeamPanel.tsx"]) {
      const code = source(file);
      expect(code).toContain("MAX_AGENT_CAPACITY");
      expect(code).not.toMatch(/capacity[^\n]*max\(200\)|max=\{200\}/);
    }
  });

  it("distribuição compara a carga com a capacidade sem clamp oculto", () => {
    const code = source("lib/chat/distribution.ts");
    expect(code).toContain("member.load < member.capacity");
    expect(code).not.toMatch(/Math\.min\([^)]*capacity|200/);
  });
});
