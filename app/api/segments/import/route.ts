import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import { invalidateCache } from "@/lib/cache";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 50_000;

const normalizeHeader = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const digitsOf = (value: string | undefined) => (value ?? "").replace(/\D/g, "");

/** CPF/CNPJ só com números; repõe zeros à esquerda que o Excel apaga em colunas numéricas. */
function documentKey(value: string | undefined) {
  const digits = digitsOf(value);
  if (digits.length >= 9 && digits.length <= 11) return digits.padStart(11, "0");
  if (digits.length >= 12 && digits.length <= 14) return digits.padStart(14, "0");
  return null;
}

/** Telefone como gravado no CRM (DDD + número), com e sem o 9 do celular. */
function phoneKeys(ddd: string | undefined, phone: string | undefined) {
  let digits = digitsOf(phone);
  const dddDigits = digitsOf(ddd).replace(/^0+/, "");
  if (digits.length >= 8 && digits.length <= 9 && dddDigits.length === 2) digits = dddDigits + digits;
  digits = digits.replace(/^0+/, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return [];
  const keys = [digits];
  if (digits.length === 11 && digits[2] === "9") keys.push(digits.slice(0, 2) + digits.slice(3));
  if (digits.length === 10) keys.push(`${digits.slice(0, 2)}9${digits.slice(2)}`);
  return keys;
}

/** Data da planilha ("23/07/2025", "2025-07-23" ou serial do Excel) em "AAAA-MM-DD"; null se não reconhecer. */
function isoDay(value: string | undefined) {
  const text = (value ?? "").trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return iso[0];
  if (/^\d{5}(\.\d+)?$/.test(text)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86_400_000).toISOString().slice(0, 10);
  return null;
}

type Columns = { document: number; ddd: number; phone: number; name: number; store: number; lastPurchase: number };

function detectColumns(header: string[]): Columns {
  const keys = header.map(normalizeHeader);
  const find = (test: (key: string) => boolean) => keys.findIndex(test);
  const phone = [
    find((key) => key === "telefonecelular" || key === "celular"),
    find((key) => (key.includes("celular") || key.includes("whatsapp")) && !key.includes("ddd")),
    find((key) => (key.includes("telefone") || key.includes("fone")) && !key.includes("ddd")),
    find((key) => key === "tel" || key === "telcelular"),
  ].find((index) => index >= 0) ?? -1;
  const dddCandidates = keys.map((key, index) => (key.includes("ddd") ? index : -1)).filter((index) => index >= 0);
  return {
    document: find((key) => key.includes("cpf") || key.includes("cnpj") || key === "documento"),
    ddd: dddCandidates.find((index) => keys[index].includes("celular")) ?? dddCandidates[0] ?? -1,
    phone,
    name: find((key) => key === "nome" || key === "nomecliente" || key === "cliente" || key === "nomecompleto"),
    store: find((key) => key === "loja" || key === "ultimaloja" || key === "codloja" || key === "unidade"),
    lastPurchase: find((key) => key.startsWith("ultimacompra") || key.startsWith("dataultimacompra")),
  };
}

/**
 * Cruza uma planilha (.xlsx/.csv) com os contatos do CRM, por CPF/CNPJ e, na falta, telefone.
 * Quem não existe na base é cadastrado na hora (nome, CPF, celular, loja e última compra) e entra no segmento.
 * Contatos já existentes não são alterados.
 */
export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie um arquivo .xlsx ou .csv." }, { status: 400 });
  if (!/\.(xlsx|csv|txt)$/i.test(file.name)) return NextResponse.json({ error: "Formato não suportado. Use .xlsx ou .csv." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Arquivo acima de 15 MB." }, { status: 400 });

  let rows: string[][];
  try {
    rows = parseSpreadsheet(file.name, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível ler a planilha." }, { status: 400 });
  }

  // Cabeçalho: primeira das 10 linhas iniciais com coluna de CPF/CNPJ ou telefone.
  const headerIndex = rows.slice(0, 10).findIndex((row) => {
    const columns = detectColumns(row);
    return columns.document >= 0 || columns.phone >= 0;
  });
  if (headerIndex < 0) {
    return NextResponse.json({ error: "Não encontrei as colunas CPF/CNPJ nem Telefone celular na planilha." }, { status: 400 });
  }
  const columns = detectColumns(rows[headerIndex]);
  const dataRows = rows.slice(headerIndex + 1, headerIndex + 1 + MAX_ROWS);

  const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "").toString().trim() : "");
  const parsed = dataRows.map((row) => ({
    document: columns.document >= 0 ? documentKey(row[columns.document]) : null,
    phones: columns.phone >= 0 ? phoneKeys(columns.ddd >= 0 ? row[columns.ddd] : undefined, row[columns.phone]) : [],
    name: cell(row, columns.name).replace(/\s+/g, " "),
    store: cell(row, columns.store).replace(/^0+(?=\d)/, "") || null,
    lastPurchase: isoDay(cell(row, columns.lastPurchase)),
  }));
  const documents = [...new Set(parsed.flatMap((row) => (row.document ? [row.document] : [])))];
  const phones = [...new Set(parsed.flatMap((row) => row.phones))];

  // Duas consultas pelos índices de cpf e phone. Com cadastros repetidos, fica o que tem telefone.
  const [byDocumentRows, byPhoneRows] = await Promise.all([
    documents.length
      ? prisma.$queryRaw<{ id: string; cpf: string }[]>`
          SELECT DISTINCT ON (cpf) id, cpf FROM "Contact"
          WHERE cpf = ANY(${documents}::text[])
          ORDER BY cpf, (COALESCE(phone, '') <> '') DESC, id`
      : Promise.resolve([]),
    phones.length
      ? prisma.$queryRaw<{ id: string; phone: string }[]>`
          SELECT DISTINCT ON (phone) id, phone FROM "Contact"
          WHERE phone = ANY(${phones}::text[])
          ORDER BY phone, id`
      : Promise.resolve([]),
  ]);
  const byDocument = new Map(byDocumentRows.map((row) => [row.cpf, row.id]));
  const byPhone = new Map(byPhoneRows.map((row) => [row.phone, row.id]));

  const contactIds = new Set<string>();
  let matchedByDocument = 0;
  let matchedByPhone = 0;
  let withoutKey = 0;
  // Linhas sem cadastro, uma por cliente: chave "cpf:<cpf>" (mesma do ERP, para a sincronização reaproveitar) ou "planilha:<celular>".
  const missing = new Map<string, (typeof parsed)[number]>();
  const missingRows: string[] = [];
  for (const row of parsed) {
    if (!row.document && row.phones.length === 0) { withoutKey++; continue; }
    const documentId = row.document ? byDocument.get(row.document) : undefined;
    const phoneId = documentId ? undefined : row.phones.map((phone) => byPhone.get(phone)).find(Boolean);
    const id = documentId ?? phoneId;
    if (!id) {
      const key = row.document ? `cpf:${row.document}` : `planilha:${row.phones[0]}`;
      if (!missing.has(key)) missing.set(key, row);
      missingRows.push(key);
      continue;
    }
    if (documentId) matchedByDocument++;
    else matchedByPhone++;
    contactIds.add(id);
  }

  // Cadastra quem não existe; skipDuplicates evita erro se o ERP criou o mesmo cliente nesse meio-tempo.
  const newKeys = [...missing.keys()];
  let created = 0;
  for (let start = 0; start < newKeys.length; start += 2000) {
    const chunk = newKeys.slice(start, start + 2000);
    const result = await prisma.contact.createMany({
      data: chunk.map((sourceKey) => {
        const row = missing.get(sourceKey)!;
        return {
          sourceKey,
          name: row.name || (row.phones[0] ? `Cliente ${row.phones[0]}` : "Cliente da planilha"),
          cpf: row.document,
          phone: row.phones[0] ?? null,
          store: row.store,
          lastPurchaseDate: row.lastPurchase,
        };
      }),
      skipDuplicates: true,
    });
    created += result.count;
  }
  const createdIds = new Map<string, string>();
  for (let start = 0; start < newKeys.length; start += 5000) {
    const rowsFound = await prisma.contact.findMany({ where: { sourceKey: { in: newKeys.slice(start, start + 5000) } }, select: { id: true, sourceKey: true } });
    for (const row of rowsFound) createdIds.set(row.sourceKey, row.id);
  }
  let notFound = 0;
  for (const key of missingRows) {
    const id = createdIds.get(key);
    if (id) contactIds.add(id);
    else notFound++;
  }
  if (created > 0) await invalidateCache("dashboard", "audience:store:");

  return NextResponse.json({
    fileName: file.name,
    rows: dataRows.length,
    contactIds: [...contactIds],
    linked: contactIds.size,
    matchedByDocument,
    matchedByPhone,
    created,
    notFound,
    withoutKey,
    columns: {
      document: columns.document >= 0 ? rows[headerIndex][columns.document] : null,
      phone: columns.phone >= 0 ? rows[headerIndex][columns.phone] : null,
      ddd: columns.ddd >= 0 ? rows[headerIndex][columns.ddd] : null,
    },
  });
}
