import { describe, expect, it } from "vitest";
import { dedupeRecipients, summarizeSegmentOverlap } from "@/lib/campaign-audience";

const r = (id: string, telefone: string, origens?: string[]) => ({ id, telefone, origens });

describe("dedupeRecipients", () => {
  it("remove o mesmo contato e o mesmo celular em formatos diferentes, somando as origens", () => {
    const { unique, removed } = dedupeRecipients([
      r("a", "62999990000", ["VIP"]),
      r("a", "62999990000", ["Loja 13"]),
      r("b", "5562999990000", ["Loja 14"]),
      r("c", "(62) 9999-0000", ["Loja 18"]),
      r("d", "62988887777", ["VIP"]),
    ]);
    expect(unique.map((item) => item.id)).toEqual(["a", "d"]);
    expect(unique[0].origens).toEqual(["VIP", "Loja 13", "Loja 14", "Loja 18"]);
    expect(removed).toBe(3);
  });

  it("não junta contatos diferentes sem telefone", () => {
    expect(dedupeRecipients([r("a", ""), r("b", "")]).unique).toHaveLength(2);
  });
});

describe("summarizeSegmentOverlap", () => {
  it("calcula soma bruta, únicos, interseção e segmento contido", () => {
    const summary = summarizeSegmentOverlap([
      { label: "A", recipients: [r("1", "62911111111"), r("2", "62922222222"), r("3", "62933333333")] },
      { label: "B", recipients: [r("2", "62922222222"), r("4", "62944444444")] },
      { label: "C", recipients: [r("x", "5562911111111")] },
    ]);
    expect(summary.rawTotal).toBe(6);
    expect(summary.unique).toBe(4);
    expect(summary.inMultipleSegments).toBe(2);
    expect(summary.segments.map((segment) => [segment.label, segment.exclusive, segment.contained])).toEqual([["A", 1, false], ["B", 1, false], ["C", 0, true]]);
  });
});
