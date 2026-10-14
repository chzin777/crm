import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "../generated/prisma/client.ts";

if (!process.argv[2]) throw new Error('Provide the CSV path: npm run db:stores -- "C:\\path\\to\\lojas.csv"');

for (const key of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[key]) throw new Error(`Set ${key} in .env before importing.`);
}
const url = new URL("postgresql://localhost");
url.hostname = process.env.DB_HOST;
url.port = process.env.DB_PORT;
url.username = process.env.DB_USER;
url.password = process.env.DB_PASSWORD;
url.pathname = `/${process.env.DB_NAME}`;
url.searchParams.set("schema", "public");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });

// The sales export stores the unit id as a base-26 string (a = 0 ... z = 25).
const decodeUnitId = (value) => [...value].reduce((total, char) => total * 26n + BigInt(char.charCodeAt(0) - 97), 0n).toString();

// Codes 101-139, 10xx-11xx and 2202 are extra units of an existing store; 999 is the head office.
function canonicalCode(code) {
  if (code >= 1000 && code < 1200) code -= 1000;
  if (code >= 101 && code <= 139) return code - 100;
  if (code === 2202) return 202;
  return code;
}

const records = parse(readFileSync(resolve(process.argv[2]), "utf8").replace(/^\uFEFF/, ""), {
  columns: true, delimiter: ";", skip_empty_lines: true, relax_column_count: true,
});

const stores = new Map();
for (const record of records) {
  const rawCode = Number(record.UNEM_CODIGO);
  if (!Number.isInteger(rawCode) || rawCode === 999) continue;
  const number = canonicalCode(rawCode);
  const unitId = (record.UNIDADE_EMPRESARIAL_ID ?? "").trim();
  const current = stores.get(number) ?? { number, unitIds: [], active: false, kind: null, startDate: null };
  if (unitId) current.unitIds.push(unitId);
  if (rawCode === number) {
    current.active = record.STATUS?.trim() === "Ativo";
    current.kind = record.UNEM_LOCAL_LOJA?.trim() || null;
    current.startDate = record.UNEM_INICIO_ATV?.trim() || null;
    current.isPrimary = true;
  } else if (!current.isPrimary && record.STATUS?.trim() === "Ativo") {
    current.active = true;
  }
  stores.set(number, current);
}

let created = 0;
let updated = 0;
for (const store of stores.values()) {
  const data = {
    active: store.active,
    kind: store.kind,
    startDate: store.startDate,
    unitIds: [...new Set(store.unitIds)].map(decodeUnitId).filter(Boolean),
  };
  const existing = await prisma.store.findUnique({ where: { number: store.number } });
  if (existing) {
    await prisma.store.update({ where: { number: store.number }, data });
    updated += 1;
  } else {
    await prisma.store.create({ data: { number: store.number, name: `Loja ${store.number}`, neighborhoods: [], ...data } });
    created += 1;
  }
}

const removed = await prisma.store.deleteMany({
  where: { number: { notIn: [...stores.keys()] }, neighborhoods: { isEmpty: true } },
});
console.log(`Lojas criadas: ${created}, atualizadas: ${updated}, placeholders removidos: ${removed.count}`);
await prisma.$disconnect();
