import { describe, expect, it } from "vitest";
import { buildContactSearch, formatCpf, normalizeCpf } from "@/lib/contact-search";
import { buildPurchaseOrders, categoryLabel, productReference, summarizePurchases, type PurchaseItemRow } from "@/lib/purchase-history";

describe("busca de contatos por CPF", () => {
  it("CPF com e sem pontuação gera o mesmo filtro exato", () => {
    const plain = buildContactSearch("12345678900");
    const masked = buildContactSearch("123.456.789-00");
    expect(plain).toEqual(masked);
    expect(plain).toEqual({ OR: [{ cpfDigits: "12345678900" }, { phoneDigits: { contains: "12345678900" } }] });
  });

  it("repõe zeros à esquerda perdidos no ERP", () => {
    expect(normalizeCpf("5255840726")).toBe("05255840726");
    expect(formatCpf("5255840726")).toBe("052.558.407-26");
    expect(buildContactSearch("052.558.407-26")).toEqual({ OR: [{ cpfDigits: "05255840726" }, { phoneDigits: { contains: "05255840726" } }] });
  });

  it("trecho numérico busca CPF por prefixo e telefone", () => {
    expect(buildContactSearch("123.456")).toEqual({ OR: [{ cpfDigits: { startsWith: "123456" } }, { phoneDigits: { contains: "123456" } }] });
  });

  it("telefone com DDI 55 e máscara procura o número nacional", () => {
    const where = buildContactSearch("+55 (62) 99918-3799") as { OR: Record<string, unknown>[] };
    expect(where.OR).toContainEqual({ phoneDigits: { contains: "62999183799" } });
  });

  it("nome exige todas as palavras e e-mail usa o campo de e-mail", () => {
    expect(buildContactSearch("maria souza")).toEqual({ OR: [
      { AND: [{ name: { contains: "maria", mode: "insensitive" } }, { name: { contains: "souza", mode: "insensitive" } }] },
      { email: { startsWith: "maria souza", mode: "insensitive" } },
    ] });
    expect(buildContactSearch("a@b.com")).toEqual({ OR: [{ email: { contains: "a@b.com", mode: "insensitive" } }] });
    expect(buildContactSearch("   ")).toEqual({});
  });
});

const row = (over: Partial<PurchaseItemRow>): PurchaseItemRow => ({
  key: Math.random().toString(36), store: "12", seller: "GERALDINA LEMES", orderNumber: "51547", invoiceNumber: "9979",
  orderDate: new Date("2026-11-07T00:00:00Z"), type: "Venda", category: "OCULOS SOLAR", subcategory: "OCS METAL", productCode: "146611",
  description: "OCS VOGUE REF 0VO4329S 280/7355", brand: "VOGUE", quantity: "1.000", amount: "502.00", discount: "98.00",
  payment: "VISA PARCELADO", paymentTerms: "5 PARCELAS", ...over,
});
const stores = [{ number: 7, name: "LJ 12 BURITI SHOPPING" }, { number: 8, name: "LJ 05 SETOR MARISTA" }];

describe("histórico de compras do VMSet", () => {
  const orders = buildPurchaseOrders([
    row({}),
    row({ invoiceNumber: "316660", category: "LENTES", subcategory: "PROGRESSIVA", description: "PR ZEISS LIGHT 2 3D 1.60", brand: "CARL ZEISS", quantity: "2", amount: "1000.00", discount: "0" }),
    row({ store: "05", orderNumber: "100", invoiceNumber: "1", orderDate: "2025-01-10", seller: "ANA", category: "ARMACAO", description: "ARM RAY-BAN REF RB4165", brand: "RAY-BAN", amount: "300", discount: "0", payment: "PIX", paymentTerms: null }),
    row({ store: "12", orderNumber: "900", invoiceNumber: "2", orderDate: "2024-03-01", amount: "200", discount: "0" }),
    row({ store: "12", orderNumber: "900", invoiceNumber: "3", orderDate: "2024-04-01", type: "Devolucao Cliente", amount: "-200", discount: "0" }),
  ], stores);

  it("agrupa itens por loja + pedido, com nome da loja, notas, vendedor e pagamento", () => {
    const first = orders[0];
    expect(first.loja).toBe("LJ 12 BURITI SHOPPING");
    expect(first.pedido).toBe("51547");
    expect(first.notas).toEqual(["9979", "316660"]);
    expect(first.vendedor).toBe("GERALDINA LEMES");
    expect(first.itens).toHaveLength(2);
    expect(first.valorLiquido).toBe(1502);
    expect(first.desconto).toBe(98);
    expect(first.pagamento).toEqual(["VISA PARCELADO · 5 PARCELAS"]);
    expect(first.itens[0]).toMatchObject({ marca: "VOGUE", referencia: "0VO4329S 280/7355", categoria: "Óculos de sol", quantidade: 1, valorUnitario: 502 });
    expect(first.itens[1]).toMatchObject({ categoria: "Lentes oftálmicas", quantidade: 2, valorUnitario: 500 });
    expect(orders[1]).toMatchObject({ loja: "LJ 05 SETOR MARISTA", data: "2025-01-10", vendedor: "ANA", pagamento: ["PIX"] });
  });

  it("separa devoluções e calcula LTV, pedidos, ticket médio e loja mais frequente", () => {
    expect(orders.find((order) => order.tipo === "devolucao")?.valorLiquido).toBe(200);
    expect(summarizePurchases(orders)).toEqual({
      totalGasto: 1802, pedidos: 3, ticketMedio: 600.67, lojaFrequente: "LJ 12 BURITI SHOPPING", primeiraCompra: "2024-03-01", ultimaCompra: "2026-11-07",
    });
    expect(summarizePurchases([])).toMatchObject({ totalGasto: 0, pedidos: 0, ticketMedio: 0, lojaFrequente: null });
  });

  it("loja sem cadastro aparece pelo código e categorias ficam em português", () => {
    expect(buildPurchaseOrders([row({ store: "77" })], stores)[0].loja).toBe("LJ 77");
    expect(categoryLabel("LENTES DE CONTATO")).toBe("Lentes de contato");
    expect(categoryLabel("ARMACAO")).toBe("Armação de grau");
    expect(productReference("OCS MARESIA REF- PRAIA DO FUTURO - C600")).toBe("PRAIA DO FUTURO - C600");
  });
});
