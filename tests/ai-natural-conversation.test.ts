import { describe, expect, it } from "vitest";
import { loadPromptModule } from "@/lib/ai/prompt-composer";
import { formatContext, speakerLabel, transcriptLine } from "@/lib/ai/agent-core";
import { qualifyFirstBlock, typeFirstBlock } from "@/lib/ai/sales-consultant";
import { classifyVague, vagueMessageBlock } from "@/lib/ai/vague-message";
import { CONSULTORIA_POS_CAMPANHA_MD, DEFAULT_SKILLS, ESTOQUE_MD } from "@/lib/ai/studio";
import { CONVERSATION_TEMPERATURE, conversationTemperature } from "@/lib/ai/temperature";
import { buildCopilotPrompt } from "@/lib/ai/reply-copilot";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

describe("IA conversacional: sem roteiro engessado", () => {
  it("núcleo manda ler o fio inteiro, tratar mensagem vaga como gente e manter o escopo da ótica", () => {
    const core = loadPromptModule("core");
    expect(core).toContain("última mensagem da loja");
    expect(core).toMatch(/Acho que sua mensagem cortou/);
    expect(core).toMatch(/Nunca finja que entendeu \("Entendi\."\)/);
    expect(core).toMatch(/fora disso \(política, receitas, programação/);
    expect(core).toMatch(/Nunca invente preços/);
  });

  it("nenhum bloco de qualificação traz pergunta pronta de grau/sol + cidade", () => {
    const blocks = [qualifyFirstBlock(), typeFirstBlock(false), loadPromptModule("qualificacao"), CONSULTORIA_POS_CAMPANHA_MD, ESTOQUE_MD];
    for (const block of blocks) {
      expect(block).not.toMatch(/faça no máximo 2 perguntas rápidas|pergunte só se ele procura óculos de grau ou de sol|Ordem: primeiro a cidade/);
    }
    expect(qualifyFirstBlock()).toContain("releia a última mensagem da loja");
    expect(DEFAULT_SKILLS.find((skill) => skill.slug === "estoque_cidade")?.instructionsMd).toBe(ESTOQUE_MD);
  });

  it("mensagem acidental ou curta vira regra própria do turno; pedidos reais não", () => {
    for (const text of ["aa", "?", "k", "hm", "😅", "...", "aaaaa"]) expect(classifyVague(text), text).toBe("accidental");
    for (const text of ["ok", "sim", "Não", "beleza", "vlw"]) expect(classifyVague(text), text).toBe("short_answer");
    for (const text of ["2", "Quero ver óculos de sol", "tem Ray-Ban?", "Vitória"]) expect(classifyVague(text), text).toBeNull();
    expect(vagueMessageBlock("accidental")).toMatch(/NÃO diga "Entendi"/);
    expect(vagueMessageBlock("short_answer")).toMatch(/última coisa que a loja disse/);
    expect(vagueMessageBlock(null)).toBe("");
  });
});

describe("contexto enviado ao modelo", () => {
  it("mensagem de campanha aparece como fala da loja com o nome da campanha", () => {
    expect(speakerLabel({ author: "agent", authorName: "Campanha · Reativação Clientes 2024" })).toBe('Loja (mensagem da campanha "Reativação Clientes 2024" enviada ao cliente)');
    expect(speakerLabel({ author: "agent", authorName: "Thamyres Lima" })).toBe("Atendente Thamyres");
    expect(speakerLabel({ author: "customer", authorName: null })).toBe("Cliente");
    const line = transcriptLine({ author: "agent", authorName: "Campanha · Pós-venda", text: "Como estão seus óculos atuais?", internal: false, attachment: null, createdAt: new Date("2026-11-20T15:00:00Z") });
    expect(line).toContain('Loja (mensagem da campanha "Pós-venda"');
    expect(line).toContain("Como estão seus óculos atuais?");
  });

  it("cidade e loja do cadastro entram no contexto para não serem perguntadas de novo", () => {
    const text = formatContext({ contactName: "Christofer Silva", queueName: null, subject: "", includeHistory: false, history: null, conversation: "x", registered: { city: "Vitória", store: "13" } });
    expect(text).toContain("Cadastro: cidade Vitória · loja 13 (já sabido: não pergunte de novo");
    expect(formatContext({ contactName: null, queueName: null, subject: "", includeHistory: false, history: null, conversation: "" })).not.toContain("Cadastro:");
  });

  it("temperatura baixa nas conversas (0,1 a 0,2); a escolha da equipe só vale para baixo", () => {
    expect(CONVERSATION_TEMPERATURE).toBeGreaterThanOrEqual(0.1);
    expect(CONVERSATION_TEMPERATURE).toBeLessThanOrEqual(0.2);
    expect(conversationTemperature({ temperature: null })).toBe(CONVERSATION_TEMPERATURE);
    expect(conversationTemperature({ temperature: 0.7 })).toBe(CONVERSATION_TEMPERATURE);
    expect(conversationTemperature({ temperature: 0.1 })).toBe(0.1);
  });

  it("copiloto do /chat recebe a regra do turno (mensagem vaga) junto do perfil", () => {
    const prompt = buildCopilotPrompt({ brandRules: "B", modules: "M", settings: DEFAULT_AI_SETTINGS, agentName: "Ana", knowledge: "", customer: { name: "Christofer", city: "Vitória", store: null, tier: null, rfvpSegment: null, campaign: null }, turnHint: vagueMessageBlock("accidental") });
    expect(prompt).toContain("MENSAGEM VAGA NESTE TURNO");
    expect(prompt).toContain("nunca com frase genérica de primeiro contato");
  });
});
