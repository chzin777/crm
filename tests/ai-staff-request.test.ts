import { describe, expect, it } from "vitest";
import { bareNameHint, contactFirstName, defaultHandoffNotice, detectStaffRequest, matchStaff, STAFF_NAME_RULES, staffConfirmation, type StaffMember } from "@/lib/ai/staff-request";
import { agentRules, customerMessages } from "@/lib/ai/agent-core";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/settings";

const STAFF: StaffMember[] = [
  { id: "u-leandro", name: "Leandro Martins", queueId: "q-vendas", queueName: "Vendas" },
  { id: "u-ana", name: "Ana Paula Souza", queueId: "q-financeiro", queueName: "Financeiro" },
  { id: "u-joao1", name: "João Silva", queueId: null, queueName: null },
  { id: "u-joao2", name: "João Pereira", queueId: null, queueName: null },
  { id: "u-rosa", name: "Rosa Lima", queueId: null, queueName: null },
];

describe("nome de atendente citado pelo cliente", () => {
  it("nome solto de colaborador do CRM é pedido para falar com ele (nunca o nome do cliente)", () => {
    for (const text of ["Leandro", "leandro", "Oi Leandro", "Leandro?", "Boa noite, Leandro", "o Leandro", "Leandro Martins"]) {
      expect(detectStaffRequest(text, STAFF, "Vivi"), text).toMatchObject({ name: "Leandro", staff: { id: "u-leandro", queueName: "Vendas" } });
    }
  });

  it("pedido explícito, com ou sem cadastro (vendedor da loja física)", () => {
    expect(detectStaffRequest("Preciso falar com Leandro", STAFF, "Vivi")).toMatchObject({ name: "Leandro", staff: { id: "u-leandro" } });
    expect(detectStaffRequest("Falar com a Ana", STAFF, "Vivi")).toMatchObject({ name: "Ana", staff: { id: "u-ana" } });
    expect(detectStaffRequest("quero falar com o Marcos por favor", STAFF, "Vivi")).toEqual({ name: "Marcos", staff: null });
    // Dois João: só o sobrenome decide a pessoa.
    expect(detectStaffRequest("falar com o João", STAFF, "Vivi")).toEqual({ name: "João", staff: null });
    expect(detectStaffRequest("falar com João Pereira", STAFF, "Vivi")).toMatchObject({ staff: { id: "u-joao2" } });
  });

  it("apresentação, o próprio nome, pedidos genéricos e palavras comuns não contam", () => {
    for (const text of ["Meu nome é Leandro", "Aqui é o Leandro", "Vivi", "Quero falar com um atendente", "falar com alguém", "falar com vocês", "tem rosa?", "quero ver armação rosa", "Quero comprar um óculos", "obrigado", "Sim", "Qual o preço?"]) {
      expect(detectStaffRequest(text, STAFF, "Vivi"), text).toBeNull();
    }
    expect(matchStaff(STAFF, "joao")).toBeNull();
    expect(matchStaff(STAFF, "ana paula")?.id).toBe("u-ana");
  });

  it("confirmação acolhedora com o nome do contato do cadastro; aviso padrão nunca deixa o cliente sem resposta", () => {
    expect(staffConfirmation("Vivi", "Leandro")).toBe("Claro, Vivi! Vou te transferir agora mesmo para falar com o Leandro. Só um instante! 😊");
    expect(staffConfirmation("Vivi Andrade", "Ana")).toBe("Claro, Vivi! Vou te transferir agora mesmo para falar com a Ana. Só um instante! 😊");
    expect(staffConfirmation("5562999999999", "Leandro")).toBe("Claro! Vou te transferir agora mesmo para falar com o Leandro. Só um instante! 😊");
    expect(contactFirstName("Cliente Teste")).toBe("");
    expect(defaultHandoffNotice("Vivi")).toBe("Claro, Vivi! Vou te transferir agora mesmo para um dos nossos atendentes. Só um instante! 😊");
    // Transferência por palavra-chave sem mensagem configurada: antes saía vazia (silenciosa).
    expect(customerMessages({ action: "handoff", reply: "", reason: "Cliente pediu para falar com uma pessoa", queue: "", trigger: "keyword" }, { handoffMessage: "" }, { customer: "Vivi" })).toEqual([defaultHandoffNotice("Vivi")]);
    expect(customerMessages({ action: "handoff", reply: staffConfirmation("Vivi", "Leandro"), reason: "x", queue: "", trigger: "staff" }, { handoffMessage: "Vou te passar para a equipe." }, { customer: "Vivi" })).toEqual([staffConfirmation("Vivi", "Leandro")]);
  });

  it("regras fixas no prompt e dica do turno para nome fora do cadastro", () => {
    const prompt = agentRules(DEFAULT_AI_SETTINGS, []);
    expect(prompt).toContain(STAFF_NAME_RULES);
    expect(prompt).toContain("Nunca faça transferência silenciosa");
    expect(bareNameHint("Marcos", "Vivi")).toContain("NÃO é o nome do cliente (ele se chama Vivi)");
    expect(bareNameHint("Vivi", "Vivi")).toBe("");
    expect(bareNameHint("Quero ver modelos", "Vivi")).toBe("");
  });
});
