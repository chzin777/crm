import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { parseSpreadsheet } from "@/lib/spreadsheet";

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

type Columns = { document: number; ddd: number; phone: number; name: number };

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
    name: find((key) => key === "nome" || key === "nomecliente" || key === "cliente"),
  };
}

/**
 * Cruza uma planilha (.xlsx/.csv) com os contatos que JÁ existem no CRM, por CPF/CNPJ e, na falta, telefone.
 * Não cria nem altera contatos: só devolve os ids encontrados para vincular ao segmento.
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

  const parsed = dataRows.map((row) => ({
    document: columns.document >= 0 ? documentKey(row[columns.document]) : null,
    phones: columns.phone >= 0 ? phoneKeys(columns.ddd >= 0 ? row[columns.ddd] : undefined, row[columns.phone]) : [],
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
  let notFound = 0;
  let withoutKey = 0;
  for (const row of parsed) {
    if (!row.document && row.phones.length === 0) { withoutKey++; continue; }
    const documentId = row.document ? byDocument.get(row.document) : undefined;
    const phoneId = documentId ? undefined : row.phones.map((phone) => byPhone.get(phone)).find(Boolean);
    const id = documentId ?? phoneId;
    if (!id) { notFound++; continue; }
    if (documentId) matchedByDocument++;
    else matchedByPhone++;
    contactIds.add(id);
  }

  return NextResponse.json({
    fileName: file.name,
    rows: dataRows.length,
    contactIds: [...contactIds],
    linked: contactIds.size,
    matchedByDocument,
    matchedByPhone,
    notFound,
    withoutKey,
    columns: {
      document: columns.document >= 0 ? rows[headerIndex][columns.document] : null,
      phone: columns.phone >= 0 ? rows[headerIndex][columns.phone] : null,
      ddd: columns.ddd >= 0 ? rows[headerIndex][columns.ddd] : null,
    },
  });
}
