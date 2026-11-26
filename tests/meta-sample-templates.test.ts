import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMetaSampleTemplate, ownTemplates } from "@/lib/meta-sample-templates";

const SAMPLES = ["hello_world", "HELLO_WORLD", "sample_shipping_confirmation", "sample_issue_resolution", "sample_flight_confirmation", "Sample_purchase_feedback"];
const OWN = ["nps_atendimento_0_10", "nps_produto_adaptacao_0_10", "black_friday_2026", "lembrete_retirada_oculos", "hello_cliente", "exemplo_sample"];

describe("modelos de amostra da Meta ficam fora da interface", () => {
  it("hello_world, sample_* e modelos da biblioteca da Meta são amostras", () => {
    for (const name of SAMPLES) expect(isMetaSampleTemplate({ name })).toBe(true);
    expect(isMetaSampleTemplate({ name: "confirmacao_pedido", library_template_name: "order_confirmation_1" })).toBe(true);
    expect(isMetaSampleTemplate({ name: "confirmacao_pedido", library_template_name: "" })).toBe(false);
    expect(isMetaSampleTemplate(null)).toBe(false);
  });

  it("listagem e seletores mostram só os modelos da Óticas Brasil", () => {
    const all = [...SAMPLES, ...OWN].map((name) => ({ name, status: "APPROVED" }));
    expect(ownTemplates(all).map((template) => template.name)).toEqual(OWN);
    expect(ownTemplates(undefined)).toEqual([]);
  });

  it("a API de listagem (Meta) e todos os seletores aplicam o filtro", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    const api = read("lib/meta-whatsapp.ts");
    expect(api).toContain("!isMetaSampleTemplate(item)");
    expect(api).toContain("library_template_name");
    for (const file of [
      "app/modelos/page.tsx",
      "components/CampaignTemplatePicker.tsx",
      "components/chat/TemplatePicker.tsx",
      "components/chat/NewConversationDialog.tsx",
      "components/SendMessageDialog.tsx",
      "components/BulkSendMessageDialog.tsx",
      "components/automations/CommercialAutomations.tsx",
    ]) expect(read(file), file).toContain("ownTemplates(");
  });
});
