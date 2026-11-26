import { vi } from "vitest";
import { SEED_MODULES } from "./helpers/prompt-seed";

// Banco dos testes = módulos do seed (o que a produção recebe na primeira execução, editável em /ia).
vi.mock("@/lib/ai/prompt-modules-db", () => ({
  loadPromptModules: vi.fn(async () => SEED_MODULES),
  listPromptModules: vi.fn(async () => SEED_MODULES),
  ensurePromptModulesSeeded: vi.fn(async () => undefined),
}));
