/**
 * Histórico de compras do cliente a partir do espelho do VMSet (VmsetSale, um registro por item).
 * Puro: agrupa os itens em pedidos (loja + número do pedido) e calcula o resumo. Usado pela API e pelos testes.
 */
import { storeNameForErpCode } from "@/lib/stores";

export interface PurchaseItemRow {
  key: string;
  store: string | null;
  seller: string | null;
  orderNumber: string | null;
  invoiceNumber: string | null;
  orderDate: Date | string | null;
  type: string | null;
  category: string | null;
  subcategory: string | null;
  productCode: string | null;
  description: string | null;
  brand: string | null;
  quantity: number | string | { toString(): string } | null;
  amount: number | string | { toString(): string } | null;
  discount: number | string | { toString(): string } | null;
  payment: string | null;
  paymentTerms: string | null;
}

export interface PurchaseItem {
  descricao: string;
  marca: string;
  referencia: string;
  categoria: string;
  subcategoria: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  desconto: number;
}

export interface PurchaseOrder {
  id: string;
  loja: string;
  lojaCodigo: string;
  data: string; // aaaa-mm-dd
  pedido: string;
  notas: string[];
  vendedor: string;
  tipo: "venda" | "devolucao";
  itens: PurchaseItem[];
  valorLiquido: number;
  desconto: number;
  pagamento: string[];
}

export interface PurchaseSummary {
  totalGasto: number;
  pedidos: number;
  ticketMedio: number;
  lojaFrequente: string | null;
  primeiraCompra: string | null;
  ultimaCompra: string | null;
}

const num = (value: PurchaseItemRow["amount"]) => {
  const parsed = Number(value === null || value === undefined ? 0 : String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value: number) => Math.round(value * 100) / 100;
const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

/** Categoria do ERP em português claro ("OCULOS SOLAR" -> "Óculos de sol"). */
const CATEGORY_LABELS: Record<string, string> = {
  ARMACAO: "Armação de grau",
  "OCULOS SOLAR": "Óculos de sol",
  LENTES: "Lentes oftálmicas",
  "LENTES DE CONTATO": "Lentes de contato",
  "LENTE PRONTA-ENTREGA RAPIDA": "Lentes pronta entrega",
  SERVICOS: "Serviços",
  ACESSORIOS: "Acessórios",
  DIVERSOS: "Diversos",
};
export function categoryLabel(category: string | null | undefined): string {
  const key = clean(category).toUpperCase();
  if (!key) return "Outros";
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  const lower = key.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Referência do modelo lida da descrição ("OCS VOGUE REF 0VO4329S 280/7355" -> "0VO4329S 280/7355"). */
export function productReference(description: string | null | undefined): string {
  const match = /\bREF\.?\s*[-:]?\s*(.+)$/i.exec(clean(description));
  return match ? match[1].trim() : "";
}

const isoDay = (value: PurchaseItemRow["orderDate"]) => {
  if (!value) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : "";
};

const isReturn = (type: string | null) => /devolu/i.test(type ?? "");

/** Agrupa os itens em pedidos (loja + pedido; sem número, pela nota ou pelo próprio item), do mais recente ao mais antigo. */
export function buildPurchaseOrders(rows: PurchaseItemRow[], stores: { number: number; name?: string | null }[]): PurchaseOrder[] {
  const orders = new Map<string, PurchaseOrder>();
  for (const row of rows) {
    const storeCode = clean(row.store).replace(/^0+(?=\d)/, "");
    const reference = clean(row.orderNumber) || (clean(row.invoiceNumber) ? `nota:${clean(row.invoiceNumber)}` : `item:${row.key}`);
    const kind: PurchaseOrder["tipo"] = isReturn(row.type) ? "devolucao" : "venda";
    const id = `${storeCode}-${reference}-${kind}`;
    let order = orders.get(id);
    if (!order) {
      order = {
        id,
        loja: storeNameForErpCode(stores, storeCode),
        lojaCodigo: storeCode,
        data: isoDay(row.orderDate),
        pedido: clean(row.orderNumber),
        notas: [],
        vendedor: clean(row.seller),
        tipo: kind,
        itens: [],
        valorLiquido: 0,
        desconto: 0,
        pagamento: [],
      };
      orders.set(id, order);
    }
    const day = isoDay(row.orderDate);
    if (day && (!order.data || day > order.data)) order.data = day;
    if (!order.vendedor && clean(row.seller)) order.vendedor = clean(row.seller);
    const invoice = clean(row.invoiceNumber);
    if (invoice && !order.notas.includes(invoice)) order.notas.push(invoice);
    const payment = [clean(row.payment), clean(row.paymentTerms)].filter(Boolean).join(" · ");
    if (payment && !order.pagamento.includes(payment)) order.pagamento.push(payment);

    const quantity = num(row.quantity) || 1;
    const total = Math.abs(num(row.amount));
    const discount = Math.abs(num(row.discount));
    order.itens.push({
      descricao: clean(row.description) || "Item",
      marca: clean(row.brand),
      referencia: productReference(row.description) || clean(row.productCode),
      categoria: categoryLabel(row.category),
      subcategoria: clean(row.subcategory),
      quantidade: quantity,
      valorUnitario: round2(total / quantity),
      valorTotal: round2(total),
      desconto: round2(discount),
    });
    order.valorLiquido = round2(order.valorLiquido + total);
    order.desconto = round2(order.desconto + discount);
  }
  return [...orders.values()].sort((a, b) => (b.data || "").localeCompare(a.data || "") || b.pedido.localeCompare(a.pedido, "pt-BR", { numeric: true }));
}

/** LTV, pedidos, ticket médio e loja mais frequentada (só vendas; devoluções descontam do total gasto). */
export function summarizePurchases(orders: PurchaseOrder[]): PurchaseSummary {
  const sales = orders.filter((order) => order.tipo === "venda");
  const returned = orders.filter((order) => order.tipo === "devolucao").reduce((sum, order) => sum + order.valorLiquido, 0);
  const gross = sales.reduce((sum, order) => sum + order.valorLiquido, 0);
  const total = round2(Math.max(0, gross - returned));
  const byStore = new Map<string, number>();
  for (const order of sales) byStore.set(order.loja, (byStore.get(order.loja) ?? 0) + 1);
  const topStore = [...byStore.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR", { numeric: true }))[0]?.[0] ?? null;
  const days = sales.map((order) => order.data).filter(Boolean).sort();
  return {
    totalGasto: total,
    pedidos: sales.length,
    ticketMedio: sales.length ? round2(total / sales.length) : 0,
    lojaFrequente: topStore,
    primeiraCompra: days[0] ?? null,
    ultimaCompra: days[days.length - 1] ?? null,
  };
}
