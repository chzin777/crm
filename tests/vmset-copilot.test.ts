import { describe, expect, it, vi } from "vitest";
import { extractChatOperationalContext, extractProductReference, maskForLog, suggestQuickQueries } from "@/lib/chat/operational-context";
import { runQuickQuery, type QuickQueryDeps } from "@/lib/chat/quick-query";
import { runOperatorCopilot } from "@/lib/chat/operator-copilot";
import type { InstallmentItem } from "@/lib/ai/installments";
import type { ChatMessage } from "@/lib/ai/openai";

const CPF = "52998224725";
const parcel = (parcela: string, vencimento: string, posicao: string, valor = 150): InstallmentItem => ({ numero: "C-100", parcela, vencimento, valor, posicao, pagamento: posicao === "Quitado" ? vencimento : null, valorPago: posicao === "Quitado" ? valor : null, tipo: "Carnê" });

const deps = (overrides: Partial<QuickQueryDeps> = {}): QuickQueryDeps => ({
  lookupInstallments: vi.fn(async () => ({ status: "ok" as const, found: true, name: "MARIA DA SILVA", items: [parcel("1/3", "2026-09-10", "Quitado"), parcel("2/3", "2026-10-10", "Aberto"), parcel("3/3", "2026-12-10", "Aberto")] })),
  findByName: vi.fn(async () => []),
  stock: vi.fn(async () => ({ status: "ok" as const, products: [] })),
  purchases: vi.fn(async () => []),
  prescriptions: vi.fn(async () => []),
  now: () => new Date("2026-11-16T12:00:00Z"),
  ...overrides,
});

describe("Copiloto VMSet: contexto da conversa", () => {
  it("CPF e intenção de faturas no chat geram o botão de 1 clique certo", () => {
    const context = extractChatOperationalContext({
      contact: { name: "Maria da Silva", cpf: null },
      messages: [
        { author: "bot", text: "Olá! Como posso ajudar?" },
        { author: "customer", text: "Oi, queria saber quantas parcelas faltam do meu carnê" },
        { author: "customer", text: "meu cpf é 529.982.247-25" },
      ],
    });
    expect(context).toMatchObject({ cpf: CPF, cpfSource: "chat", intent: "faturas_parcelas" });
    const [first] = suggestQuickQueries(context);
    expect(first.kind).toBe("faturas");
    expect(first.label).toContain("Consultar faturas de Maria da Silva");
    expect(first.label).toContain("CPF");
    expect(first.label).not.toContain(CPF);
    expect(first.params).toEqual({ cpf: CPF, name: "Maria da Silva" });
  });

  it("CPF do cadastro quando o cliente não digitou; CPF inválido no chat é ignorado", () => {
    const context = extractChatOperationalContext({ contact: { name: "João", cpf: CPF }, messages: [{ author: "customer", text: "meu cpf 111.222.333-00, quero ver meu crediário" }] });
    expect(context.cpfSource).toBe("cadastro");
    expect(context.cpf).toBe(CPF);
  });

  it("nome completo declarado no chat é usado quando não há nome cadastrado", () => {
    const context = extractChatOperationalContext({ contact: { name: null, cpf: null }, messages: [{ author: "customer", text: "Meu nome é Maria Aparecida da Silva, queria ver meu carnê" }] });
    expect(context.name).toBe("Maria Aparecida da Silva");
    expect(suggestQuickQueries(context)[0].label).toBe("Consultar faturas de Maria Aparecida da Silva");
  });

  it("referência do produto e sugestão de estoque", () => {
    expect(extractProductReference([{ author: "customer", text: "vocês tem o rb 3025 dourado?" }])).toBe("RB 3025");
    expect(extractProductReference([{ author: "bot", text: "🕶️ *Prada Linea Rossa | Ref. PS 07RV*\n💵 *Valor:* R$ 1.290,00" }])).toBe("PS 07RV".length ? "Prada PS 07RV" : "");
    expect(extractProductReference([{ author: "customer", text: "quero ver os óculos da radda" }])).toBe("Radda");
    const context = extractChatOperationalContext({ contact: { name: "Ana", cpf: null }, messages: [{ author: "customer", text: "Qual loja tem o RB3025 e quanto custa?" }] });
    expect(context.intent).toBe("estoque_preco");
    expect(suggestQuickQueries(context)[0]).toMatchObject({ kind: "estoque", label: "Ver estoque e preço de RB3025", params: { term: "RB3025" } });
  });

  it("garantia/OS sugere histórico de compras", () => {
    const context = extractChatOperationalContext({ contact: { name: "Carlos Souza", cpf: CPF }, messages: [{ author: "customer", text: "meu óculos quebrou, ainda está na garantia?" }] });
    expect(suggestQuickQueries(context)[0]).toMatchObject({ kind: "compras", label: "Histórico de OS e compras de Carlos Souza" });
  });

  it("CPF mascarado no log", () => {
    expect(maskForLog("parcelas do 529.982.247-25")).not.toContain("529.982.247-25");
  });
});

describe("Copiloto VMSet: consulta rápida de faturas", () => {
  it("por CPF devolve parcelas em aberto e o texto para jogar na mensagem", async () => {
    const d = deps();
    const result = await runQuickQuery({ kind: "faturas", params: { cpf: "529.982.247-25" } }, d);
    expect(d.lookupInstallments).toHaveBeenCalledWith(CPF);
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Em aberto", value: "2 parcelas" }),
      expect.objectContaining({ label: "Total pendente", value: expect.stringContaining("300,00") }),
      expect.objectContaining({ label: "Parcela 2/3", value: expect.stringContaining("vencida") }),
    ]));
    expect(result.reply).toContain("2 parcelas em aberto");
    expect(result.reply).toContain("Maria");
    expect(result.reply).not.toContain(CPF);
  });

  it("por nome: um cadastro consulta direto, vários pedem escolha, VMSet fora não gera mensagem", async () => {
    const single = deps({ findByName: vi.fn(async () => [{ name: "MARIA DA SILVA", cpf: CPF }]) });
    expect((await runQuickQuery({ kind: "faturas", params: { name: "Maria da Silva" } }, single)).ok).toBe(true);
    const many = await runQuickQuery({ kind: "faturas", params: { name: "Maria" } }, deps({ findByName: vi.fn(async () => [{ name: "MARIA A", cpf: CPF }, { name: "MARIA B", cpf: "11144477735" }]) }));
    expect(many.candidates).toHaveLength(2);
    expect(many.reply).toBeNull();
    const down = await runQuickQuery({ kind: "faturas", params: { cpf: CPF } }, deps({ lookupInstallments: vi.fn(async () => ({ status: "unavailable" as const })) }));
    expect(down.ok).toBe(false);
    expect(down.reply).toBeNull();
  });

  it("CPF com dígitos inválidos não consulta o VMSet", async () => {
    const d = deps();
    const result = await runQuickQuery({ kind: "faturas", params: { cpf: "111.222.333-44" } }, d);
    expect(result.ok).toBe(false);
    expect(result.title).toBe("CPF inválido");
    expect(d.lookupInstallments).not.toHaveBeenCalled();
  });

  it("estoque lista lojas e quantidade", async () => {
    const result = await runQuickQuery({ kind: "estoque", params: { term: "RB3025" } }, deps({ stock: vi.fn(async () => ({ status: "ok" as const, products: [{ produto: "Ray-Ban Aviator RB3025", preco: "R$ 899,00", total: 3, lojas: [{ loja: "Setor Marista", quantidade: 2 }, { loja: "Flamboyant", quantidade: 1 }] }] })) }));
    expect(result.lines.map((line) => line.label)).toContain("Setor Marista");
    expect(result.reply).toContain("📍 Setor Marista — 2 un.");
  });

  it("compras separa data, pedido, valor e descrição longa sem omitir itens", async () => {
    const description = "PROG ZEISS GT2 1.59 INC FF SURF " + "TRATAMENTO".repeat(30);
    const result = await runQuickQuery({ kind: "compras", params: { cpf: CPF } }, deps({
      purchases: vi.fn(async () => [{ pedido: "123", data: "2026-11-16", loja: "Loja Centro", itens: [description, "Lente", "Armação"], total: 1300 }]),
    }));
    expect(result.title).toBe("Compras e OS");
    expect(result.lines[0]).toMatchObject({ label: "16/11/2026 · Pedido 123 · Loja Centro", value: `${description}, Lente, Armação`, amount: expect.stringContaining("1.300,00") });
  });
});

describe("Copiloto VMSet: mini-chat do operador", () => {
  it("responde ao atendente usando a consulta e nunca envia mensagem ao cliente", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const query = vi.fn(async () => runQuickQuery({ kind: "faturas", params: { cpf: CPF } }, deps()));
    const ai = vi.fn(async (messages: ChatMessage[]) => {
      const prompt = JSON.stringify(messages);
      expect(prompt).not.toContain(CPF);
      expect(prompt).not.toContain("Maria");
      expect(prompt).not.toContain("quanto falta do carnê");
      return { consulta: "faturas" };
    });
    const context = extractChatOperationalContext({ contact: { name: "Maria", cpf: CPF }, messages: [{ author: "customer", text: "quanto falta do carnê?" }] });
    const result = await runOperatorCopilot({ question: "Quantas parcelas faltam pro CPF 529.982.247-25?", context }, { ai, query });
    expect(result.answer).toContain("Em aberto: 2 parcelas");
    expect(result.customerReply).toContain("2 parcelas em aberto");
    expect(result).toMatchObject({ consulted: ["faturas"] });
    expect(query).toHaveBeenCalledWith("faturas", { cpf: CPF, name: "Maria" });
    expect(ai).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("pergunta vazia não chama a IA", async () => {
    const ai = vi.fn();
    const result = await runOperatorCopilot({ question: "   ", context: extractChatOperationalContext({ contact: { name: null, cpf: null }, messages: [] }) }, { ai, query: vi.fn() });
    expect(ai).not.toHaveBeenCalled();
    expect(result.customerReply).toBeNull();
  });
});
