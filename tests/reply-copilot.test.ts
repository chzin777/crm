import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCopilotPrompt, customerProfileBlock } from "@/lib/ai/reply-copilot";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

const customer = { name: "Ana Souza", city: "Vitória", store: "13", tier: "OURO", rfvpSegment: "Campeões", campaign: "Black Friday Solar" };

describe("copiloto de resposta do /chat", () => {
  it("usa tom, instruções da empresa e regras de preço configurados em /ia, com a IA autônoma desligada", () => {
    const settings = { ...DEFAULT_AI_SETTINGS, autonomousEnabled: false, tone: "objetivo" as const, canQuotePrices: false, extraInstructions: "Nunca ofereça descontos." };
    const prompt = buildCopilotPrompt({ brandRules: "REGRAS DA MARCA", modules: "MODULOS DO ESTUDIO", settings, agentName: "Carla Lima", knowledge: "Lojas: LJ 13 Centro", customer });
    expect(prompt).toContain("REGRAS DA MARCA");
    expect(prompt).toContain("MODULOS DO ESTUDIO");
    expect(prompt).toContain("Tom objetivo");
    expect(prompt).toContain("Nunca ofereça descontos.");
    expect(prompt).toContain("Não informe preços");
    expect(prompt).toContain("atendente Carla");
    expect(prompt).toContain("Lojas: LJ 13 Centro");
    expect(prompt).toContain("visita à loja ou o fechamento");
  });

  it("leva perfil do cliente, RFV-P e campanha de origem; cidade desconhecida pede qualificação", () => {
    const block = customerProfileBlock(customer);
    expect(block).toContain("Cidade: Vitória");
    expect(block).toContain("Perfil RFV-P: Campeões");
    expect(block).toContain('campanha: "Black Friday Solar"');
    expect(customerProfileBlock({ ...customer, city: null })).toContain("qualifique cidade e faixa de valor");
  });

  it("a rota de sugestão só devolve texto: nunca chama envio ao WhatsApp", () => {
    const source = readFileSync(join(process.cwd(), "app", "api", "chat", "conversas", "[id]", "sugerir-resposta", "route.ts"), "utf8");
    expect(source).toMatch(/requireChatActor\("chat\.assume"\)/);
    expect(source).toMatch(/findScopedConversation/);
    expect(source).not.toMatch(/send(Text|AgentMessage|Template|AutomaticMessage)|meta-whatsapp/);
  });

  it("o composer só preenche o campo: envio continua dependendo do botão Enviar/Enter", () => {
    const source = readFileSync(join(process.cwd(), "components", "chat", "Composer.tsx"), "utf8");
    const suggest = source.slice(source.indexOf("const suggestReply = async"), source.indexOf("const visibleSuggestion"));
    expect(suggest).toContain("sugerir-resposta");
    expect(suggest).not.toMatch(/onSend\(|submit\(/);
    expect(suggest).toContain("toast.error");
  });
});
