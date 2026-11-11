import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Datas dos testes de horário são lidas no fuso de Brasília, como no servidor.
    env: { TZ: "America/Sao_Paulo" },
  },
});
