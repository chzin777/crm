import { describe, expect, it } from "vitest";
import { extractionFromSummary, parsePrescriptionDate, prescriptionFromExtraction, prescriptionSummariesFromNote } from "@/lib/prescriptions";
import { formatExtraction } from "@/lib/ai/document-extract";
import { productFromCard } from "@/lib/sales-pipeline";

const NOTE = "IA transferiu o atendimento para a fila Vendas (escolhida pela IA): Cliente enviou receita (dados extraídos pela IA, conferir no arquivo): Receita — OD: esf -2,00 | cil -1,00 | eixo 125°; OE: esf -2,50 | cil -0,75 | eixo 50°; Médico: Dr. Nasser Bahjat Hajj (CRM 18636); Data: 02 de abril de 2026";

describe("backfill: nota do transbordo → receituário", () => {
  it("lê a receita do Dr. Nasser gravada na nota antiga", () => {
    const [summary] = prescriptionSummariesFromNote(NOTE);
    expect(summary.startsWith("Receita — OD:")).toBe(true);
    const fields = prescriptionFromExtraction(extractionFromSummary(summary));
    expect(fields).toMatchObject({
      odEsferico: "-2,00", odCilindrico: "-1,00", odEixo: "125°",
      oeEsferico: "-2,50", oeCilindrico: "-0,75", oeEixo: "50°",
      medicoNome: "Dr. Nasser Bahjat Hajj", medicoCrm: "18636",
    });
    expect(fields.dataReceita?.toISOString().slice(0, 10)).toBe("2026-04-02");
  });

  it("ida e volta com o formato atual da IA (adição, DNP, observações) e várias receitas na mesma nota", () => {
    const summary = formatExtraction("receita", { receita: { od: { esferico: "+1,25", adicao: "+2,00" }, oe: { esferico: "+1,50", adicao: "+2,00" }, dnp: "62", medico: "Dra. Ana", crm: "CRM 999", data: "10/03/2026", observacoes: "uso contínuo" } });
    const fields = prescriptionFromExtraction(extractionFromSummary(summary));
    expect(fields).toMatchObject({ odAdicao: "+2,00", oeAdicao: "+2,00", dpTotal: "62", medicoNome: "Dra. Ana", medicoCrm: "999", observacoes: "uso contínuo", tipoLenteSugerido: "Multifocal" });
    expect(prescriptionSummariesFromNote(`Cliente enviou receita (dados extraídos pela IA, conferir no arquivo): ${summary} || Receita — graus não legíveis`)).toHaveLength(2);
    expect(extractionFromSummary("Receita — graus não legíveis")).toBeUndefined();
    expect(prescriptionSummariesFromNote("Cliente quer preço do Ray-Ban Meta.")).toEqual([]);
  });

  it("data por extenso", () => {
    expect(parsePrescriptionDate("15 de março de 2025")?.toISOString().slice(0, 10)).toBe("2025-03-15");
    expect(parsePrescriptionDate("31 de fevereiro de 2025")).toBeNull();
  });
});

describe("backfill: ficha de produto → interesse", () => {
  it("nome, referência e preço da ficha enviada pela IA", () => {
    const card = "Aqui estão os detalhes desse modelo! 😊\n\n🕶️ *Prada Linea Rossa | Ref. PS 07RV*\nⓂ️ *Modelo:* Armação de grau\n💵 *Valor:* R$ 1.290,00";
    expect(productFromCard(card)).toEqual({ name: "Prada Linea Rossa PS 07RV", price: 1290 });
    expect(productFromCard("Oi! Como posso ajudar?")).toBeNull();
  });
});
