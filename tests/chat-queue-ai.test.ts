import { describe, expect, it } from "vitest";
import { aiTakeoverPatch, handoffPatch, isAiHandling, planQueuePositions, type QueueRow } from "@/lib/chat/queue-rules";

const NOW = new Date("2026-11-13T15:00:00Z");
const min = (n: number) => new Date(NOW.getTime() - n * 60_000);
const GERAL = "fila-geral";

/** Cliente aguardando um atendente na fila Atendimento Geral. */
const waiting = (id: string, since: number, notifiedPosition: number | null = null): QueueRow => ({
  id, status: "waiting", queueId: GERAL, queueName: "Atendimento Geral", assigneeId: null, closedAt: null,
  waitingSince: min(since), lastInboundAt: min(1), menuState: { notifiedPosition },
});

/** Aplica o patch gravado pelo agente, como o banco faria. */
const apply = (row: QueueRow, patch: Partial<QueueRow>, state: object): QueueRow => ({ ...row, ...patch, menuState: { ...(row.menuState as object), ...state } });

const run = (rows: QueueRow[], notifyEnabled = true) => planQueuePositions(rows, { now: NOW, notifyEnabled, windowOpen: () => true });

describe("fila humana × atendimento da IA", () => {
  it('"Bom dia" → IA responde → fora da fila: o relógio não conta posição nem manda aviso', () => {
    // Cliente estava em 3º e escreveu "Bom dia"; a IA assumiu (status bot + aiActive).
    const maria = apply(waiting("maria", 30, 3), aiTakeoverPatch(), { aiActive: true, notifiedPosition: null });
    expect(maria).toMatchObject({ status: "bot", waitingSince: null });
    expect(isAiHandling(maria)).toBe(true);

    const rows = [waiting("ana", 40, 1), maria, waiting("joao", 20, 3)];
    const updates = run(rows);
    // Maria não aparece; João sobe de 3º para 2º (a vaga da Maria) e é o único avisado.
    expect(updates.map((item) => item.id)).toEqual(["joao"]);
    expect(updates[0]).toMatchObject({ position: 2, notify: expect.stringContaining("agora é o 2º da fila Atendimento Geral") });
    expect(updates.some((item) => item.id === "maria")).toBe(false);
  });

  it("mesmo se algo gravar status waiting sem limpar, conversa com IA ativa e status bot nunca é avisada", () => {
    const ai: QueueRow = { ...waiting("ia", 50, 9), status: "bot", menuState: { aiActive: true, notifiedPosition: 9 } };
    expect(run([ai, waiting("cliente", 10, 2)]).find((item) => item.id === "ia")).toBeUndefined();
  });

  it("transbordo → entra na fila Atendimento Geral agora → passa a ter posição real e recebe avisos", () => {
    const ai = apply(waiting("maria", 30), aiTakeoverPatch(), { aiActive: true });
    const handed = apply(ai, handoffPatch(GERAL, NOW), { aiActive: false, notifiedPosition: null });
    expect(handed).toMatchObject({ status: "waiting", queueId: GERAL, waitingSince: NOW });
    expect(isAiHandling(handed)).toBe(false);

    // Entra no fim da fila (chegou agora): 3º, sem aviso na primeira contagem.
    const first = run([waiting("ana", 40, 1), waiting("joao", 20, 2), handed]);
    const mariaFirst = first.find((item) => item.id === "maria")!;
    expect(mariaFirst).toMatchObject({ position: 3, notify: null });

    // Ana foi atendida: Maria avança para 2º e agora recebe o aviso de fila.
    const marked = { ...handed, menuState: { ...(handed.menuState as object), notifiedPosition: 3 } };
    const next = run([waiting("joao", 20, 2), marked]);
    expect(next.find((item) => item.id === "maria")).toMatchObject({ position: 2, notify: expect.stringContaining("Você avançou na fila: agora é o 2º") });
  });

  it("religar os avisos de fila não dispara aviso para conversas com a IA", () => {
    const rows = [
      waiting("ana", 40, 2),
      apply(waiting("bia", 35, 3), aiTakeoverPatch(), { aiActive: true }),
      apply(waiting("caio", 25, 4), aiTakeoverPatch(), { aiActive: true }),
      waiting("davi", 15, 5),
    ];
    // Avisos desligados: posições guardadas, nenhuma mensagem.
    expect(run(rows, false).every((item) => item.notify === null)).toBe(true);
    // Avisos religados: só quem espera um humano é contado e avisado.
    const updates = run(rows, true);
    expect(updates.map((item) => item.id).sort()).toEqual(["ana", "davi"]);
    expect(updates.filter((item) => item.notify).map((item) => item.id).sort()).toEqual(["ana", "davi"]);
    expect(updates.find((item) => item.id === "davi")).toMatchObject({ position: 2 });
  });

  it("conversa com atendente nunca é tratada como atendimento da IA", () => {
    expect(isAiHandling({ status: "bot", assigneeId: "user-1", menuState: { aiActive: true } })).toBe(false);
    expect(isAiHandling({ status: "bot", assigneeId: null, menuState: null })).toBe(false);
  });
});
