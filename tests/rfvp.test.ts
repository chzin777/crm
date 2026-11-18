import { describe, expect, it } from "vitest";
import { DEFAULT_RFVP, parseRfvpCode, readRfvpSettings, rfvpCode, rfvpProblems, rfvpSegment, rfvpTriggerMatches, rfvpVars, scorePunctuality, scoreRecency, scoreRfvp, segmentCaseSql } from "@/lib/rfvp";
import { evaluateCondition, triggerMatches } from "@/lib/automations/engine";
import { NODE_DEF, operatorsFor, validateGraph } from "@/lib/automations/nodes";

const s = DEFAULT_RFVP;

describe("RFV-P: notas", () => {
  it("recência por dias desde a última compra", () => {
    expect(scoreRecency(null, s)).toBe(1);
    expect(scoreRecency(10, s)).toBe(5);
    expect(scoreRecency(90, s)).toBe(4);
    expect(scoreRecency(400, s)).toBe(1);
  });
  it("pontualidade: sem crediário, % em dia, atraso médio e título grave", () => {
    expect(scorePunctuality(null, s)).toBe(s.punctuality.noCredit);
    expect(scorePunctuality({ due: 10, onTime: 10, avgDelay: 0, maxOverdueDays: 0 }, s)).toBe(5);
    expect(scorePunctuality({ due: 10, onTime: 5, avgDelay: 8, maxOverdueDays: 0 }, s)).toBe(3);
    expect(scorePunctuality({ due: 10, onTime: 10, avgDelay: 0, maxOverdueDays: 90 }, s)).toBe(1);
  });
  it("código 555-5 e parse", () => {
    const scores = scoreRfvp({ daysSinceLastPurchase: 5, purchases: 9, value: 9000, punctuality: { due: 4, onTime: 4, avgDelay: 0, maxOverdueDays: 0 } }, s);
    expect(rfvpCode(scores)).toBe("555-5");
    expect(parseRfvpCode("123-4")).toEqual({ r: 1, f: 2, v: 3, p: 4 });
    expect(parseRfvpCode("12-4")).toBeNull();
  });
});

describe("RFV-P: critérios", () => {
  it("faixa fora de ordem é recusada e volta ao padrão na leitura", () => {
    const bad = { ...s, recency: { cuts: [90, 30, 180, 365] as [number, number, number, number] } };
    expect(rfvpProblems(bad).length).toBeGreaterThan(0);
    expect(readRfvpSettings(bad).recency.cuts).toEqual(s.recency.cuts);
    expect(readRfvpSettings(bad, true).recency.cuts).toEqual([90, 30, 180, 365]);
    expect(rfvpProblems(s)).toEqual([]);
  });
});

describe("RFV-P: segmentos", () => {
  it("primeiro que casa vence", () => {
    expect(rfvpSegment({ r: 5, f: 5, v: 5, p: 5 })).toBe("campeoes_pagadores");
    expect(rfvpSegment({ r: 5, f: 5, v: 5, p: 1 })).toBe("alto_valor_risco");
    expect(rfvpSegment({ r: 1, f: 4, v: 2, p: 5 })).toBe("em_risco");
    expect(rfvpSegment({ r: 1, f: 1, v: 1, p: 5 })).toBe("inativos");
  });
  it("SQL do CASE espelha as regras", () => {
    const sql = segmentCaseSql({ r: "r", f: "f", v: "v", p: "p" });
    expect(sql.startsWith("CASE WHEN r BETWEEN 4 AND 5")).toBe(true);
    expect(sql.endsWith("ELSE 'inativos' END")).toBe(true);
  });
  it("variáveis da mensagem", () => {
    expect(rfvpVars({ code: "543-2", segment: "inadimplentes" })).toMatchObject({ "rfvp.codigo": "543-2", "rfvp.p": "2", "rfvp.segmento": "Inadimplentes" });
    expect(rfvpVars({ code: null, segment: null }, "rfvp.anterior")["rfvp.anterior.codigo"]).toBe("");
  });
});

describe("RFV-P: gatilho e condição", () => {
  const before = { code: "554-4", segment: "campeoes_pagadores" };
  it("P caiu para 2 ou menos (só ao cruzar)", () => {
    const config = { mode: "pillar", pillar: "p", operator: "lte", value: 2 };
    expect(rfvpTriggerMatches(config, before, { code: "554-2", segment: "alto_valor_risco" })).toBe(true);
    expect(rfvpTriggerMatches(config, { code: "554-2", segment: "alto_valor_risco" }, { code: "554-1", segment: "alto_valor_risco" })).toBe(false);
  });
  it("entrou no segmento e atingiu 555-5", () => {
    expect(rfvpTriggerMatches({ mode: "segment", segment: "alto_valor_risco" }, before, { code: "554-2", segment: "alto_valor_risco" })).toBe(true);
    expect(rfvpTriggerMatches({ mode: "code", code: "555-5" }, before, { code: "555-5", segment: "campeoes_pagadores" })).toBe(true);
    expect(rfvpTriggerMatches({ mode: "code", code: "555-5" }, { code: "555-5", segment: "x" }, { code: "555-5", segment: "y" })).toBe(false);
  });
  it("nó trigger_rfvp casa pelo motor", () => {
    const node = { id: "t", type: "trigger_rfvp", position: { x: 0, y: 0 }, data: { kind: "trigger_rfvp", label: "", config: { ...NODE_DEF.trigger_rfvp.defaults, mode: "any" } } };
    expect(triggerMatches(node as never, { type: "trigger_rfvp", before, after: { code: "454-4", segment: "campeoes_pagadores" } })).toBe(true);
    expect(validateGraph).toBeTypeOf("function");
  });
  it("condição por pilar e segmento", () => {
    const facts = { tags: [], stage: null, city: null, rfvp: { r: 5, f: 4, v: 4, p: 2, code: "544-2", segment: "alto_valor_risco" } };
    const run = (config: Record<string, unknown>) => evaluateCondition(config, { facts: facts as never, hour: 10, reply: null });
    expect(run({ field: "rfvp_v", operator: "gte", value: "4" })).toBe(true);
    expect(run({ field: "rfvp_p", operator: "lte", value: "2" })).toBe(true);
    expect(run({ field: "rfvp_p", operator: "gte", value: "3" })).toBe(false);
    expect(run({ field: "rfvp_segment", operator: "equals", value: "alto_valor_risco" })).toBe(true);
    expect(run({ field: "rfvp_code", operator: "equals", value: "544-2" })).toBe(true);
    expect(evaluateCondition({ field: "rfvp_r", operator: "gte", value: "1" }, { facts: { tags: [], stage: null, city: null } as never, hour: 10, reply: null })).toBe(false);
    expect(operatorsFor("rfvp_p").map((item) => item.value)).toContain("lte");
  });
});
