import { createReadStream, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { PrismaPg } from "@prisma/adapter-pg";
import { parse } from "csv-parse";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { PrismaClient } from "../generated/prisma/client.ts";

if (!process.argv[2]) {
  throw new Error('Provide the CSV path: npm run db:import -- "C:\\path\\to\\file.csv"');
}

const filePath = resolve(process.argv[2]);
const replaceExisting = process.argv.includes("--replace");
const batchSize = 1000;

for (const key of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[key]) throw new Error(`Set ${key} in .env before importing.`);
}

const connectionUrl = new URL("postgresql://localhost");
connectionUrl.hostname = process.env.DB_HOST;
connectionUrl.port = process.env.DB_PORT;
connectionUrl.username = process.env.DB_USER;
connectionUrl.password = process.env.DB_PASSWORD;
connectionUrl.pathname = `/${process.env.DB_NAME}`;
connectionUrl.searchParams.set("schema", "public");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionUrl.toString() }),
});
const pgClient = new Client({ connectionString: connectionUrl.toString() });
const sourceFile = filePath;
const inputSize = statSync(filePath).size;
const normalize = (value) => (value ?? "").trim();

function createSourceKey(record, rowNumber) {
  const cpf = normalize(record.PARCEIRO_CPF).replace(/\D/g, "");
  if (cpf) return `cpf:${cpf}`;

  const email = normalize(record.EMAIL).toLocaleLowerCase("pt-BR");
  if (email) return `email:${email}`;

  const phone = (normalize(record.CELULAR) || normalize(record.TELEFONE)).replace(/\D/g, "");
  if (phone) return `phone:${phone}`;

  return `row:${rowNumber}`;
}

function toContact(record, sourceKey) {
  const phone = normalize(record.CELULAR) || normalize(record.TELEFONE);
  return {
    sourceKey,
    name: normalize(record.NOME_CLIENTE) || "Contato sem nome",
    cpf: normalize(record.PARCEIRO_CPF).replace(/\D/g, "") || null,
    phone: phone || null,
    email: normalize(record.EMAIL) || null,
    birthDate: normalize(record.NASCIMENTO) || null,
    gender: normalize(record.SEXO) || null,
    occupation: normalize(record.PROFISSAO) || null,
    city: normalize(record.NOME_CIDADE) || null,
    neighborhood: normalize(record.NOME_BAIRRO) || null,
    state: normalize(record.UF) || null,
    store: normalize(record.LOJA) || null,
    segment: normalize(record.NOME_CATEGORIA) || normalize(record.NOME_SUBCATEGORIA) || null,
  };
}

function csvField(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function* readRecords() {
  const parser = createReadStream(filePath).pipe(parse({
    bom: true,
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
  }));
  for await (const record of parser) yield record;
}

async function importContacts() {
  let records = 0;
  let insertedContacts = 0;
  let contactBatch = [];

  for await (const record of readRecords()) {
    records += 1;
    const sourceKey = createSourceKey(record, records + 1);
    contactBatch.push(toContact(record, sourceKey));

    if (contactBatch.length >= batchSize) {
      const result = await prisma.contact.createMany({ data: contactBatch, skipDuplicates: true });
      insertedContacts += result.count;
      contactBatch = [];
    }
    if (records % 50000 === 0) {
      console.log(`Contact scan: ${records.toLocaleString("en-US")} rows processed.`);
    }
  }

  if (contactBatch.length) {
    const result = await prisma.contact.createMany({ data: contactBatch, skipDuplicates: true });
    insertedContacts += result.count;
  }
  console.log(`Contact scan complete: ${records.toLocaleString("en-US")} rows; ${insertedContacts.toLocaleString("en-US")} new contacts.`);
  return records;
}

async function importSales() {
  let records = 0;
  const copyStream = pgClient.query(copyFrom(
    'COPY "ImportedSale" ("sourceFile", "sourceRow", "sourceKey", "data") FROM STDIN WITH (FORMAT csv)',
  ));
  const source = Readable.from((async function* () {
    for await (const record of readRecords()) {
      records += 1;
      const sourceKey = createSourceKey(record, records + 1);
      const row = [
        sourceFile,
        records + 1,
        sourceKey,
        JSON.stringify(record),
      ].map(csvField).join(",") + "\n";
      if (records % 50000 === 0) {
        console.log(`Sales import: ${records.toLocaleString("en-US")} rows streamed.`);
      }
      yield row;
    }
  })());

  await pipeline(source, copyStream);
  return records;
}

async function updateContactAggregates() {
  await pgClient.query(`
    WITH amounts AS (
      SELECT
        "sourceKey",
        COUNT(DISTINCT COALESCE(
          NULLIF("data"->>'NUM_PEDIDO', ''),
          NULLIF("data"->>'NUM_NOTA', ''),
          'row:' || "sourceRow"::text
        ))::integer AS purchases,
        SUM(
          CASE
            WHEN amount.value ~ '^-?[0-9][0-9.]*,[0-9]{1,2}$'
              THEN replace(replace(amount.value, '.', ''), ',', '.')::numeric
            WHEN amount.value ~ '^-?[0-9]+(\\.[0-9]{1,2})?$'
              THEN amount.value::numeric
            ELSE 0
          END
        ) AS total_spent
      FROM "ImportedSale"
      CROSS JOIN LATERAL (
        SELECT regexp_replace(COALESCE("data"->>'VALOR_ITEM_VENDA', ''), '[^0-9,.-]', '', 'g') AS value
      ) AS amount
      WHERE "sourceFile" = $1
      GROUP BY "sourceKey"
    ),
    latest AS (
      SELECT DISTINCT ON ("sourceKey")
        "sourceKey",
        "data"
      FROM "ImportedSale"
      WHERE "sourceFile" = $1
      ORDER BY "sourceKey", "sourceRow" DESC
    )
    UPDATE "Contact" AS contact
    SET
      "purchases" = amounts.purchases,
      "totalSpent" = amounts.total_spent,
      "lastPurchaseDate" = NULLIF(latest."data"->>'DATA_PEDIDO', ''),
      "name" = COALESCE(NULLIF(latest."data"->>'NOME_CLIENTE', ''), contact."name"),
      "phone" = COALESCE(NULLIF(latest."data"->>'CELULAR', ''), NULLIF(latest."data"->>'TELEFONE', ''), contact."phone"),
      "email" = COALESCE(NULLIF(latest."data"->>'EMAIL', ''), contact."email"),
      "store" = COALESCE(NULLIF(latest."data"->>'LOJA', ''), contact."store"),
      "updatedAt" = NOW()
    FROM amounts
    JOIN latest USING ("sourceKey")
    WHERE contact."sourceKey" = amounts."sourceKey"
  `, [sourceFile]);
}

try {
  const fileStats = statSync(filePath);
  console.log(`Starting import of ${basename(filePath)} (${(fileStats.size / 1024 / 1024).toFixed(1)} MB).`);
  await pgClient.connect();

  const existing = await prisma.importedSale.count({ where: { sourceFile } });
  if (existing && !replaceExisting) {
    throw new Error(`This source already has ${existing.toLocaleString("en-US")} imported rows. Use --replace to replace only this file's imported rows.`);
  }
  if (existing) {
    await prisma.importedSale.deleteMany({ where: { sourceFile } });
    console.log("Removed the existing rows for this source file before reimporting.");
  }

  await importContacts();
  const importedRows = await importSales();
  await updateContactAggregates();
  await pgClient.query('REFRESH MATERIALIZED VIEW CONCURRENTLY "DailySalesSummary"');
  console.log(`Import complete: ${importedRows.toLocaleString("en-US")} sale rows (${(inputSize / 1024 / 1024).toFixed(1)} MB) and unique contacts loaded.`);
} catch (error) {
  console.error("Import failed. No CSV contents or database credentials were logged.");
  console.error(error instanceof Error ? error.message : "Unknown import error.");
  process.exitCode = 1;
} finally {
  await pgClient.end().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
