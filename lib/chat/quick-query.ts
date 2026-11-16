import { isValidCpf, maskCpf, summarizeInstallments, type InstallmentLookup } from "@/lib/ai/installments";
import {
  installmentsReply,
  prescriptionReply,
  purchasesReply,
  stockReply,
  type PrescriptionQuick,
  type PurchaseQuickItem,
  type QuickQueryKind,
  type StockQuickProduct,
} from "@/lib/chat/operational-context";

/**
 * Consultas rápidas do Copiloto VMSet (só leitura): faturas/crediário, estoque e preço, compras e OS, receituário.
 * Cada resultado traz linhas para o card e o texto pronto para "↪ Jogar na mensagem". Dependências injetadas.
 */

export type QuickQueryParams = { cpf?: string | null; name?: string | null; term?: string | null };
export type QuickQueryLine = { label: string; value: string; amount?: string; tone?: "ok" | "warn" | "danger" | "muted"; link?: string };
export type QuickQueryResult = {
  kind: QuickQueryKind;
  ok: boolean;
  title: string;
  subtitle?: string;
  lines: QuickQueryLine[];
  /** Mensagem amigável para o cliente; null quando não há o que enviar (erro, ambiguidade). */
  reply: string | null;
  /** Nome ambíguo: o operador escolhe o cadastro certo. */
  candidates?: { name: string; cpf: string; cpfMasked: string }[];
};

export type QuickQueryDeps = {
  lookupInstallments: (cpf: string) => Promise<InstallmentLookup>;
  /** Cadastros do CRM com CPF cujo nome bate com o pesquisado (até 5). */
  findByName: (name: string) => Promise<{ name: string; cpf: string }[]>;
  stock: (term: string) => Promise<{ status: "ok" | "unavailable"; products: StockQuickProduct[] }>;
  purchases: (input: { cpf: string | null; name: string | null; contactId: string | null }) => Promise<PurchaseQuickItem[]>;
  prescriptions: (contactId: string) => Promise<PrescriptionQuick[]>;
  now?: () => Date;
};

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dayBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "sem data");
const fail = (kind: QuickQueryKind, title: string, message: string): QuickQueryResult => ({ kind, ok: false, title, lines: [{ label: "Aviso", value: message, tone: "warn" }], reply: null });

/** CPF informado ou, sem ele, o único cadastro com aquele nome. Vários → o operador escolhe. */
async function resolveIdentity(kind: QuickQueryKind, params: QuickQueryParams, deps: QuickQueryDeps): Promise<{ cpf: string; name: string | null } | QuickQueryResult> {
  const cpf = digits(params.cpf);
  if (cpf.length === 11) {
    if (!isValidCpf(cpf)) return fail(kind, "CPF inválido", "Confira os 11 números do CPF e tente novamente.");
    return { cpf, name: params.name?.trim() || null };
  }
  const name = params.name?.trim();
  if (!name || name.length < 3) return fail(kind, "Informe CPF ou nome", "Digite o CPF (11 números) ou o nome completo do cliente.");
  const found = await deps.findByName(name);
  if (found.length === 1) return { cpf: digits(found[0].cpf), name: found[0].name };
  if (!found.length) return fail(kind, "Cadastro não encontrado", `Nenhum cadastro com CPF para "${name}". Peça o CPF ao cliente.`);
  return { kind, ok: false, title: "Vários cadastros com esse nome", subtitle: "Escolha o cliente certo", lines: [], reply: null, candidates: found.map((item) => ({ name: item.name, cpf: digits(item.cpf), cpfMasked: maskCpf(digits(item.cpf)) })) };
}

export async function runQuickQuery(input: { kind: QuickQueryKind; params: QuickQueryParams; contactId?: string | null }, deps: QuickQueryDeps): Promise<QuickQueryResult> {
  const { kind, params } = input;

  if (kind === "faturas") {
    const identity = await resolveIdentity(kind, params, deps);
    if ("kind" in identity) return identity;
    const lookup = await deps.lookupInstallments(identity.cpf);
    if (lookup.status !== "ok") return fail(kind, "VMSet indisponível", "Não foi possível consultar o crediário agora. Tente de novo em instantes.");
    if (!lookup.found) return fail(kind, `CPF ${maskCpf(identity.cpf)}`, "Nenhum cadastro no VMSet com esse CPF.");
    const today = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    const summary = summarizeInstallments(lookup.items, today);
    const name = lookup.name ?? identity.name;
    return {
      kind,
      ok: true,
      title: `Faturas de ${name ?? "cliente"}`,
      subtitle: `CPF ${maskCpf(identity.cpf)}`,
      lines: [
        { label: "Em aberto", value: `${summary.abertas} parcela${summary.abertas === 1 ? "" : "s"}`, tone: summary.abertas ? "warn" : "ok" },
        { label: "Pagas", value: String(summary.pagas), tone: "ok" },
        { label: "Total pendente", value: brl(summary.valorAberto), tone: summary.valorAberto ? "warn" : "ok" },
        ...(summary.atrasadas ? [{ label: "Vencidas", value: String(summary.atrasadas), tone: "danger" as const }] : []),
        ...summary.parcelasAbertas.slice(0, 6).map((item) => ({ label: `Parcela ${item.parcela}`, value: `${brl(item.valor)} · ${dayBr(item.vencimento)} · ${item.atrasada ? "vencida" : "aberta"}`, tone: item.atrasada ? ("danger" as const) : ("muted" as const) })),
      ],
      reply: installmentsReply(name, summary),
    };
  }

  if (kind === "estoque") {
    const term = params.term?.trim();
    if (!term || term.length < 2) return fail(kind, "Informe o produto", "Digite a referência, a marca ou o modelo.");
    const result = await deps.stock(term);
    if (result.status !== "ok") return fail(kind, "VMSet indisponível", "Não foi possível consultar o estoque agora.");
    if (!result.products.length) return { kind, ok: true, title: term, subtitle: "Nada encontrado no catálogo", lines: [], reply: stockReply([]) };
    return {
      kind,
      ok: true,
      title: `Estoque de ${term}`,
      lines: result.products.slice(0, 3).flatMap((product) => [
        { label: product.produto, value: `${product.preco ?? "sem preço"} · ${product.total} un. na rede`, tone: product.total ? ("ok" as const) : ("warn" as const) },
        ...product.lojas.slice(0, 6).map((store) => ({ label: store.loja, value: `${store.quantidade} un.`, tone: "muted" as const })),
      ]),
      reply: stockReply(result.products),
    };
  }

  if (kind === "compras") {
    const cpf = digits(params.cpf);
    const name = params.name?.trim() || null;
    if (cpf.length !== 11 && (!name || name.length < 3) && !input.contactId) return fail(kind, "Informe CPF ou nome", "Digite o CPF ou o nome do cliente.");
    const purchases = await deps.purchases({ cpf: cpf.length === 11 ? cpf : null, name, contactId: input.contactId ?? null });
    return {
      kind,
      ok: true,
      title: `Compras e OS${name ? ` de ${name}` : ""}`,
      subtitle: purchases.length ? `${purchases.length} pedido${purchases.length > 1 ? "s" : ""} recente${purchases.length > 1 ? "s" : ""}` : "Nenhuma compra no espelho do VMSet",
      lines: purchases.slice(0, 5).map((item) => ({ label: `${dayBr(item.data)}${item.pedido ? ` · Pedido ${item.pedido}` : ""}${item.loja ? ` · ${item.loja}` : ""}`, value: item.itens.join(", "), ...(item.total ? { amount: brl(item.total) } : {}), tone: "muted" as const })),
      reply: purchasesReply(name, purchases),
    };
  }

  if (!input.contactId) return fail(kind, "Sem contato", "Abra uma conversa para ver o receituário.");
  const items = await deps.prescriptions(input.contactId);
  return {
    kind,
    ok: true,
    title: "Receituário",
    subtitle: items.length ? `${items.length} receita${items.length > 1 ? "s" : ""}` : "Nenhuma receita salva",
    lines: items.slice(0, 4).flatMap((item) => [
      { label: `${item.data ?? "Sem data"}${item.medico ? ` · ${item.medico}` : ""}`, value: "", tone: "ok" as const, ...(item.anexo ? { link: item.anexo } : {}) },
      { label: "OD", value: item.od, tone: "muted" as const },
      { label: "OE", value: item.oe, tone: "muted" as const },
    ]),
    reply: prescriptionReply(params.name ?? null, items),
  };
}
